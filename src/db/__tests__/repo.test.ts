import { randomUUID } from 'node:crypto';

import { createRepo } from '../repo';
import { outbox, photoUploads } from '../schema';
import { createTestDb } from '../testDb';

const bike = { plate: 'LEA-1234', type: 'bike' as const, make: 'Honda', model: 'CD 70', odometerStart: 10000 };

function setup(userId = 'user-1') {
  const db = createTestDb();
  let t = 1_700_000_000_000;
  const repo = createRepo({ db, userId, newId: randomUUID, now: () => (t += 1000) });
  return { db, repo };
}

describe('vehicles', () => {
  it('create inserts vehicle + baseline odometer reading, both queued for sync', () => {
    const { db, repo } = setup();
    const id = repo.vehicles.create(bike);
    const v = repo.vehicles.get(id)!;
    expect(v).toMatchObject({ plate: 'LEA-1234', plateNormalized: 'LEA1234', type: 'bike', odometerStart: 10000 });
    expect(repo.odometer.list(id)).toEqual([expect.objectContaining({ odometer: 10000, source: 'baseline' })]);
    const q = db.select().from(outbox).all();
    expect(q.map((e) => e.tableName).sort()).toEqual(['odometer_readings', 'vehicles']);
  });

  it('supports multiple vehicles, listed oldest first', () => {
    const { repo } = setup();
    repo.vehicles.create(bike);
    repo.vehicles.create({ ...bike, plate: 'ICT AB-123', type: 'car' });
    expect(repo.vehicles.list().map((v) => v.plate)).toEqual(['LEA-1234', 'ICT AB-123']);
    expect(repo.vehicles.plates().sort()).toEqual(['ICTAB123', 'LEA1234']);
  });

  it('plates(exceptId) excludes the vehicle being edited', () => {
    const { repo } = setup();
    const id = repo.vehicles.create(bike);
    expect(repo.vehicles.plates(id)).toEqual([]);
  });

  it('changing odometer_start updates the baseline reading instead of adding one', () => {
    const { repo } = setup();
    const id = repo.vehicles.create(bike);
    repo.vehicles.update(id, { ...bike, odometerStart: 10500 });
    const readings = repo.odometer.list(id);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({ odometer: 10500, source: 'baseline' });
  });

  it('remove soft-deletes the vehicle and all its records', () => {
    const { repo } = setup();
    const id = repo.vehicles.create(bike);
    repo.refuels.create(id, { odometer: 10100, litres: 5, ratePerLitre: 270, totalCost: 1350, stationName: null });
    repo.services.create(id, { type: 'oil', odometer: 10100, cost: 1200, notes: null });
    repo.vehicles.remove(id);
    expect(repo.vehicles.list()).toEqual([]);
    expect(repo.vehicles.get(id)).toBeUndefined();
    expect(repo.refuels.list(id)).toEqual([]);
    expect(repo.services.list(id)).toEqual([]);
    expect(repo.odometer.list(id)).toEqual([]);
  });

  it('never returns another user\'s rows', () => {
    const db = createTestDb();
    const a = createRepo({ db, userId: 'a', newId: randomUUID });
    const b = createRepo({ db, userId: 'b', newId: randomUUID });
    const id = a.vehicles.create(bike);
    expect(b.vehicles.list()).toEqual([]);
    expect(b.vehicles.get(id)).toBeUndefined();
  });

  it('photo attach queues an upload; replacing it drops the stale upload; removing clears both', () => {
    const { db, repo } = setup();
    const id = repo.vehicles.create(bike, { photo: 'file:///a.jpg' });
    expect(repo.vehicles.get(id)!.photoLocalUri).toBe('file:///a.jpg');
    repo.vehicles.setPhoto(id, 'photo', 'file:///b.jpg');
    expect(db.select().from(photoUploads).all().map((p) => p.localUri)).toEqual(['file:///b.jpg']);
    repo.vehicles.setPhoto(id, 'photo', null);
    expect(db.select().from(photoUploads).all()).toEqual([]);
    expect(repo.vehicles.get(id)).toMatchObject({ photoLocalUri: null, photoPath: null });
  });
});

describe('odometer points', () => {
  it('merges readings, refuels and services in time order; latest = most recent', () => {
    const { repo } = setup();
    const id = repo.vehicles.create(bike, {}, 1000);
    repo.refuels.create(
      id,
      { odometer: 10300, litres: 5, ratePerLitre: 270, totalCost: 1350, stationName: null },
      { timestamp: 3000 },
    );
    repo.odometer.add(id, 10150, 2000);
    repo.services.create(id, { type: 'oil', odometer: 10400, cost: null, notes: null }, 4000);
    expect(repo.odometer.points(id).map((p) => [p.odometer, p.source])).toEqual([
      [10000, 'baseline'],
      [10150, 'manual'],
      [10300, 'refuel'],
      [10400, 'service'],
    ]);
    expect(repo.odometer.latest(id)).toMatchObject({ odometer: 10400 });
  });

  it('deleted entries are excluded', () => {
    const { repo } = setup();
    const id = repo.vehicles.create(bike, {}, 1000);
    const r = repo.odometer.add(id, 12000, 2000);
    repo.odometer.remove(r);
    expect(repo.odometer.latest(id)).toMatchObject({ odometer: 10000 });
  });
});

describe('refuels', () => {
  it('list is oldest-first with odometer tie-break (mileage engine order)', () => {
    const { repo } = setup();
    const id = repo.vehicles.create(bike);
    const v = { litres: 5, ratePerLitre: 270, totalCost: 1350, stationName: null };
    repo.refuels.create(id, { ...v, odometer: 10400 }, { timestamp: 5000 });
    repo.refuels.create(id, { ...v, odometer: 10200 }, { timestamp: 3000 });
    repo.refuels.create(id, { ...v, odometer: 10100 }, { timestamp: 3000 });
    expect(repo.refuels.list(id).map((r) => r.odometer)).toEqual([10100, 10200, 10400]);
  });

  it('update and delete', () => {
    const { repo } = setup();
    const id = repo.vehicles.create(bike);
    const r = repo.refuels.create(id, { odometer: 10100, litres: 5, ratePerLitre: 270, totalCost: 1350, stationName: null });
    repo.refuels.update(r, { odometer: 10110, litres: 5.5, ratePerLitre: 270, totalCost: 1485, stationName: 'Shell' });
    expect(repo.refuels.get(r)).toMatchObject({ odometer: 10110, litres: 5.5, stationName: 'Shell' });
    repo.refuels.remove(r);
    expect(repo.refuels.get(r)).toBeUndefined();
  });
});

describe('pending count', () => {
  it('counts distinct rows plus photos', () => {
    const { repo } = setup();
    const id = repo.vehicles.create(bike, { photo: 'file:///a.jpg' });
    // vehicle (several outbox entries) + baseline + 1 photo
    expect(repo.sync.pendingCount()).toBe(3);
    repo.vehicles.update(id, { ...bike, make: 'Yamaha' });
    expect(repo.sync.pendingCount()).toBe(3);
  });
});

describe('refuel annotations and station history', () => {
  it('setAnomaly stores cause/note on the refuel and queues it', () => {
    const { db, repo } = setup();
    const id = repo.vehicles.create(bike);
    const r = repo.refuels.create(id, { odometer: 10100, litres: 5, ratePerLitre: 270, totalCost: 1350, stationName: null });
    db.delete(outbox).run();
    repo.refuels.setAnomaly(r, 'leak', 'drip');
    expect(repo.refuels.get(r)).toMatchObject({ anomalyCause: 'leak', anomalyNote: 'drip' });
    expect(db.select().from(outbox).all()).toHaveLength(1);
    repo.refuels.setAnomaly(r, null, null);
    expect(repo.refuels.get(r)).toMatchObject({ anomalyCause: null, anomalyNote: null });
  });

  it('knownStations returns named refuels with GPS across all vehicles', () => {
    const { repo } = setup();
    const a = repo.vehicles.create(bike);
    const b = repo.vehicles.create({ ...bike, plate: 'ABC 123' });
    const v = { litres: 5, ratePerLitre: 270, totalCost: 1350 };
    repo.refuels.create(a, { ...v, odometer: 10100, stationName: 'PSO' }, { lat: 31.5, lng: 74.3 });
    repo.refuels.create(b, { ...v, odometer: 10100, stationName: 'Shell' }, { lat: 31.6, lng: 74.4 });
    repo.refuels.create(a, { ...v, odometer: 10200, stationName: 'No GPS' });
    repo.refuels.create(a, { ...v, odometer: 10300, stationName: null }, { lat: 31.5, lng: 74.3 });
    expect(repo.refuels.knownStations().map((s) => s.stationName).sort()).toEqual(['PSO', 'Shell']);
  });
});

describe('repo → mileage engine (integration)', () => {
  it('flags a drop from stored refuels, picks up the cause, and recomputes after an edit', () => {
    const { computeMileage } = jest.requireActual('@/domain/mileage') as typeof import('@/domain/mileage');
    const { repo } = setup();
    const id = repo.vehicles.create(bike);
    const add = (odometer: number, day: number) =>
      repo.refuels.create(
        id,
        { odometer, litres: 10, ratePerLitre: 270, totalCost: 2700, stationName: null },
        { timestamp: day * 86_400_000 },
      );
    add(10_000, 1);
    add(10_400, 6);
    add(10_800, 11);
    add(11_200, 16);
    const last = add(11_500, 21); // 30 km/l vs normal 40 → −25%

    let m = computeMileage(repo.refuels.list(id));
    expect(m.intervals.at(-1)).toMatchObject({ kmPerLitre: 30, baseline: 40, flag: 'unusual_drop', toRefuelId: last });
    expect(m.pendingRefuelId).toBe(last);

    repo.refuels.setAnomaly(last, 'theft', 'parked outside overnight');
    m = computeMileage(repo.refuels.list(id));
    expect(m.intervals.at(-1)).toMatchObject({ cause: 'theft', note: 'parked outside overnight' });

    // Fixing a typo in the odometer clears the flag.
    repo.refuels.update(last, { odometer: 11_600, litres: 10, ratePerLitre: 270, totalCost: 2700, stationName: null });
    m = computeMileage(repo.refuels.list(id));
    expect(m.intervals.at(-1)!.flag).toBeNull();
  });
});
