import { randomUUID } from 'node:crypto';

import { planNotifications } from '@/domain/notifyPlan';
import { createRepo } from '@/db/repo';
import { createTestDb } from '@/db/testDb';

import { notificationCandidates } from '../plan';
import { vehicleReminders } from '../vehicleDues';

const DAY = 86_400_000;
const T0 = Date.parse('2026-09-01T09:00:00Z');

function setup() {
  const db = createTestDb();
  const repo = createRepo({ db, userId: 'u', newId: randomUUID });
  const bikeId = repo.vehicles.create(
    { plate: 'LEA-1234', type: 'bike', make: null, model: null, odometerStart: 10_000 },
    {},
    T0,
  );
  return { repo, bike: repo.vehicles.get(bikeId)! };
}

const fill = (odometer: number) => ({ odometer, litres: 10, ratePerLitre: 270, totalCost: 2700, stationName: null });

test('bike with no history: every type anchored on the baseline with default intervals', () => {
  const { repo, bike } = setup();
  const r = vehicleReminders(repo, bike, T0 + DAY);
  expect(r.services.map((s) => s.serviceType).sort()).toEqual(['chain_oil', 'filter', 'general_service', 'oil', 'wash']);
  const chain = r.services.find((s) => s.serviceType === 'chain_oil')!;
  expect(chain.due).toMatchObject({ anchor: { kind: 'baseline' }, dueKm: 10_500, interval: { source: 'default' } });
  // no km/day yet → chain oil due by days (14) → sorted first with wash (14)
  expect(r.services[0]!.due!.dueAt).toBe(T0 + 14 * DAY);
});

test('logged events reset the anchor; 2 events switch to observed intervals', () => {
  const { repo, bike } = setup();
  repo.services.create(bike.id, { type: 'oil', odometer: 10_000, cost: 900, notes: null }, T0);
  repo.services.create(bike.id, { type: 'oil', odometer: 11_200, cost: 900, notes: null }, T0 + 40 * DAY);
  const r = vehicleReminders(repo, bike, T0 + 41 * DAY);
  const oil = r.services.find((s) => s.serviceType === 'oil')!;
  expect(oil.eventCount).toBe(2);
  expect(oil.due).toMatchObject({ interval: { km: 1200, days: 40, source: 'observed' }, dueKm: 12_400, anchor: { kind: 'event' } });
});

test('custom and disabled rules', () => {
  const { repo, bike } = setup();
  repo.rules.upsert(bike.id, 'wash', { mode: 'custom', intervalKm: null, intervalDays: 7, enabled: true });
  repo.rules.upsert(bike.id, 'filter', { mode: 'auto', intervalKm: null, intervalDays: null, enabled: false });
  const r = vehicleReminders(repo, bike, T0 + DAY);
  expect(r.services.find((s) => s.serviceType === 'wash')!.due).toMatchObject({ interval: { days: 7, source: 'custom' } });
  const filter = r.services.find((s) => s.serviceType === 'filter')!;
  expect(filter).toMatchObject({ enabled: false, due: null });
  // upsert updates the same rule rather than adding another
  repo.rules.upsert(bike.id, 'wash', { mode: 'auto', intervalKm: null, intervalDays: null, enabled: true });
  expect(repo.rules.list(bike.id)).toHaveLength(2);
});

test('km/day from refuels drives km-based due dates', () => {
  const { repo, bike } = setup();
  repo.refuels.create(bike.id, fill(10_400), { timestamp: T0 + 10 * DAY });
  repo.refuels.create(bike.id, fill(10_800), { timestamp: T0 + 20 * DAY }); // 40 km/day
  const r = vehicleReminders(repo, bike, T0 + 20 * DAY);
  expect(r.kmPerDay).toBe(40);
  const chain = r.services.find((s) => s.serviceType === 'chain_oil')!;
  // anchored at baseline 10,000; due 10,500 → already overdue at 10,800
  expect(chain.due).toMatchObject({ status: 'overdue', kmRemaining: -300 });
  const oil = r.services.find((s) => s.serviceType === 'oil')!;
  // 11,500 − 10,800 = 700 km / 40 = 17.5 days; days-due = T0+60 → km first
  expect(oil.due).toMatchObject({ trigger: 'km', dueAt: T0 + 37.5 * DAY });
  expect(r.predictedNextRefuelAt).toBe(T0 + 30 * DAY);
});

test('notification candidates + plan across a cycle', () => {
  const { repo, bike } = setup();
  repo.refuels.create(bike.id, fill(10_400), { timestamp: T0 + 10 * DAY });
  repo.refuels.create(bike.id, fill(10_800), { timestamp: T0 + 20 * DAY });
  const now = T0 + 20 * DAY;
  const cands = notificationCandidates([vehicleReminders(repo, bike, now)]);
  expect(cands.find((c) => c.kind === 'refuel')!.at).toBe(T0 + 29 * DAY); // 1 day before predicted
  const p1 = planNotifications(cands, {}, now);
  expect(p1.fireNow.map((c) => c.serviceType).sort()).toEqual(['chain_oil', 'wash']); // overdue (500 km / 14 days) → once, now
  // Next app open: chain oil not repeated; logging chain oil creates a fresh cycle.
  const p2 = planNotifications(notificationCandidates([vehicleReminders(repo, bike, now + 1000)]), p1.nextState, now + 1000);
  expect(p2.fireNow).toEqual([]);
  repo.services.create(bike.id, { type: 'chain_oil', odometer: 10_800, cost: null, notes: null }, now + 2000);
  const p3 = planNotifications(notificationCandidates([vehicleReminders(repo, bike, now + 3000)]), p2.nextState, now + 3000);
  expect(p3.schedule.some((c) => c.serviceType === 'chain_oil')).toBe(true);
});
