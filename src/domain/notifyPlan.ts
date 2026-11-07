/**
 * Decides which local notifications to schedule, without re-firing ones already delivered.
 * State maps a notification key → the time it was (or will be) delivered. Pure + testable.
 */
export interface PlannedNotification {
  key: string;
  at: number;
  kind: 'service' | 'refuel';
  vehicleId: string;
  serviceType?: string;
}

export type NotifyState = Record<string, number>;

export interface PlanResult {
  /** Future notifications to (re)schedule. */
  schedule: PlannedNotification[];
  /** Due already passed and never delivered → show now. */
  fireNow: PlannedNotification[];
  nextState: NotifyState;
}

const STATE_TTL = 180 * 86_400_000;

export function planNotifications(candidates: PlannedNotification[], state: NotifyState, now: number): PlanResult {
  const schedule: PlannedNotification[] = [];
  const fireNow: PlannedNotification[] = [];
  const nextState: NotifyState = {};
  // Keep delivered history for a while so the same reminder never repeats.
  for (const [k, at] of Object.entries(state)) if (at <= now && now - at < STATE_TTL) nextState[k] = at;

  for (const c of candidates) {
    const prev = state[c.key];
    if (prev != null && prev <= now) continue; // already delivered once: never repeat
    if (c.at > now) {
      schedule.push(c);
      nextState[c.key] = c.at;
    } else {
      fireNow.push(c); // due passed and never delivered (e.g. app was closed / projection moved earlier)
      nextState[c.key] = now;
    }
  }
  return { schedule, fireNow, nextState };
}

/** Key identifies one specific due (changes when a new event resets the anchor or the interval changes). */
export function serviceKey(vehicleId: string, serviceType: string, anchorId: string, km: number | null, days: number | null) {
  return `svc:${vehicleId}:${serviceType}:${anchorId}:${km ?? '-'}:${days ?? '-'}`;
}

export function refuelKey(vehicleId: string, lastRefuelId: string) {
  return `refuel:${vehicleId}:${lastRefuelId}`;
}
