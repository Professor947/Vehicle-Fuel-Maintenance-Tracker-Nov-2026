import type { SyncTableName } from '@/db/tables';

/** Row as stored on the server: snake_case columns, ISO timestamps. */
export type RemoteRow = Record<string, unknown> & { id: string; updated_at: string };

/** Keyset cursor: (updated_at, id) of the last row already applied. */
export interface PullCursor {
  updatedAt: string;
  id: string;
}

/**
 * The only surface the sync engine needs from the backend. The Supabase implementation lives
 * in services/supabaseRemote.ts; tests use an in-memory fake.
 */
export interface RemoteApi {
  upsert(table: SyncTableName, rows: Record<string, unknown>[]): Promise<void>;
  /** Rows with (updated_at, id) strictly greater than `after`, ordered by (updated_at, id). */
  pull(table: SyncTableName, after: PullCursor | null, limit: number): Promise<RemoteRow[]>;
  uploadPhoto(storagePath: string, localUri: string): Promise<void>;
}
