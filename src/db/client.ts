import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';
import type { Db } from './types';

export const expoDb = openDatabaseSync('fueltrack.db', { enableChangeListener: true });
expoDb.execSync('PRAGMA journal_mode = WAL;');

export const drizzleDb = drizzle(expoDb, { schema });
export const db = drizzleDb as unknown as Db;
