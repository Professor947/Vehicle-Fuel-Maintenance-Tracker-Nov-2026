import { kvSet } from '@/db/kv';
import type { Repo } from '@/db/repo';
import type { Db } from '@/db/types';

import { uploadPhotos } from './photos';
import { pullAll } from './pull';
import { pushOutbox } from './push';
import type { RemoteApi } from './remote';

export interface SyncOutcome {
  ok: boolean;
  pushed: number;
  pulled: number;
  photos: number;
  error?: string;
  finishedAt: number;
}

export interface SyncDeps {
  db: Db;
  repo: Repo;
  remote: RemoteApi;
  userId: string;
  fileExists: (uri: string) => boolean;
  now?: () => number;
}

let inFlight: Promise<SyncOutcome> | null = null;

/**
 * photos → push → pull. Single-flight: concurrent callers share one run. Never throws;
 * failures are reported in the outcome and everything stays queued for the next attempt.
 */
export function runSync(deps: SyncDeps): Promise<SyncOutcome> {
  if (!inFlight) inFlight = doSync(deps).finally(() => (inFlight = null));
  return inFlight;
}

async function doSync({ db, repo, remote, userId, fileExists, now = Date.now }: SyncDeps): Promise<SyncOutcome> {
  let pushed = 0, pulled = 0, photos = 0;
  try {
    photos = (await uploadPhotos(db, repo, remote, userId, fileExists)).uploaded;
    const p = await pushOutbox(db, remote);
    pushed = p.pushed;
    if (p.error) throw new Error(p.error);
    pulled = (await pullAll(db, remote)).applied;
    const finishedAt = now();
    kvSet(db, 'last_sync_at', String(finishedAt));
    kvSet(db, 'last_sync_error', null);
    return { ok: true, pushed, pulled, photos, finishedAt };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    kvSet(db, 'last_sync_error', error);
    return { ok: false, pushed, pulled, photos, error, finishedAt: now() };
  }
}
