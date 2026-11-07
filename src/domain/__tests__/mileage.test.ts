import { classify, computeMileage, median, sortRefuels, type RefuelLike } from '../mileage';

const DAY = 86_400_000;
const T0 = Date.parse('2026-01-01T08:00:00Z');

/** Build refuels from (odometer, litres) pairs, one every `gapDays` days, rate 250. */
function series(points: [number, number][], gapDays = 5, rate = 250): RefuelLike[] {
  return points.map(([odometer, litres], i) => ({
    id: `r${i}`,
    timestamp: T0 + i * gapDays * DAY,
    odometer,
    litres,
    ratePerLitre: rate,
  }));
}

/** Refuels whose consecutive intervals have exactly the given km/l (litres fixed at 10). */
function fromKmpl(kmpls: number[]): RefuelLike[] {
  const pts: [number, number][] = [[10_000, 10]];
  let odo = 10_000;
  for (const k of kmpls) {
    odo += k * 10;
    pts.push([odo, 10]);
  }
  return series(pts);
}

describe('median', () => {
  it('odd count', () => expect(median([40, 10, 30])).toBe(30));
  it('even count averages the middle two', () => expect(median([40, 10, 30, 20])).toBe(25));
  it('empty → null', () => expect(median([])).toBeNull());
  it('does not mutate input', () => {
    const a = [3, 1, 2];
    median(a);
    expect(a).toEqual([3, 1, 2]);
  });
});

describe('first refuel and pending', () => {
  it('no refuels → nothing', () => {
    const m = computeMileage([]);
    expect(m).toMatchObject({
      intervals: [],
      pendingRefuelId: null,
      lifetimeKmPerLitre: null,
      currentBaseline: null,
      avgDaysBetweenRefuels: null,
      predictedNextRefuelAt: null,
    });
  });

  it('a single (first) refuel has no interval and is pending', () => {
    const m = computeMileage(series([[10_000, 5]]));
    expect(m.intervals).toEqual([]);
    expect(m.pendingRefuelId).toBe('r0');
    expect(m.lifetimeKmPerLitre).toBeNull();
    expect(m.predictedNextRefuelAt).toBeNull();
  });

  it('two refuels → one interval; the latest refuel is pending (its litres unused)', () => {
    const m = computeMileage(series([[10_000, 5], [10_200, 7]]));
    expect(m.intervals).toHaveLength(1);
    expect(m.pendingRefuelId).toBe('r1');
    // uses litres of the FIRST refuel (5), not the latest (7)
    expect(m.intervals[0]!.kmPerLitre).toBe(40);
  });
});

describe('per-interval formula', () => {
  const m = computeMileage(
    series([
      [10_000, 5],
      [10_200, 4],
      [10_380, 6],
    ]),
  );

  it('km/l_k = (odo_k − odo_{k−1}) / litres_{k−1}', () => {
    expect(m.intervals.map((i) => i.kmPerLitre)).toEqual([200 / 5, 180 / 4]);
  });

  it('cost/km_k = (litres_{k−1} × rate_{k−1}) / distance', () => {
    expect(m.intervals[0]!.costPerKm).toBeCloseTo((5 * 250) / 200, 10);
    expect(m.intervals[1]!.costPerKm).toBeCloseTo((4 * 250) / 180, 10);
  });

  it('uses the rate of refuel k−1, not total_cost and not the later rate', () => {
    const r: RefuelLike[] = [
      { id: 'a', timestamp: T0, odometer: 0, litres: 4, ratePerLitre: 250 },
      { id: 'b', timestamp: T0 + DAY, odometer: 100, litres: 4, ratePerLitre: 300 },
    ];
    const i = computeMileage(r).intervals[0]!;
    expect(i.fuelCost).toBe(1000);
    expect(i.costPerKm).toBe(10);
  });

  it('records ids, odometers, distance, days', () => {
    expect(m.intervals[1]).toMatchObject({
      index: 2,
      fromRefuelId: 'r1',
      toRefuelId: 'r2',
      startOdometer: 10_200,
      endOdometer: 10_380,
      distance: 180,
      litres: 4,
      days: 5,
    });
  });
});

describe('baseline (median of ALL prior intervals, needs ≥3)', () => {
  it('no baseline for intervals 1–3; baseline from the 4th', () => {
    const m = computeMileage(fromKmpl([40, 42, 38, 41]));
    expect(m.intervals.map((i) => i.baseline)).toEqual([null, null, null, 40]);
    expect(m.intervals.slice(0, 3).every((i) => i.flag === null)).toBe(true);
  });

  it('with <3 prior intervals even a huge drop is not flagged', () => {
    const m = computeMileage(fromKmpl([40, 40, 10]));
    expect(m.intervals[2]!.flag).toBeNull();
  });

  it('uses the even-count median when 4 prior intervals exist', () => {
    const m = computeMileage(fromKmpl([30, 40, 50, 60, 45]));
    expect(m.intervals[4]!.baseline).toBe(45);
  });

  it('flagged intervals still count toward later baselines', () => {
    const m = computeMileage(fromKmpl([40, 40, 40, 20, 20, 20, 40]));
    expect(m.intervals[3]!.flag).toBe('unusual_drop');
    // prior for the 6th interval: 40,40,40,20,20 → median 40 → 20 is still a drop
    expect(m.intervals[5]!.baseline).toBe(40);
    // prior for the 7th: 40,40,40,20,20,20 → median 30
    expect(m.intervals[6]!.baseline).toBe(30);
  });

  it('currentBaseline is the median of all valid intervals (for the next one)', () => {
    expect(computeMileage(fromKmpl([40, 42])).currentBaseline).toBeNull();
    expect(computeMileage(fromKmpl([40, 42, 38])).currentBaseline).toBe(40);
  });
});

describe('anomaly thresholds (strict: exactly at threshold is not flagged)', () => {
  const at = (last: number) => computeMileage(fromKmpl([40, 40, 40, last])).intervals[3]!;

  it('exactly 15% below → not flagged', () => expect(at(34).flag).toBeNull());
  it('just over 15% below → unusual_drop', () => expect(at(33.99).flag).toBe('unusual_drop'));
  it('20% below → unusual_drop with deviation −0.2', () => {
    const i = at(32);
    expect(i.flag).toBe('unusual_drop');
    expect(i.deviation).toBeCloseTo(-0.2, 10);
  });
  it('exactly 25% above → not flagged', () => expect(at(50).flag).toBeNull());
  it('just over 25% above → unusually_high', () => expect(at(50.01).flag).toBe('unusually_high'));
  it('normal variation → no flag', () => {
    expect(at(36).flag).toBeNull();
    expect(at(46).flag).toBeNull();
  });

  it('classify handles float noise at the boundary', () => {
    expect(classify(0.85 * 37.3, 37.3)).toBeNull();
    expect(classify(1.25 * 37.3, 37.3)).toBeNull();
    expect(classify(30, null)).toBeNull();
  });
});

describe('every interval is kept, raw (no skipping, no smoothing)', () => {
  it('returns one interval per consecutive pair, with raw values', () => {
    const kmpls = [40, 12, 41, 39, 90, 40];
    const m = computeMileage(fromKmpl(kmpls));
    expect(m.intervals).toHaveLength(kmpls.length);
    m.intervals.forEach((i, idx) => expect(i.kmPerLitre).toBeCloseTo(kmpls[idx]!, 10));
  });

  it('distance ≤ 0 is still emitted as invalid_entry with no km/l and does not poison baselines', () => {
    const m = computeMileage(
      series([
        [10_000, 10],
        [10_400, 10],
        [10_800, 10],
        [10_800, 10], // zero distance
        [10_700, 10], // odometer went backwards
        [11_100, 10],
        [11_500, 10],
      ]),
    );
    expect(m.intervals).toHaveLength(6);
    expect(m.intervals[2]).toMatchObject({ distance: 0, kmPerLitre: null, costPerKm: null, flag: 'invalid_entry' });
    expect(m.intervals[3]).toMatchObject({ distance: -100, kmPerLitre: null, flag: 'invalid_entry' });
    // valid priors before interval 6: 40, 40, 40 → baseline 40
    expect(m.intervals[5]!.baseline).toBe(40);
  });

  it('zero litres on refuel k−1 → invalid_entry', () => {
    const m = computeMileage(series([[0, 0], [100, 5]]));
    expect(m.intervals[0]).toMatchObject({ kmPerLitre: null, flag: 'invalid_entry' });
  });
});

describe('lifetime average (reference only)', () => {
  it('= total km / total litres over valid intervals', () => {
    const m = computeMileage(series([[0, 5], [200, 4], [380, 6], [380, 6], [600, 1]]));
    // valid: 200/5, 180/4, 220/6 (the 0-distance pair is excluded from both sums)
    expect(m.totalDistance).toBe(600);
    expect(m.totalLitres).toBe(15);
    expect(m.lifetimeKmPerLitre).toBe(40);
  });

  it('does not affect flags', () => {
    const m = computeMileage(fromKmpl([40, 40, 40, 33]));
    expect(m.lifetimeKmPerLitre).not.toBe(m.intervals[3]!.baseline);
    expect(m.intervals[3]!.flag).toBe('unusual_drop');
  });
});

describe('refuel prediction', () => {
  it('avg days between refuels → predicted next date', () => {
    const r = series([[0, 5], [200, 5], [400, 5]]);
    r[1]!.timestamp = T0 + 4 * DAY;
    r[2]!.timestamp = T0 + 10 * DAY; // gaps 4 and 6 → avg 5
    const m = computeMileage(r);
    expect(m.avgDaysBetweenRefuels).toBe(5);
    expect(m.predictedNextRefuelAt).toBe(T0 + 15 * DAY);
  });
});

describe('ordering', () => {
  it('sorts by time then odometer, regardless of input order', () => {
    const r = series([[100, 5], [300, 5], [200, 5]]);
    r[2]!.timestamp = r[1]!.timestamp; // same time as r1, lower odometer
    expect(sortRefuels(r).map((x) => x.id)).toEqual(['r0', 'r2', 'r1']);
    const shuffled = [r[1]!, r[0]!, r[2]!];
    expect(computeMileage(shuffled).intervals.map((i) => i.distance)).toEqual([100, 100]);
  });

  it('deleting a refuel recomputes the neighbouring interval', () => {
    const r = series([[0, 5], [200, 5], [400, 5]]);
    const m = computeMileage([r[0]!, r[2]!]);
    expect(m.intervals).toHaveLength(1);
    expect(m.intervals[0]).toMatchObject({ distance: 400, kmPerLitre: 80 });
  });
});

describe('annotations', () => {
  it('cause/note come from refuel k (the one that closes the interval)', () => {
    const r = series([[0, 5], [200, 5]]);
    r[1]!.anomalyCause = 'leak';
    r[1]!.anomalyNote = 'drip under tank';
    expect(computeMileage(r).intervals[0]).toMatchObject({ cause: 'leak', note: 'drip under tank' });
  });
});
