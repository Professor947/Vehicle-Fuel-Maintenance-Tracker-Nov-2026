import { DEFAULT_INTERVALS, defaultInterval } from '../defaults';
import { kmPerDay } from '../odometer';
import { byUrgency, computeDue, effectiveInterval, type Anchor, type EffectiveInterval } from '../reminders';
import { serviceTypesFor } from '../types';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-07T09:00:00Z');
const d = (n: number) => NOW + n * DAY;

describe('defaults (owner-approved)', () => {
  it.each([
    ['bike', 'oil', 1500, 60],
    ['bike', 'chain_oil', 500, 14],
    ['bike', 'filter', 3000, 180],
    ['bike', 'general_service', null, 30],
    ['bike', 'wash', null, 14],
    ['car', 'oil', 3500, 90],
    ['car', 'filter', 5000, 180],
    ['car', 'general_service', null, 60],
    ['car', 'wash', null, 14],
  ] as const)('%s %s → %p km / %p days', (vt, st, km, days) => {
    expect(defaultInterval(vt, st)).toEqual({ km, days });
  });

  it('chain oil is bike-only; wash applies to both', () => {
    expect(defaultInterval('car', 'chain_oil')).toBeNull();
    expect(serviceTypesFor('car')).toEqual(['oil', 'filter', 'general_service', 'wash']);
    expect(serviceTypesFor('bike')).toEqual(['oil', 'filter', 'chain_oil', 'general_service', 'wash']);
  });

  it('every applicable type has a default', () => {
    for (const vt of ['bike', 'car'] as const)
      for (const st of serviceTypesFor(vt)) expect(DEFAULT_INTERVALS[vt][st]).toBeDefined();
  });
});

describe('kmPerDay', () => {
  it('null with <2 points or no movement', () => {
    expect(kmPerDay([], NOW)).toBeNull();
    expect(kmPerDay([{ timestamp: d(-10), odometer: 100 }], NOW)).toBeNull();
    expect(kmPerDay([{ timestamp: d(-10), odometer: 100 }, { timestamp: d(-1), odometer: 100 }], NOW)).toBeNull();
  });

  it('uses the last 60 days when that window spans ≥7 days', () => {
    const pts = [
      { timestamp: d(-300), odometer: 0 }, // old, slow usage
      { timestamp: d(-100), odometer: 1000 },
      { timestamp: d(-30), odometer: 2000 },
      { timestamp: d(0), odometer: 3500 }, // 1500 km in 30 days → 50/day recently
    ];
    expect(kmPerDay(pts, NOW)).toBe(50);
  });

  it('falls back to all history when recent data is too thin', () => {
    const pts = [
      { timestamp: d(-100), odometer: 0 },
      { timestamp: d(-2), odometer: 980 },
      { timestamp: d(0), odometer: 1000 },
    ];
    expect(kmPerDay(pts, NOW)).toBe(10);
  });

  it('ignores less than one day of span', () => {
    expect(kmPerDay([{ timestamp: d(0) - 3600_000, odometer: 0 }, { timestamp: d(0), odometer: 50 }], NOW)).toBeNull();
  });
});

describe('effectiveInterval: defaults → observed after 2+ events → custom', () => {
  const ev = (id: string, day: number, odo: number) => ({ id, timestamp: d(day), odometer: odo });

  it('0 or 1 event → default', () => {
    expect(effectiveInterval('bike', 'oil', null, [])).toEqual({ km: 1500, days: 60, source: 'default' });
    expect(effectiveInterval('bike', 'oil', null, [ev('a', -10, 1000)])).toMatchObject({ source: 'default' });
  });

  it('switches to observed at the 2nd event', () => {
    const r = effectiveInterval('bike', 'oil', null, [ev('a', -50, 1000), ev('b', -5, 2200)]);
    expect(r).toEqual({ km: 1200, days: 45, source: 'observed' });
  });

  it('observed uses the median of gaps', () => {
    const r = effectiveInterval('bike', 'oil', null, [
      ev('a', -200, 0),
      ev('b', -150, 1000),
      ev('c', -100, 3000),
      ev('d', -40, 4400),
    ]);
    // km gaps 1000, 2000, 1400 → 1400; day gaps 50, 50, 60 → 50
    expect(r).toEqual({ km: 1400, days: 50, source: 'observed' });
  });

  it('time-only services stay time-only when observed', () => {
    const r = effectiveInterval('car', 'wash', null, [ev('a', -30, 1000), ev('b', -20, 1300)]);
    expect(r).toEqual({ km: null, days: 10, source: 'observed' });
  });

  it('a degenerate gap falls back to the default for that part', () => {
    // same day, same odometer: no usable gap at all → default
    expect(effectiveInterval('bike', 'oil', null, [ev('a', -5, 1000), ev('b', -5, 1000)])).toMatchObject({
      source: 'default',
    });
  });

  it('custom rule overrides everything; auto rule behaves like no rule', () => {
    const custom = { serviceType: 'oil', intervalKm: 2000, intervalDays: null, mode: 'custom' as const, enabled: true };
    expect(effectiveInterval('bike', 'oil', custom, [ev('a', -50, 1000), ev('b', -5, 2200)])).toEqual({
      km: 2000,
      days: null,
      source: 'custom',
    });
    const auto = { ...custom, mode: 'auto' as const };
    expect(effectiveInterval('bike', 'oil', auto, [])).toMatchObject({ source: 'default' });
  });
});

describe('computeDue: whichever comes first', () => {
  const oil: EffectiveInterval = { km: 1500, days: 60, source: 'default' };
  const anchor = (day: number, odo: number): Anchor => ({ kind: 'event', id: 'e1', timestamp: d(day), odometer: odo });

  it('km comes first for a heavy rider', () => {
    // last oil change 10 days ago at 10,000; now 10,500; 50 km/day → 1000 km left = 20 days
    const due = computeDue({
      serviceType: 'oil',
      interval: oil,
      anchor: anchor(-10, 10_000),
      latest: { timestamp: NOW, odometer: 10_500 },
      kmPerDay: 50,
      now: NOW,
    });
    expect(due).toMatchObject({ dueKm: 11_500, kmRemaining: 1000, dueByKmAt: d(20), dueByDaysAt: d(50), trigger: 'km', status: 'ok' });
    expect(due.dueAt).toBe(d(20));
    // notify when 100 km before → 900 km / 50 = 18 days
    expect(due.notifyAt).toBe(d(18));
  });

  it('days come first for a light rider', () => {
    const due = computeDue({
      serviceType: 'oil',
      interval: oil,
      anchor: anchor(-50, 10_000),
      latest: { timestamp: NOW, odometer: 10_200 },
      kmPerDay: 4,
      now: NOW,
    });
    expect(due).toMatchObject({ trigger: 'days', dueAt: d(10), status: 'ok' });
    expect(due.notifyAt).toBe(d(9)); // 1 day before
  });

  it('overdue by km', () => {
    const due = computeDue({
      serviceType: 'oil',
      interval: oil,
      anchor: anchor(-10, 10_000),
      latest: { timestamp: NOW, odometer: 11_600 },
      kmPerDay: 50,
      now: NOW,
    });
    expect(due).toMatchObject({ status: 'overdue', kmRemaining: -100, trigger: 'km' });
    expect(due.notifyAt).toBeLessThanOrEqual(NOW);
  });

  it('overdue by days', () => {
    const due = computeDue({
      serviceType: 'oil',
      interval: oil,
      anchor: anchor(-61, 10_000),
      latest: { timestamp: NOW, odometer: 10_100 },
      kmPerDay: 2,
      now: NOW,
    });
    expect(due.status).toBe('overdue');
  });

  it('due soon within 100 km or 1 day', () => {
    const base = { serviceType: 'oil' as const, interval: oil, kmPerDay: 10, now: NOW };
    expect(computeDue({ ...base, anchor: anchor(-10, 10_000), latest: { timestamp: NOW, odometer: 11_400 } }).status).toBe('due_soon');
    expect(computeDue({ ...base, anchor: anchor(-10, 10_000), latest: { timestamp: NOW, odometer: 11_399 } }).status).toBe('ok');
    expect(computeDue({ ...base, anchor: anchor(-59, 10_000), latest: { timestamp: NOW, odometer: 10_100 } }).status).toBe('due_soon');
  });

  it('without a km/day estimate only the days date is projected, but km status still works', () => {
    const due = computeDue({
      serviceType: 'oil',
      interval: oil,
      anchor: anchor(-10, 10_000),
      latest: { timestamp: NOW, odometer: 10_500 },
      kmPerDay: null,
      now: NOW,
    });
    expect(due).toMatchObject({ dueByKmAt: null, dueAt: d(50), trigger: 'days', kmRemaining: 1000 });
    expect(due.notifyAt).toBe(d(49));
  });

  it('time-only (wash every 14 days)', () => {
    const due = computeDue({
      serviceType: 'wash',
      interval: { km: null, days: 14, source: 'default' },
      anchor: anchor(-3, 10_000),
      latest: { timestamp: NOW, odometer: 10_900 },
      kmPerDay: 300,
      now: NOW,
    });
    expect(due).toMatchObject({ dueKm: null, kmRemaining: null, dueAt: d(11), trigger: 'days', notifyAt: d(10) });
  });

  it('no history: anchored on the vehicle baseline', () => {
    const due = computeDue({
      serviceType: 'chain_oil',
      interval: { km: 500, days: 14, source: 'default' },
      anchor: { kind: 'baseline', id: 'b', timestamp: d(-2), odometer: 5000 },
      latest: { timestamp: NOW, odometer: 5100 },
      kmPerDay: 50,
      now: NOW,
    });
    expect(due).toMatchObject({ dueKm: 5500, kmRemaining: 400, dueAt: d(8), trigger: 'km' });
  });

  it('readings older than the anchor do not count backwards', () => {
    const due = computeDue({
      serviceType: 'oil',
      interval: oil,
      anchor: anchor(-1, 10_000),
      latest: { timestamp: d(-5), odometer: 9_000 },
      kmPerDay: 50,
      now: NOW,
    });
    expect(due.kmRemaining).toBe(1500);
  });

  it('byUrgency sorts overdue, due soon, then soonest', () => {
    const mk = (status: 'ok' | 'due_soon' | 'overdue', dueAt: number) => ({ status, dueAt }) as never;
    const sorted = [mk('ok', d(5)), mk('overdue', d(-1)), mk('ok', d(2)), mk('due_soon', d(1))].sort(byUrgency);
    expect(sorted.map((x: { status: string }) => x.status)).toEqual(['overdue', 'due_soon', 'ok', 'ok']);
  });
});
