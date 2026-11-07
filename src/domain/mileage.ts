/**
 * Fuel economy engine — implements the approved spec exactly. Pure, no RN imports.
 *
 * Users refuel when the low-fuel alarm comes on, so each refuel restores the tank to about the
 * same low point. For consecutive refuels k-1 → k:
 *   km/l_k      = (odo_k − odo_{k-1}) / litres_{k-1}
 *   cost/km_k   = (litres_{k-1} × rate_{k-1}) / distance
 * Every interval is returned (never skipped, never smoothed). The latest refuel is "pending".
 */

export const DROP_THRESHOLD = 0.15; // flag if more than 15% below baseline
export const HIGH_THRESHOLD = 0.25; // flag if more than 25% above baseline
export const MIN_PRIOR_FOR_BASELINE = 3;
const EPS = 1e-9; // guards float noise so "exactly 15%" is not flagged

export const ANOMALY_CAUSES = ['leak', 'theft', 'bad_fuel', 'tyre_pressure', 'load', 'entry_error', 'other'] as const;
export type AnomalyCause = (typeof ANOMALY_CAUSES)[number];

export interface RefuelLike {
  id: string;
  timestamp: number;
  odometer: number;
  litres: number;
  ratePerLitre: number;
  anomalyCause?: string | null;
  anomalyNote?: string | null;
}

/**
 * unusual_drop   — km/l more than 15% below baseline (leak, theft, bad fuel…)
 * unusually_high — km/l more than 25% above baseline (usually an entry error)
 * invalid_entry  — distance ≤ 0 or litres ≤ 0: no km/l can be computed; shown so the user fixes it
 */
export type IntervalFlag = 'unusual_drop' | 'unusually_high' | 'invalid_entry';

export interface Interval {
  /** 1-based position of the closing refuel (interval k). */
  index: number;
  fromRefuelId: string;
  toRefuelId: string;
  startAt: number;
  endAt: number;
  startOdometer: number;
  endOdometer: number;
  distance: number;
  litres: number; // litres_{k-1}
  fuelCost: number; // litres_{k-1} × rate_{k-1}
  kmPerLitre: number | null;
  costPerKm: number | null;
  /** Median km/l of all prior valid intervals; null until there are ≥3. */
  baseline: number | null;
  /** kmPerLitre / baseline − 1 (e.g. −0.2 = 20% below). */
  deviation: number | null;
  flag: IntervalFlag | null;
  days: number;
  /** User annotation, stored on refuel k. */
  cause: string | null;
  note: string | null;
}

export interface MileageSummary {
  intervals: Interval[];
  /** The latest refuel: its litres are only used once the next refuel is logged. */
  pendingRefuelId: string | null;
  /** Reference stat only (total km / total litres over valid intervals). Never drives alerts. */
  lifetimeKmPerLitre: number | null;
  totalDistance: number;
  totalLitres: number;
  /** Baseline that the NEXT interval will be compared against. */
  currentBaseline: number | null;
  avgDaysBetweenRefuels: number | null;
  predictedNextRefuelAt: number | null;
}

const DAY = 86_400_000;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Same order as repo.refuels.list: time, then odometer. Stable for exact ties. */
export function sortRefuels<T extends RefuelLike>(refuels: T[]): T[] {
  return [...refuels].sort((a, b) => a.timestamp - b.timestamp || a.odometer - b.odometer);
}

export function classify(kmPerLitre: number, baseline: number | null): IntervalFlag | null {
  if (baseline == null || baseline <= 0) return null;
  const ratio = kmPerLitre / baseline;
  if (ratio < 1 - DROP_THRESHOLD - EPS) return 'unusual_drop';
  if (ratio > 1 + HIGH_THRESHOLD + EPS) return 'unusually_high';
  return null;
}

export function computeMileage(input: RefuelLike[]): MileageSummary {
  const refuels = sortRefuels(input);
  const intervals: Interval[] = [];
  const priorValid: number[] = [];

  for (let k = 1; k < refuels.length; k++) {
    const prev = refuels[k - 1]!;
    const cur = refuels[k]!;
    const distance = cur.odometer - prev.odometer;
    const fuelCost = prev.litres * prev.ratePerLitre;
    const valid = distance > 0 && prev.litres > 0;
    const kmPerLitre = valid ? distance / prev.litres : null;
    const costPerKm = valid ? fuelCost / distance : null;
    const baseline = priorValid.length >= MIN_PRIOR_FOR_BASELINE ? median(priorValid) : null;

    intervals.push({
      index: k,
      fromRefuelId: prev.id,
      toRefuelId: cur.id,
      startAt: prev.timestamp,
      endAt: cur.timestamp,
      startOdometer: prev.odometer,
      endOdometer: cur.odometer,
      distance,
      litres: prev.litres,
      fuelCost,
      kmPerLitre,
      costPerKm,
      baseline,
      deviation: kmPerLitre != null && baseline ? kmPerLitre / baseline - 1 : null,
      flag: kmPerLitre == null ? 'invalid_entry' : classify(kmPerLitre, baseline),
      days: (cur.timestamp - prev.timestamp) / DAY,
      cause: cur.anomalyCause ?? null,
      note: cur.anomalyNote ?? null,
    });
    // Flagged intervals still count toward later baselines ("all prior intervals").
    if (kmPerLitre != null) priorValid.push(kmPerLitre);
  }

  const validIntervals = intervals.filter((i) => i.kmPerLitre != null);
  const totalDistance = validIntervals.reduce((s, i) => s + i.distance, 0);
  const totalLitres = validIntervals.reduce((s, i) => s + i.litres, 0);
  const avgDays = intervals.length ? intervals.reduce((s, i) => s + i.days, 0) / intervals.length : null;
  const last = refuels.at(-1);

  return {
    intervals,
    pendingRefuelId: last?.id ?? null,
    lifetimeKmPerLitre: totalLitres > 0 ? totalDistance / totalLitres : null,
    totalDistance,
    totalLitres,
    currentBaseline: priorValid.length >= MIN_PRIOR_FOR_BASELINE ? median(priorValid) : null,
    avgDaysBetweenRefuels: avgDays,
    predictedNextRefuelAt: avgDays != null && last ? last.timestamp + avgDays * DAY : null,
  };
}
