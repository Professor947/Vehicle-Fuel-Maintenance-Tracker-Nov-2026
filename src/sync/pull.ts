import { eq } from 'drizzle-orm';

import { kvGet, kvSet } from '@/db/kv';
import { outbox } from '@/db/schema';
import { SYNC_TABLE_ORDER, SYNC_TABLES, type SyncTableName } from '@/db/tables';
import type { Db } from '@/db/types';

import { toLocal } from './mapping';
import type { PullCursor, RemoteApi, RemoteRow } from './remote';

const PAGE = 500;
const cursorKey = (t: SyncTableName) => `pull_cursor:${t}`;

export interface PullResult {
  applied: number;
  skippedPending: number;
}

/**
 * Pull server changes since the stored keyset cursor and upsert them locally.
 * Conflict rule: last write wins per row. A row with local changes still in the outbox is
 * skipped — the local version is newer and will overwrite the server on the next push.
 */
export async function pullAll(db: Db, remote: RemoteApi): Promise<PullResult> {
  let applied = 0;
  let skippedPending = 0;
  for (const tableName of SYNC_TABLE_ORDER) {
    const raw = kvGet(db, cursorKey(tableName));
    let cursor: PullCursor | null = raw ? (JSON.parse(raw) as PullCursor) : null;
    for (;;) {
      const page = await remote.pull(tableName, cursor, PAGE);
      if (!page.length) break;
      const r = applyPage(db, tableName, page);
      applied += r.applied;
      skippedPending += r.skipped;
      const last = page[page.length - 1]!;
      cursor = { updatedAt: last.updated_at, id: last.id };
      kvSet(db, cursorKey(tableName), JSON.stringify(cursor));
      if (page.length < PAGE) break;
    }
  }
  return { applied, skippedPending };
}

function applyPage(db: Db, tableName: SyncTableName, page: RemoteRow[]) {
  const table = SYNC_TABLES[tableName];
  let applied = 0;
  let skipped = 0;
  db.transaction((tx) => {
    const pending = new Set(
      tx
        .select({ rowId: outbox.rowId })
        .from(outbox)
        .where(eq(outbox.tableName, tableName))
        .all()
        .map((r) => r.rowId),
    );
    for (const remoteRow of page) {
      if (pending.has(remoteRow.id)) {
        skipped++;
        continue;
      }
      const values = toLocal(tableName, remoteRow);
      const { id: _id, ...rest } = values;
      void _id;
      tx.insert(table)
         
        .values(values as any)
         
        .onConflictDoUpdate({ target: table.id, set: rest as any })
        .run();
      applied++;
    }
  });
  return { applied, skipped };
}

export function resetPullCursors(db: Db) {
  for (const t of SYNC_TABLE_ORDER) kvSet(db, cursorKey(t), null);
}
