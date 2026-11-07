import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { normalizePlate } from '@/domain/plate';
import type { OdometerSource, ServiceType } from '@/domain/types';
import type { RefuelValue, ServiceValue, VehicleValue } from '@/domain/validation';

import {
  odometerReadings,
  outbox,
  photoUploads,
  refuels,
  reminderRules,
  serviceEvents,
  vehicles,
  type OdometerReading,
  type ReminderRule,
  type Refuel,
  type ServiceEvent,
  type Vehicle,
} from './schema';
import { columnKeyMap, PHOTO_COLUMNS, SYNC_TABLES, type SyncTableName } from './tables';
import type { Db } from './types';

export interface RepoDeps {
  db: Db;
  userId: string;
  newId: () => string;
  now?: () => number;
}

export interface OdometerPoint {
  timestamp: number;
  odometer: number;
  source: OdometerSource;
}

/** Child tables soft-deleted together with their vehicle. */
const VEHICLE_CHILDREN: SyncTableName[] = ['odometer_readings', 'refuels', 'service_events', 'reminder_rules'];

/**
 * All local writes go through here. Every write runs in one transaction that also appends
 * to the outbox, so a crash can never leave a change that the sync engine does not know about.
 */
export function createRepo({ db, userId, newId, now = Date.now }: RepoDeps) {
  // ---- generic helpers ---------------------------------------------------
  function enqueue(tx: Db, tableName: SyncTableName, rowId: string) {
    tx.insert(outbox).values({ tableName, rowId, createdAt: now() }).run();
  }

  function insertRow<T extends SyncTableName>(
    tx: Db,
    tableName: T,
    values: Record<string, unknown>,
    id: string = newId(),
  ): string {
    const t = now();
    const table = SYNC_TABLES[tableName];
     
    tx.insert(table).values({ ...values, id, userId, createdAt: t, updatedAt: t } as any).run();
    enqueue(tx, tableName, id);
    return id;
  }

  function updateRow(tx: Db, tableName: SyncTableName, id: string, patch: Record<string, unknown>) {
    const table = SYNC_TABLES[tableName];
    tx.update(table)
       
      .set({ ...patch, updatedAt: now() } as any)
      .where(and(eq(table.id, id), eq(table.userId, userId)))
      .run();
    enqueue(tx, tableName, id);
  }

  function softDelete(tx: Db, tableName: SyncTableName, id: string) {
    updateRow(tx, tableName, id, { deletedAt: now() });
  }

  /** Record a freshly captured photo: show it locally now, upload it during the next sync. */
  function attachPhoto(tx: Db, tableName: SyncTableName, rowId: string, pathColumn: string, localUri: string | null) {
    const localCol = PHOTO_COLUMNS[pathColumn];
    if (!localCol) throw new Error(`Unknown photo column ${pathColumn}`);
    const keys = columnKeyMap(SYNC_TABLES[tableName]);
    const localKey = keys.get(localCol)!;
    const pathKey = keys.get(pathColumn)!;
    // Drop any queued upload for the previous photo in this slot.
    tx.delete(photoUploads)
      .where(
        and(
          eq(photoUploads.tableName, tableName),
          eq(photoUploads.rowId, rowId),
          eq(photoUploads.pathColumn, pathColumn),
        ),
      )
      .run();
    if (localUri) {
      updateRow(tx, tableName, rowId, { [localKey]: localUri });
      tx.insert(photoUploads).values({ tableName, rowId, pathColumn, localUri }).run();
    } else {
      updateRow(tx, tableName, rowId, { [localKey]: null, [pathKey]: null });
    }
  }

  const live = <T extends { deletedAt: unknown; userId: unknown }>(t: T) =>
     
    and(isNull((t as any).deletedAt), eq((t as any).userId, userId));

  // ---- vehicles ------------------------------------------------------------
  const vehicleRepo = {
    list(): Vehicle[] {
      return db.select().from(vehicles).where(live(vehicles)).orderBy(asc(vehicles.createdAt)).all();
    },
    get(id: string): Vehicle | undefined {
      return db.select().from(vehicles).where(and(eq(vehicles.id, id), live(vehicles))).get();
    },
    /** Normalized plates of the user's live vehicles, optionally excluding one (when editing). */
    plates(exceptId?: string): string[] {
      return vehicleRepo
        .list()
        .filter((v) => v.id !== exceptId)
        .map((v) => v.plateNormalized);
    },
    create(
      v: VehicleValue,
      photos: { photo?: string | null; regCard?: string | null } = {},
      baselineAt: number = now(),
    ): string {
      return db.transaction((tx) => {
        const id = insertRow(tx, 'vehicles', { ...v, plateNormalized: normalizePlate(v.plate) });
        insertRow(tx, 'odometer_readings', {
          vehicleId: id,
          timestamp: baselineAt,
          odometer: v.odometerStart,
          source: 'baseline',
        });
        if (photos.photo) attachPhoto(tx, 'vehicles', id, 'photo_path', photos.photo);
        if (photos.regCard) attachPhoto(tx, 'vehicles', id, 'reg_card_photo_path', photos.regCard);
        return id;
      });
    },
    update(id: string, v: VehicleValue) {
      db.transaction((tx) => {
        const before = tx.select().from(vehicles).where(eq(vehicles.id, id)).get();
        if (!before) throw new Error('Vehicle not found');
        updateRow(tx, 'vehicles', id, { ...v, plateNormalized: normalizePlate(v.plate) });
        if (before.odometerStart !== v.odometerStart) {
          const baseline = tx
            .select()
            .from(odometerReadings)
            .where(
              and(
                eq(odometerReadings.vehicleId, id),
                eq(odometerReadings.source, 'baseline'),
                isNull(odometerReadings.deletedAt),
              ),
            )
            .get();
          if (baseline) updateRow(tx, 'odometer_readings', baseline.id, { odometer: v.odometerStart });
          else
            insertRow(tx, 'odometer_readings', {
              vehicleId: id,
              timestamp: before.createdAt,
              odometer: v.odometerStart,
              source: 'baseline',
            });
        }
      });
    },
    setPhoto(id: string, which: 'photo' | 'regCard', localUri: string | null) {
      db.transaction((tx) =>
        attachPhoto(tx, 'vehicles', id, which === 'photo' ? 'photo_path' : 'reg_card_photo_path', localUri),
      );
    },
    /** Soft-deletes the vehicle and every record that belongs to it. */
    remove(id: string) {
      db.transaction((tx) => {
        softDelete(tx, 'vehicles', id);
        for (const name of VEHICLE_CHILDREN) {
          const table = SYNC_TABLES[name];
           
          const vehicleIdCol = (table as any).vehicleId;
          const ids = tx
            .select({ id: table.id })
            .from(table)
            .where(and(eq(vehicleIdCol, id), isNull(table.deletedAt)))
            .all();
          for (const r of ids) softDelete(tx, name, r.id);
        }
      });
    },
  };

  // ---- odometer ------------------------------------------------------------
  const odometerRepo = {
    add(vehicleId: string, odometer: number, timestamp: number = now(), source: OdometerSource = 'manual'): string {
      return db.transaction((tx) => insertRow(tx, 'odometer_readings', { vehicleId, odometer, timestamp, source }));
    },
    update(id: string, patch: { odometer?: number; timestamp?: number }) {
      db.transaction((tx) => updateRow(tx, 'odometer_readings', id, patch));
    },
    remove(id: string) {
      db.transaction((tx) => softDelete(tx, 'odometer_readings', id));
    },
    list(vehicleId: string): OdometerReading[] {
      return db
        .select()
        .from(odometerReadings)
        .where(and(eq(odometerReadings.vehicleId, vehicleId), live(odometerReadings)))
        .orderBy(desc(odometerReadings.timestamp))
        .all();
    },
    /**
     * Every known odometer value for a vehicle from all sources (readings, refuels, services),
     * oldest first. Refuels/services are not duplicated into odometer_readings.
     */
    points(vehicleId: string): OdometerPoint[] {
      const rows = db.all<{ timestamp: number; odometer: number; source: OdometerSource }>(sql`
        select timestamp, odometer, source from odometer_readings
          where vehicle_id = ${vehicleId} and user_id = ${userId} and deleted_at is null
        union all
        select timestamp, odometer, 'refuel' from refuels
          where vehicle_id = ${vehicleId} and user_id = ${userId} and deleted_at is null
        union all
        select timestamp, odometer, 'service' from service_events
          where vehicle_id = ${vehicleId} and user_id = ${userId} and deleted_at is null
        order by timestamp asc, odometer asc`);
      return rows;
    },
    /** Most recent value by time (ties → highest reading). */
    latest(vehicleId: string): OdometerPoint | null {
      const pts = odometerRepo.points(vehicleId);
      return pts.length ? pts[pts.length - 1]! : null;
    },
  };

  // ---- refuels -------------------------------------------------------------
  type RefuelExtras = { timestamp?: number; lat?: number | null; lng?: number | null; receiptPhoto?: string | null };
  const refuelRepo = {
    create(vehicleId: string, v: RefuelValue, extras: RefuelExtras = {}): string {
      return db.transaction((tx) => {
        const id = insertRow(tx, 'refuels', {
          vehicleId,
          timestamp: extras.timestamp ?? now(),
          odometer: v.odometer,
          litres: v.litres,
          ratePerLitre: v.ratePerLitre,
          totalCost: v.totalCost,
          stationName: v.stationName,
          lat: extras.lat ?? null,
          lng: extras.lng ?? null,
        });
        if (extras.receiptPhoto) attachPhoto(tx, 'refuels', id, 'receipt_photo_path', extras.receiptPhoto);
        return id;
      });
    },
    update(id: string, v: RefuelValue & { timestamp?: number }) {
      db.transaction((tx) =>
        updateRow(tx, 'refuels', id, {
          odometer: v.odometer,
          litres: v.litres,
          ratePerLitre: v.ratePerLitre,
          totalCost: v.totalCost,
          stationName: v.stationName,
          ...(v.timestamp != null ? { timestamp: v.timestamp } : {}),
        }),
      );
    },
    /** Annotation for the interval that ends at this refuel (cause of an unusual value). */
    setAnomaly(id: string, cause: string | null, note: string | null) {
      db.transaction((tx) => updateRow(tx, 'refuels', id, { anomalyCause: cause, anomalyNote: note }));
    },
    /** Past refuels with a station name and GPS (offline fallback for station lookup). */
    knownStations(): { stationName: string | null; lat: number | null; lng: number | null }[] {
      return db
        .select({ stationName: refuels.stationName, lat: refuels.lat, lng: refuels.lng })
        .from(refuels)
        .where(and(live(refuels), isNotNull(refuels.stationName), isNotNull(refuels.lat)))
        .orderBy(desc(refuels.timestamp))
        .limit(500)
        .all();
    },
    setReceiptPhoto(id: string, localUri: string | null) {
      db.transaction((tx) => attachPhoto(tx, 'refuels', id, 'receipt_photo_path', localUri));
    },
    remove(id: string) {
      db.transaction((tx) => softDelete(tx, 'refuels', id));
    },
    get(id: string): Refuel | undefined {
      return db.select().from(refuels).where(and(eq(refuels.id, id), live(refuels))).get();
    },
    /** Oldest first, ties broken by odometer — the order the mileage engine (M2) uses. */
    list(vehicleId: string): Refuel[] {
      return db
        .select()
        .from(refuels)
        .where(and(eq(refuels.vehicleId, vehicleId), live(refuels)))
        .orderBy(asc(refuels.timestamp), asc(refuels.odometer))
        .all();
    },
  };

  // ---- service events --------------------------------------------------------
  const serviceRepo = {
    create(vehicleId: string, v: ServiceValue, timestamp: number = now()): string {
      return db.transaction((tx) => insertRow(tx, 'service_events', { vehicleId, timestamp, ...v }));
    },
    update(id: string, v: ServiceValue & { timestamp?: number }) {
      db.transaction((tx) => updateRow(tx, 'service_events', id, { ...v }));
    },
    remove(id: string) {
      db.transaction((tx) => softDelete(tx, 'service_events', id));
    },
    get(id: string): ServiceEvent | undefined {
      return db.select().from(serviceEvents).where(and(eq(serviceEvents.id, id), live(serviceEvents))).get();
    },
    list(vehicleId: string): ServiceEvent[] {
      return db
        .select()
        .from(serviceEvents)
        .where(and(eq(serviceEvents.vehicleId, vehicleId), live(serviceEvents)))
        .orderBy(desc(serviceEvents.timestamp))
        .all();
    },
  };

  // ---- reminder rules ------------------------------------------------------------
  const ruleRepo = {
    list(vehicleId: string): ReminderRule[] {
      return db
        .select()
        .from(reminderRules)
        .where(and(eq(reminderRules.vehicleId, vehicleId), live(reminderRules)))
        .orderBy(desc(reminderRules.updatedAt))
        .all();
    },
    /** Latest live rule per service type (two devices could create duplicates; newest wins). */
    byType(vehicleId: string): Map<string, ReminderRule> {
      const m = new Map<string, ReminderRule>();
      for (const r of ruleRepo.list(vehicleId)) if (!m.has(r.serviceType)) m.set(r.serviceType, r);
      return m;
    },
    upsert(
      vehicleId: string,
      serviceType: ServiceType,
      v: { mode: 'auto' | 'custom'; intervalKm: number | null; intervalDays: number | null; enabled: boolean },
    ): string {
      return db.transaction((tx) => {
        const existing = ruleRepo.byType(vehicleId).get(serviceType);
        if (existing) {
          updateRow(tx, 'reminder_rules', existing.id, v);
          return existing.id;
        }
        return insertRow(tx, 'reminder_rules', { vehicleId, serviceType, ...v });
      });
    },
  };

  // ---- sync bookkeeping --------------------------------------------------------
  const syncInfo = {
    pendingCount(): number {
      const r = db.get<{ n: number }>(
        sql`select (select count(distinct table_name || ':' || row_id) from outbox) + (select count(*) from photo_uploads) as n`,
      );
      return r?.n ?? 0;
    },
    hasPending(tableName: SyncTableName, rowIds: string[]): Set<string> {
      if (!rowIds.length) return new Set();
      const rows = db
        .select({ rowId: outbox.rowId })
        .from(outbox)
        .where(and(eq(outbox.tableName, tableName), inArray(outbox.rowId, rowIds)))
        .all();
      return new Set(rows.map((r) => r.rowId));
    },
  };

  return {
    vehicles: vehicleRepo,
    odometer: odometerRepo,
    refuels: refuelRepo,
    services: serviceRepo,
    rules: ruleRepo,
    sync: syncInfo,
    /** Used by the photo uploader once a file is in storage. */
    setPhotoPath(tableName: SyncTableName, rowId: string, pathColumn: string, storagePath: string) {
      db.transaction((tx) => {
        const keys = columnKeyMap(SYNC_TABLES[tableName]);
        updateRow(tx, tableName, rowId, { [keys.get(pathColumn)!]: storagePath });
      });
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
