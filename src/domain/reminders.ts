import { defaultInterval, type IntervalSpec } from './defaults';
import { median } from './mileage';
import type { OdoPoint } from './odometer';
import type { ServiceType, VehicleType } from './types';

const DAY = 86_400_000;
export const NOTIFY_DAYS_BEFORE = 1;
export const NOTIFY_KM_BEFORE = 100;
export const MIN_EVENTS_FOR_OBSERVED = 2;

export interface RuleLike {
  serviceType: string;
  intervalKm: number | null;
  intervalDays: number | null;
  mode: 'auto' | 'custom';
  enabled: boolean;
}

export interface EventLike {
  id: string;
  timestamp: number;
  odometer: number;
}

export type IntervalSource = 'default' | 'observed' | 'custom';

export interface EffectiveInterval extends IntervalSpec {
  source: IntervalSource;
}

/**
 * custom rule → user's values; otherwise ≥2 logged events → median of the user's own gaps;
 * otherwise the per-vehicle-type default. Time-only services (default km = null) stay time-only.
 */
export function effectiveInterval(
  vehicleType: VehicleType,
  type: ServiceType,
  rule: RuleLike | null,
  events: EventLike[],
): EffectiveInterval | null {
  const def = defaultInterval(vehicleType, type);
  if (rule?.mode === 'custom') {
    if (rule.intervalKm == null && rule.intervalDays == null) return def ? { ...def, source: 'default' } : null;
    return { km: rule.intervalKm, days: rule.intervalDays, source: 'custom' };
  }
  if (!def) return null;
  if (events.length >= MIN_EVENTS_FOR_OBSERVED) {
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const kmGaps: number[] = [];
    const dayGaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const km = sorted[i]!.odometer - sorted[i - 1]!.odometer;
      const days = (sorted[i]!.timestamp - sorted[i - 1]!.timestamp) / DAY;
      if (km > 0) kmGaps.push(km);
      if (days >= 1) dayGaps.push(days);
    }
    const km = def.km == null ? null : (median(kmGaps) ?? def.km);
    const days = def.days == null ? null : (median(dayGaps) ?? def.days);
    if (kmGaps.length || dayGaps.length) return { km, days, source: 'observed' };
  }
  return { ...def, source: 'default' };
}

export interface Anchor {
  /** Last event of this type, or the vehicle's baseline reading when none was logged. */
  kind: 'event' | 'baseline';
  id: string;
  timestamp: number;
  odometer: number;
}

export type DueStatus = 'ok' | 'due_soon' | 'overdue';

export interface Due {
  serviceType: ServiceType;
  interval: EffectiveInterval;
  anchor: Anchor;
  dueKm: number | null;
  kmRemaining: number | null;
  dueByDaysAt: number | null;
  /** When the odometer is projected to reach dueKm (needs a km/day estimate). */
  dueByKmAt: number | null;
  /** Whichever comes first. */
  dueAt: number | null;
  trigger: 'km' | 'days' | null;
  status: DueStatus;
  /** 1 day before the days-due date, or when projected to be 100 km before dueKm — earliest. */
  notifyAt: number | null;
}

export interface DueInput {
  serviceType: ServiceType;
  interval: EffectiveInterval;
  anchor: Anchor;
  latest: OdoPoint | null;
  kmPerDay: number | null;
  now: number;
}

const minDefined = (...xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.min(...v) : null;
};

export function computeDue({ serviceType, interval, anchor, latest, kmPerDay, now }: DueInput): Due {
  const currentOdo = Math.max(latest?.odometer ?? anchor.odometer, anchor.odometer);
  const odoAsOf = latest && latest.odometer >= anchor.odometer ? latest.timestamp : anchor.timestamp;

  const dueKm = interval.km != null ? anchor.odometer + interval.km : null;
  const kmRemaining = dueKm != null ? dueKm - currentOdo : null;
  const dueByDaysAt = interval.days != null ? anchor.timestamp + interval.days * DAY : null;
  const projectAt = (targetKm: number) =>
    kmPerDay && kmPerDay > 0 ? odoAsOf + Math.max(0, (targetKm - currentOdo) / kmPerDay) * DAY : null;
  const dueByKmAt = dueKm != null ? (kmRemaining! <= 0 ? odoAsOf : projectAt(dueKm)) : null;

  const dueAt = minDefined(dueByKmAt, dueByDaysAt);
  const trigger = dueAt == null ? null : dueAt === dueByKmAt ? 'km' : 'days';

  const overdue = (kmRemaining != null && kmRemaining <= 0) || (dueByDaysAt != null && now >= dueByDaysAt);
  const soon =
    (kmRemaining != null && kmRemaining <= NOTIFY_KM_BEFORE) ||
    (dueAt != null && dueAt - now <= NOTIFY_DAYS_BEFORE * DAY);
  const status: DueStatus = overdue ? 'overdue' : soon ? 'due_soon' : 'ok';

  const notifyByDays = dueByDaysAt != null ? dueByDaysAt - NOTIFY_DAYS_BEFORE * DAY : null;
  const notifyByKm =
    dueKm != null ? (kmRemaining! <= NOTIFY_KM_BEFORE ? odoAsOf : projectAt(dueKm - NOTIFY_KM_BEFORE)) : null;

  return {
    serviceType,
    interval,
    anchor,
    dueKm,
    kmRemaining,
    dueByDaysAt,
    dueByKmAt,
    dueAt,
    trigger,
    status,
    notifyAt: minDefined(notifyByDays, notifyByKm),
  };
}

/** Sort for display: overdue, then soonest due. */
export function byUrgency(a: Due, b: Due): number {
  const rank = { overdue: 0, due_soon: 1, ok: 2 } as const;
  return rank[a.status] - rank[b.status] || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);
}
