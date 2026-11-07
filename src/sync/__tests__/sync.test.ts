import { randomUUID } from 'node:crypto';

import { kvGet } from '@/db/kv';
import { createRepo } from '@/db/repo';
import { outbox, photoUploads } from '@/db/schema';
import { createTestDb } from '@/db/testDb';

import { runSync } from '../engine';
import { toLocal, toRemote } from '../mapping';
import { uploadPhotos } from '../photos';
import { pullAll } from '../pull';
import { pushOutbox } from '../push';
import { FakeRemote } from './fakeRemote';

const USER = 'user-1';
const bike = { plate: 'LEA-1234', type: 'bike' as const, make: 'Honda', model: null, odometerStart: 10000 };
const fill = { odometer: 10200, litres: 5, ratePerLitre: 272.89, totalCost: 1364.45, stationName: 'PSO' };

function device(remote = new FakeRemote()) {
  const db = createTestDb();
  const repo = createRepo({ db, userId: USER, newId: randomUUID });
  const sync = () => runSync({ db, repo, remote, userId: USER, fileExists: () => true });
  return { db, repo, remote, sync };
}

describe('mapping', () => {
  it('round-trips a row, converting timestamps and dropping device-only columns', () => {
    const local = {
      id: 'v1', userId: USER, createdAt: 1700000000000, updatedAt: 1700000001000, deletedAt: null,
      plate: 'LEA-1234', plateNormalized: 'LEA1234', type: 'bike', make: null, model: null,
      odometerStart: 10000, photoPath: 'p', photoLocalUri: 'file:///x', regCardPhotoPath: null, regCardPhotoLocalUri: null,
    };
    const remote = toRemote('vehicles', local);
    expect(remote).toMatchObject({ user_id: USER, created_at: '2023-11-14T22:13:20.000Z', deleted_at: null, photo_path: 'p' });
    expect(remote).not.toHaveProperty('photo_local_uri');
    const back = toLocal('vehicles', remote);
    const { photoLocalUri: _a, regCardPhotoLocalUri: _b, ...synced } = local;
    expect(back).toEqual(synced);
  });

  it('parses Postgres numeric strings and offset timestamps', () => {
    const r = toLocal('refuels', { id: 'r', litres: '5.50', timestamp: '2026-01-01T05:00:00+05:00' });
    expect(r).toEqual({ id: 'r', litres: 5.5, timestamp: Date.parse('2026-01-01T00:00:00Z') });
  });
});

describe('push', () => {
  it('drains the outbox, parents first, collapsing repeated edits into one upsert per row', async () => {
    const { db, repo, remote } = device();
    const id = repo.vehicles.create(bike);
    repo.vehicles.update(id, { ...bike, make: 'Yamaha' });
    repo.refuels.create(id, fill);
    const r = await pushOutbox(db, remote);
    expect(r).toEqual({ pushed: 3 });
    expect(remote.upsertCalls.map((c) => c.table)).toEqual(['vehicles', 'odometer_readings', 'refuels']);
    expect(remote.rows('vehicles')[0]).toMatchObject({ make: 'Yamaha', plate_normalized: 'LEA1234' });
    expect(db.select().from(outbox).all()).toEqual([]);
  });

  it('on failure keeps everything queued, records the error, and does not push children', async () => {
    const { db, repo, remote } = device();
    const id = repo.vehicles.create(bike);
    repo.refuels.create(id, fill);
    remote.failUpsertFor.add('vehicles');
    const r = await pushOutbox(db, remote);
    expect(r.error).toMatch(/vehicles failed/);
    expect(remote.rows('refuels')).toEqual([]);
    const q = db.select().from(outbox).all();
    expect(q).toHaveLength(3);
    expect(q.find((e) => e.tableName === 'vehicles')).toMatchObject({ attempts: 1, lastError: 'upsert vehicles failed' });

    remote.failUpsertFor.clear();
    expect(await pushOutbox(db, remote)).toEqual({ pushed: 3 });
  });

  it('an edit made while a push is in flight stays queued', async () => {
    const { db, repo, remote } = device();
    const id = repo.vehicles.create(bike);
    remote.onUpsert = () => {
      remote.onUpsert = undefined;
      repo.vehicles.update(id, { ...bike, make: 'Suzuki' });
    };
    await pushOutbox(db, remote);
    expect(db.select().from(outbox).all().map((e) => e.tableName)).toEqual(['vehicles']);
    await pushOutbox(db, remote);
    expect(remote.rows('vehicles')[0]).toMatchObject({ make: 'Suzuki' });
  });

  it('pushes soft deletes', async () => {
    const { db, repo, remote } = device();
    const id = repo.vehicles.create(bike);
    await pushOutbox(db, remote);
    repo.vehicles.remove(id);
    await pushOutbox(db, remote);
    expect(remote.rows('vehicles')[0]!.deleted_at).toEqual(expect.any(String));
    expect(remote.rows('odometer_readings')[0]!.deleted_at).toEqual(expect.any(String));
  });
});

describe('pull', () => {
  it('applies server rows, advances the cursor, and is idempotent', async () => {
    const remote = new FakeRemote();
    const a = device(remote);
    const id = a.repo.vehicles.create(bike);
    await a.sync();

    const b = device(remote);
    const r1 = await pullAll(b.db, remote);
    expect(r1.applied).toBe(2);
    expect(b.repo.vehicles.get(id)).toMatchObject({ plate: 'LEA-1234' });
    expect(kvGet(b.db, 'pull_cursor:vehicles')).toBeTruthy();
    expect((await pullAll(b.db, remote)).applied).toBe(0);
  });

  it('paginates with a keyset cursor (more rows than one page)', async () => {
    const remote = new FakeRemote();
    const a = device(remote);
    const id = a.repo.vehicles.create(bike);
    for (let i = 0; i < 620; i++) a.repo.odometer.add(id, 10000 + i, 1000 + i);
    await a.sync();
    const b = device(remote);
    await pullAll(b.db, remote);
    expect(b.repo.odometer.list(id)).toHaveLength(621);
  });

  it('last write wins: a newer server edit replaces local; pending local edits are not overwritten', async () => {
    const remote = new FakeRemote();
    const a = device(remote);
    const id = a.repo.vehicles.create(bike);
    await a.sync();

    remote.serverEdit('vehicles', id, { make: 'FromOtherPhone' });
    await a.sync();
    expect(a.repo.vehicles.get(id)!.make).toBe('FromOtherPhone');

    // Local edit pending (offline) + another server edit: local wins once pushed.
    remote.serverEdit('vehicles', id, { make: 'Server2' });
    a.repo.vehicles.update(id, { ...bike, make: 'LocalOffline' });
    const r = await pullAll(a.db, remote);
    expect(r.skippedPending).toBe(1);
    expect(a.repo.vehicles.get(id)!.make).toBe('LocalOffline');
    await a.sync();
    expect(remote.rows('vehicles')[0]!.make).toBe('LocalOffline');
  });

  it('keeps the device-only photo uri when the server row is pulled back', async () => {
    const { repo, sync, remote } = device();
    const id = repo.vehicles.create(bike, { photo: 'file:///local.jpg' });
    await sync();
    expect(repo.vehicles.get(id)).toMatchObject({ photoLocalUri: 'file:///local.jpg', photoPath: expect.stringContaining(USER) });
    expect(remote.photos.size).toBe(1);
  });
});

describe('photos', () => {
  it('uploads under the user folder, sets the path, and queues the row', async () => {
    const { db, repo, remote } = device();
    const id = repo.vehicles.create(bike, { regCard: 'file:///card.jpg' });
    const r = await uploadPhotos(db, repo, remote, USER, () => true);
    expect(r).toEqual({ uploaded: 1, failed: 0 });
    const path = repo.vehicles.get(id)!.regCardPhotoPath!;
    expect(path.startsWith(`${USER}/vehicles/${id}/reg_card_photo_path-`)).toBe(true);
    expect(remote.photos.get(path)).toBe('file:///card.jpg');
    expect(db.select().from(photoUploads).all()).toEqual([]);
  });

  it('keeps the upload queued on failure', async () => {
    const { db, repo, remote } = device();
    repo.vehicles.create(bike, { photo: 'file:///a.jpg' });
    remote.failUploads = true;
    expect(await uploadPhotos(db, repo, remote, USER, () => true)).toEqual({ uploaded: 0, failed: 1 });
    expect(db.select().from(photoUploads).all()[0]).toMatchObject({ attempts: 1 });
  });

  it('drops entries whose file no longer exists', async () => {
    const { db, repo, remote } = device();
    repo.vehicles.create(bike, { photo: 'file:///gone.jpg' });
    await uploadPhotos(db, repo, remote, USER, () => false);
    expect(db.select().from(photoUploads).all()).toEqual([]);
  });
});

describe('runSync', () => {
  it('works offline-first: failures are reported, nothing is lost, later sync succeeds', async () => {
    const { db, repo, remote, sync } = device();
    repo.vehicles.create(bike);
    remote.failUpsertFor.add('vehicles');
    const r1 = await sync();
    expect(r1.ok).toBe(false);
    expect(kvGet(db, 'last_sync_error')).toMatch(/failed/);
    expect(repo.sync.pendingCount()).toBe(2);

    remote.failUpsertFor.clear();
    const r2 = await sync();
    expect(r2).toMatchObject({ ok: true, pushed: 2 });
    expect(repo.sync.pendingCount()).toBe(0);
    expect(kvGet(db, 'last_sync_error')).toBeNull();
    expect(kvGet(db, 'last_sync_at')).toBeTruthy();
  });

  it('is single-flight', async () => {
    const { repo, sync, remote } = device();
    repo.vehicles.create(bike);
    const [a, b] = await Promise.all([sync(), sync()]);
    expect(a).toBe(b);
    expect(remote.upsertCalls).toHaveLength(2); // vehicles + odometer_readings, once
  });
});
