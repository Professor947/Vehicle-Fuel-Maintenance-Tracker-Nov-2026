import { and, eq, inArray, lte } from 'drizzle-orm';

import { outbox } from '@/db/schema';
import { SYNC_TABLE_ORDER, SYNC_TABLES, isSyncTableName } from '@/db/tables';
import type { Db } from '@/db/types';

import { toRemote } from './mapping';
import type { RemoteApi } from './remote';

const BATCH = 200;

export interface PushResult {
  pushed: number;
  error?: string;
}

/**
 * Drain the outbox. Each row is pushed as its CURRENT local state (so many edits collapse into
 * one upsert). Outbox entries are removed only up to the seq we read, so edits made while a push
 * is in flight stay queued. Tables are pushed parents-first; on the first failure we stop so
 * children never reach the server before their vehicle.
 */
export async function pushOutbox(db: Db, remote: RemoteApi): Promise<PushResult> {
  const entries = db.select().from(outbox).all();
  if (!entries.length) return { pushed: 0 };

  // Latest seq per (table,row).
  const latest = new Map<string, { tableName: string; rowId: string; seq: number }>();
  for (const e of entries) {
    const k = `${e.tableName}:${e.rowId}`;
    const prev = latest.get(k);
    if (!prev || e.seq > prev.seq) latest.set(k, { tableName: e.tableName, rowId: e.rowId, seq: e.seq });
  }

  // Unknown table names (shouldn't happen) are dropped so they can't wedge the queue.
  for (const e of latest.values()) {
    if (!isSyncTableName(e.tableName)) db.delete(outbox).where(eq(outbox.tableName, e.tableName)).run();
  }

  let pushed = 0;
  for (const tableName of SYNC_TABLE_ORDER) {
    const items = [...latest.values()].filter((e) => e.tableName === tableName);
    for (let i = 0; i < items.length; i += BATCH) {
      const chunk = items.slice(i, i + BATCH);
      const table = SYNC_TABLES[tableName];
      const rows = db
        .select()
        .from(table)
        .where(
          inArray(
            table.id,
            chunk.map((c) => c.rowId),
          ),
        )
        .all() as Record<string, unknown>[];
      const payload = rows.map((r) => toRemote(tableName, r));
      try {
        if (payload.length) await remote.upsert(tableName, payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        for (const c of chunk) {
          db.update(outbox)
            .set({ lastError: message })
            .where(and(eq(outbox.tableName, tableName), eq(outbox.rowId, c.rowId)))
            .run();
        }
        bumpAttempts(db, tableName, chunk.map((c) => c.rowId));
        return { pushed, error: message };
      }
      db.transaction((tx) => {
        for (const c of chunk) {
          tx.delete(outbox)
            .where(and(eq(outbox.tableName, tableName), eq(outbox.rowId, c.rowId), lte(outbox.seq, c.seq)))
            .run();
        }
      });
      pushed += payload.length;
    }
  }
  return { pushed };
}

function bumpAttempts(db: Db, tableName: string, rowIds: string[]) {
  const rows = db
    .select()
    .from(outbox)
    .where(and(eq(outbox.tableName, tableName), inArray(outbox.rowId, rowIds)))
    .all();
  for (const r of rows) db.update(outbox).set({ attempts: r.attempts + 1 }).where(eq(outbox.seq, r.seq)).run();
}
