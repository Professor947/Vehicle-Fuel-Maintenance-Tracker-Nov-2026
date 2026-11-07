import { eq } from 'drizzle-orm';

import type { Repo } from '@/db/repo';
import { photoUploads } from '@/db/schema';
import { isSyncTableName } from '@/db/tables';
import type { Db } from '@/db/types';

import type { RemoteApi } from './remote';

/** Storage RLS requires the first folder to be the user's id. */
export function storagePathFor(userId: string, tableName: string, rowId: string, pathColumn: string, seq: number) {
  return `${userId}/${tableName}/${rowId}/${pathColumn}-${seq}.jpg`;
}

export interface PhotoResult {
  uploaded: number;
  failed: number;
}

/** Upload queued photos (already compressed at capture time), then record their storage path. */
export async function uploadPhotos(
  db: Db,
  repo: Repo,
  remote: RemoteApi,
  userId: string,
  fileExists: (uri: string) => boolean,
): Promise<PhotoResult> {
  const items = db.select().from(photoUploads).all();
  let uploaded = 0;
  let failed = 0;
  for (const item of items) {
    if (!isSyncTableName(item.tableName) || !fileExists(item.localUri)) {
      // Photo is gone from the device (or bogus entry): nothing we can ever upload.
      db.delete(photoUploads).where(eq(photoUploads.seq, item.seq)).run();
      continue;
    }
    const path = storagePathFor(userId, item.tableName, item.rowId, item.pathColumn, item.seq);
    try {
      await remote.uploadPhoto(path, item.localUri);
    } catch (err) {
      failed++;
      db.update(photoUploads)
        .set({ attempts: item.attempts + 1, lastError: err instanceof Error ? err.message : String(err) })
        .where(eq(photoUploads.seq, item.seq))
        .run();
      continue;
    }
    // Only record it if this upload is still the current photo for that slot.
    const still = db.select().from(photoUploads).where(eq(photoUploads.seq, item.seq)).get();
    if (still) {
      db.transaction((tx) => {
        tx.delete(photoUploads).where(eq(photoUploads.seq, item.seq)).run();
      });
      repo.setPhotoPath(item.tableName, item.rowId, item.pathColumn, path);
    }
    uploaded++;
  }
  return { uploaded, failed };
}
