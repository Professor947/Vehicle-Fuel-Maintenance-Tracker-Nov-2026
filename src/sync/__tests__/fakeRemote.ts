import type { SyncTableName } from '@/db/tables';

import type { PullCursor, RemoteApi, RemoteRow } from '../remote';

/**
 * In-memory stand-in for Supabase: server stamps updated_at (like the DB trigger),
 * keyset pagination on (updated_at, id), injectable failures.
 */
export class FakeRemote implements RemoteApi {
  tables = new Map<SyncTableName, Map<string, RemoteRow>>();
  photos = new Map<string, string>();
  failUpsertFor = new Set<SyncTableName>();
  failUploads = false;
  upsertCalls: { table: SyncTableName; count: number }[] = [];
  private clock = Date.parse('2026-01-01T00:00:00Z');
  onUpsert?: () => void;

  private t(table: SyncTableName) {
    let m = this.tables.get(table);
    if (!m) this.tables.set(table, (m = new Map()));
    return m;
  }

  rows(table: SyncTableName): RemoteRow[] {
    return [...this.t(table).values()];
  }

  async upsert(table: SyncTableName, rows: Record<string, unknown>[]) {
    this.onUpsert?.();
    if (this.failUpsertFor.has(table)) throw new Error(`upsert ${table} failed`);
    this.upsertCalls.push({ table, count: rows.length });
    for (const r of rows) {
      this.clock += 1000;
      this.t(table).set(String(r.id), { ...r, id: String(r.id), updated_at: new Date(this.clock).toISOString() });
    }
  }

  async pull(table: SyncTableName, after: PullCursor | null, limit: number) {
    return this.rows(table)
      .filter((r) => !after || r.updated_at > after.updatedAt || (r.updated_at === after.updatedAt && r.id > after.id))
      .sort((a, b) => (a.updated_at === b.updated_at ? (a.id < b.id ? -1 : 1) : a.updated_at < b.updated_at ? -1 : 1))
      .slice(0, limit);
  }

  async uploadPhoto(path: string, localUri: string) {
    if (this.failUploads) throw new Error('upload failed');
    this.photos.set(path, localUri);
  }

  /** Simulate an edit made on another device, directly on the server. */
  serverEdit(table: SyncTableName, id: string, patch: Record<string, unknown>) {
    const row = this.t(table).get(id)!;
    this.clock += 1000;
    this.t(table).set(id, { ...row, ...patch, updated_at: new Date(this.clock).toISOString() });
  }
}
