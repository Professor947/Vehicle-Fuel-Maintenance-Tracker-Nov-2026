import { getTableColumns } from 'drizzle-orm';

import { isLocalOnlyColumn, SYNC_TABLES, TIMESTAMP_COLUMNS, type SyncTableName } from '@/db/tables';

/** Local row (TS keys, epoch ms) → server payload (snake_case, ISO). Device-only columns dropped. */
export function toRemote(tableName: SyncTableName, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(getTableColumns(SYNC_TABLES[tableName]))) {
    if (isLocalOnlyColumn(col.name)) continue;
    const v = row[key];
    out[col.name] = TIMESTAMP_COLUMNS.has(col.name) && typeof v === 'number' ? new Date(v).toISOString() : (v ?? null);
  }
  return out;
}

/** Server row → local row values (TS keys). Device-only columns are left untouched (absent). */
export function toLocal(tableName: SyncTableName, remote: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(getTableColumns(SYNC_TABLES[tableName]))) {
    if (isLocalOnlyColumn(col.name) || !(col.name in remote)) continue;
    const v = remote[col.name];
    if (TIMESTAMP_COLUMNS.has(col.name)) {
      out[key] = v == null ? null : typeof v === 'number' ? v : Date.parse(String(v));
    } else if (typeof v === 'string' && col.columnType === 'SQLiteReal') {
      out[key] = Number(v); // Postgres numeric arrives as string
    } else {
      out[key] = v ?? null;
    }
  }
  return out;
}
