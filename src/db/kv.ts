import { eq } from 'drizzle-orm';

import { kv } from './schema';
import type { Db } from './types';

export function kvGet(db: Db, key: string): string | null {
  return db.select().from(kv).where(eq(kv.key, key)).get()?.value ?? null;
}

export function kvSet(db: Db, key: string, value: string | null) {
  if (value == null) db.delete(kv).where(eq(kv.key, key)).run();
  else db.insert(kv).values({ key, value }).onConflictDoUpdate({ target: kv.key, set: { value } }).run();
}
