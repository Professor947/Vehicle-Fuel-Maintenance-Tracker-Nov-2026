import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/**
 * Both drivers we use are synchronous: expo-sqlite on device, better-sqlite3 in Jest.
 * Repositories are written against this common type so they run unchanged in tests.
 */
 
export type Db = BaseSQLiteDatabase<'sync', any, typeof schema>;
