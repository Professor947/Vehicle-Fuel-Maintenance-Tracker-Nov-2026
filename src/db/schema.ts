import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { OdometerSource, ServiceType, VehicleType } from '@/domain/types';

/**
 * Local mirror of the Supabase schema (supabase/migrations). All timestamps are epoch ms
 * locally and timestamptz on the server; sync/mapping.ts converts.
 * Columns ending in `_local_uri` are device-only and never synced.
 */
const syncColumns = {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
};

export const vehicles = sqliteTable(
  'vehicles',
  {
    ...syncColumns,
    plate: text('plate').notNull(),
    plateNormalized: text('plate_normalized').notNull(),
    type: text('type').$type<VehicleType>().notNull(),
    make: text('make'),
    model: text('model'),
    odometerStart: real('odometer_start').notNull(),
    photoPath: text('photo_path'),
    photoLocalUri: text('photo_local_uri'),
    regCardPhotoPath: text('reg_card_photo_path'),
    regCardPhotoLocalUri: text('reg_card_photo_local_uri'),
  },
  (t) => [index('vehicles_user_idx').on(t.userId)],
);

export const odometerReadings = sqliteTable(
  'odometer_readings',
  {
    ...syncColumns,
    vehicleId: text('vehicle_id').notNull(),
    timestamp: integer('timestamp').notNull(),
    odometer: real('odometer').notNull(),
    source: text('source').$type<OdometerSource>().notNull(),
    photoPath: text('photo_path'),
    photoLocalUri: text('photo_local_uri'),
  },
  (t) => [index('odo_vehicle_ts_idx').on(t.vehicleId, t.timestamp)],
);

export const refuels = sqliteTable(
  'refuels',
  {
    ...syncColumns,
    vehicleId: text('vehicle_id').notNull(),
    timestamp: integer('timestamp').notNull(),
    odometer: real('odometer').notNull(),
    litres: real('litres').notNull(),
    ratePerLitre: real('rate_per_litre').notNull(),
    totalCost: real('total_cost').notNull(),
    stationName: text('station_name'),
    lat: real('lat'),
    lng: real('lng'),
    receiptPhotoPath: text('receipt_photo_path'),
    receiptPhotoLocalUri: text('receipt_photo_local_uri'),
    /** Annotation for the interval that ENDS at this refuel (M2). */
    anomalyCause: text('anomaly_cause'),
    anomalyNote: text('anomaly_note'),
  },
  (t) => [index('refuels_vehicle_ts_idx').on(t.vehicleId, t.timestamp)],
);

export const serviceEvents = sqliteTable(
  'service_events',
  {
    ...syncColumns,
    vehicleId: text('vehicle_id').notNull(),
    type: text('type').$type<ServiceType>().notNull(),
    timestamp: integer('timestamp').notNull(),
    odometer: real('odometer').notNull(),
    cost: real('cost'),
    notes: text('notes'),
  },
  (t) => [index('service_vehicle_ts_idx').on(t.vehicleId, t.timestamp)],
);

/** Created now so the server schema is complete; UI/engine arrive in M3. */
export const reminderRules = sqliteTable(
  'reminder_rules',
  {
    ...syncColumns,
    vehicleId: text('vehicle_id').notNull(),
    serviceType: text('service_type').$type<ServiceType>().notNull(),
    intervalKm: real('interval_km'),
    intervalDays: integer('interval_days'),
    mode: text('mode').$type<'auto' | 'custom'>().notNull().default('auto'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [index('rules_vehicle_idx').on(t.vehicleId)],
);

// ---- Device-only tables ---------------------------------------------------

/** One row per local write; drained by sync/push.ts. */
export const outbox = sqliteTable('outbox', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

/** Pending photo uploads; on success the row's *_path column is set and the row re-queued. */
export const photoUploads = sqliteTable('photo_uploads', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  pathColumn: text('path_column').notNull(),
  localUri: text('local_uri').notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const kv = sqliteTable('kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Vehicle = typeof vehicles.$inferSelect;
export type OdometerReading = typeof odometerReadings.$inferSelect;
export type Refuel = typeof refuels.$inferSelect;
export type ServiceEvent = typeof serviceEvents.$inferSelect;
export type ReminderRule = typeof reminderRules.$inferSelect;
