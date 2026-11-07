import type { Interval, IntervalFlag } from './mileage';

export interface ChartPoint {
  x: number;
  y: number;
  kmPerLitre: number;
  flag: IntervalFlag | null;
  index: number;
}
export interface ChartGeometry {
  points: ChartPoint[];
  /** Per-interval baseline as a dashed step line (null baselines break the line). */
  baseline: { x1: number; x2: number; y: number }[];
  /** x positions of invalid intervals (no km/l): drawn as a marker on the axis, never dropped silently. */
  invalidX: number[];
  yTicks: { y: number; value: number }[];
  min: number;
  max: number;
}

/**
 * Maps raw intervals to SVG coordinates. Every interval gets an x slot (including invalid ones),
 * values are plotted raw — no smoothing.
 */
export function chartGeometry(
  intervals: Interval[],
  width: number,
  height: number,
  pad = { left: 36, right: 12, top: 12, bottom: 20 },
): ChartGeometry {
  const values = intervals.flatMap((i) => [i.kmPerLitre, i.baseline]).filter((v): v is number => v != null);
  if (!values.length) return { points: [], baseline: [], invalidX: [], yTicks: [], min: 0, max: 0 };

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min = Math.max(0, min - span * 0.1);
  max = max + span * 0.1;

  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const n = intervals.length;
  const step = n > 1 ? plotW / (n - 1) : 0;
  const xAt = (i: number) => (n > 1 ? pad.left + i * step : pad.left + plotW / 2);
  const yAt = (v: number) => pad.top + plotH - ((v - min) / (max - min)) * plotH;

  const points: ChartPoint[] = [];
  const invalidX: number[] = [];
  const baseline: ChartGeometry['baseline'] = [];
  intervals.forEach((iv, i) => {
    const x = xAt(i);
    if (iv.kmPerLitre == null) invalidX.push(x);
    else points.push({ x, y: yAt(iv.kmPerLitre), kmPerLitre: iv.kmPerLitre, flag: iv.flag, index: iv.index });
    if (iv.baseline != null) {
      const half = n > 1 ? step / 2 : plotW / 2;
      baseline.push({ x1: Math.max(pad.left, x - half), x2: Math.min(width - pad.right, x + half), y: yAt(iv.baseline) });
    }
  });

  const yTicks = [0, 0.5, 1].map((f) => {
    const value = min + (max - min) * f;
    return { value, y: yAt(value) };
  });
  return { points, baseline, invalidX, yTicks, min, max };
}
