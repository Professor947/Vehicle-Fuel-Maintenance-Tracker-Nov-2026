import { planNotifications, serviceKey, type PlannedNotification } from '../notifyPlan';

const NOW = 1_000_000_000_000;
const H = 3_600_000;
const n = (key: string, at: number): PlannedNotification => ({ key, at, kind: 'service', vehicleId: 'v' });

test('future items are scheduled and remembered', () => {
  const r = planNotifications([n('a', NOW + H)], {}, NOW);
  expect(r.schedule.map((x) => x.key)).toEqual(['a']);
  expect(r.fireNow).toEqual([]);
  expect(r.nextState).toEqual({ a: NOW + H });
});

test('a past-due item never delivered fires once, now', () => {
  const r = planNotifications([n('a', NOW - H)], {}, NOW);
  expect(r.fireNow.map((x) => x.key)).toEqual(['a']);
  const again = planNotifications([n('a', NOW - H)], r.nextState, NOW + H);
  expect(again.fireNow).toEqual([]);
  expect(again.schedule).toEqual([]);
});

test('an item the OS already delivered is not repeated, even if its date moves later', () => {
  const first = planNotifications([n('a', NOW + H)], {}, NOW);
  const later = planNotifications([n('a', NOW + 5 * H)], first.nextState, NOW + 2 * H);
  expect(later.schedule).toEqual([]);
  expect(later.fireNow).toEqual([]);
});

test('if the due moves earlier before delivery, it fires now', () => {
  const first = planNotifications([n('a', NOW + 10 * H)], {}, NOW);
  const later = planNotifications([n('a', NOW - H)], first.nextState, NOW + H);
  expect(later.fireNow.map((x) => x.key)).toEqual(['a']);
});

test('a new event changes the key, so the next cycle notifies again', () => {
  expect(serviceKey('v', 'oil', 'e1', 1500, 60)).not.toBe(serviceKey('v', 'oil', 'e2', 1500, 60));
  expect(serviceKey('v', 'wash', 'e1', null, 14)).toBe('svc:v:wash:e1:-:14');
});

test('old delivered state expires after ~6 months', () => {
  const r = planNotifications([], { old: NOW - 200 * 24 * H, recent: NOW - H }, NOW);
  expect(r.nextState).toEqual({ recent: NOW - H });
});
