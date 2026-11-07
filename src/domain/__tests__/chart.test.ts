import { chartGeometry } from '../chart';
import { computeMileage, type RefuelLike } from '../mileage';

const DAY = 86_400_000;
function refuels(odos: number[]): RefuelLike[] {
  return odos.map((odometer, i) => ({ id: `r${i}`, timestamp: i * DAY, odometer, litres: 10, ratePerLitre: 250 }));
}

test('every interval gets an x slot; raw values; invalid ones are marked, not dropped', () => {
  const m = computeMileage(refuels([0, 400, 800, 1200, 1200, 1500]));
  const g = chartGeometry(m.intervals, 300, 120);
  expect(g.points.map((p) => p.kmPerLitre)).toEqual([40, 40, 40, 30]);
  expect(g.invalidX).toHaveLength(1);
  // invalid interval sits between the 3rd and 5th points
  expect(g.invalidX[0]).toBeGreaterThan(g.points[2]!.x);
  expect(g.invalidX[0]).toBeLessThan(g.points[3]!.x);
  // higher km/l → smaller y (SVG y grows downward)
  expect(g.points[3]!.y).toBeGreaterThan(g.points[0]!.y);
  // baseline only where ≥3 prior intervals existed (the last one)
  expect(g.baseline).toHaveLength(2);
});

test('empty input', () => {
  expect(chartGeometry([], 300, 120).points).toEqual([]);
});

test('single interval is centred', () => {
  const m = computeMileage(refuels([0, 400]));
  const g = chartGeometry(m.intervals, 300, 120);
  expect(g.points[0]!.x).toBeCloseTo(36 + (300 - 48) / 2);
});
