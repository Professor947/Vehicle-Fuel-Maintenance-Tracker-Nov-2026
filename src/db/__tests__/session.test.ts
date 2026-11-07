import { randomUUID } from 'node:crypto';

import { onSignedIn, onSignedOut, useSession } from '@/state/session';

import { kvGet, kvSet } from '../kv';
import { createRepo } from '../repo';
import { createTestDb } from '../testDb';

const bike = { plate: 'LEA-1234', type: 'bike' as const, make: null, model: null, odometerStart: 1 };

test('same user signing in again keeps local data (incl. unsynced changes)', () => {
  const db = createTestDb();
  onSignedIn(db, { id: 'a', phone: '+923001234567' });
  createRepo({ db, userId: 'a', newId: randomUUID }).vehicles.create(bike);
  onSignedIn(db, { id: 'a', phone: '+923001234567' });
  expect(createRepo({ db, userId: 'a', newId: randomUUID }).sync.pendingCount()).toBe(2);
});

test('a different user signing in wipes the previous account but keeps the language', () => {
  const db = createTestDb();
  kvSet(db, 'language', 'ur');
  onSignedIn(db, { id: 'a', phone: '+923001234567' });
  createRepo({ db, userId: 'a', newId: randomUUID }).vehicles.create(bike);
  onSignedIn(db, { id: 'b', phone: '+923001234568' });
  const b = createRepo({ db, userId: 'b', newId: randomUUID });
  expect(b.sync.pendingCount()).toBe(0); // a's outbox would otherwise be rejected by RLS forever
  expect(createRepo({ db, userId: 'a', newId: randomUUID }).vehicles.list()).toEqual([]);
  expect(kvGet(db, 'language')).toBe('ur');
  expect(useSession.getState().user?.id).toBe('b');
});

test('sign-out wipes local data and the session', () => {
  const db = createTestDb();
  onSignedIn(db, { id: 'a', phone: '+923001234567' });
  createRepo({ db, userId: 'a', newId: randomUUID }).vehicles.create(bike);
  onSignedOut(db);
  expect(createRepo({ db, userId: 'a', newId: randomUUID }).vehicles.list()).toEqual([]);
  expect(useSession.getState().user).toBeNull();
  useSession.getState().hydrate(db);
  expect(useSession.getState().user).toBeNull();
});
