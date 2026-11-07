import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';

import type { SyncTableName } from '@/db/tables';
import type { PullCursor, RemoteApi, RemoteRow } from '@/sync/remote';

export const PHOTO_BUCKET = 'photos';

export function supabaseRemote(client: SupabaseClient): RemoteApi {
  return {
    async upsert(table: SyncTableName, rows: Record<string, unknown>[]) {
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`${table}: ${error.message}`);
    },
    async pull(table: SyncTableName, after: PullCursor | null, limit: number) {
      let q = client.from(table).select('*').order('updated_at').order('id').limit(limit);
      if (after) {
        // Keyset: (updated_at, id) > (cursor). Cursor string is the server's own value, verbatim.
        const t = `"${after.updatedAt}"`;
        q = q.or(`updated_at.gt.${t},and(updated_at.eq.${t},id.gt.${after.id})`);
      }
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data ?? []) as RemoteRow[];
    },
    async uploadPhoto(storagePath: string, localUri: string) {
      const bytes = await new File(localUri).arrayBuffer();
      const { error } = await client.storage
        .from(PHOTO_BUCKET)
        .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: true });
      if (error) throw new Error(`photo: ${error.message}`);
    },
  };
}

/** Short-lived URL for showing a synced photo that is not on this device. */
export async function signedPhotoUrl(client: SupabaseClient, storagePath: string): Promise<string | null> {
  const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(storagePath, 60 * 60);
  return error ? null : data.signedUrl;
}
