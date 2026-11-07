import { getTableColumns } from 'drizzle-orm';

import { odometerReadings, refuels, reminderRules, serviceEvents, vehicles } from './schema';

/** Synced tables in dependency order (parents first) — push must respect this for FKs. */
export const SYNC_TABLES = {
  vehicles,
  odometer_readings: odometerReadings,
  refuels,
  service_events: serviceEvents,
  reminder_rules: reminderRules,
} as const;

export type SyncTableName = keyof typeof SYNC_TABLES;
export const SYNC_TABLE_ORDER = Object.keys(SYNC_TABLES) as SyncTableName[];
export type SyncTable = (typeof SYNC_TABLES)[SyncTableName];

/** Photo path column → device-only local uri column (same table). */
export const PHOTO_COLUMNS: Record<string, string> = {
  photo_path: 'photo_local_uri',
  reg_card_photo_path: 'reg_card_photo_local_uri',
  receipt_photo_path: 'receipt_photo_local_uri',
};

export const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at', 'deleted_at', 'timestamp']);

export function isLocalOnlyColumn(dbName: string): boolean {
  return dbName.endsWith('_local_uri');
}

/** db column name → TS property key, for one table. */
export function columnKeyMap(table: SyncTable): Map<string, string> {
  const m = new Map<string, string>();
  for (const [key, col] of Object.entries(getTableColumns(table))) m.set(col.name, key);
  return m;
}

export function isSyncTableName(name: string): name is SyncTableName {
  return name in SYNC_TABLES;
}
