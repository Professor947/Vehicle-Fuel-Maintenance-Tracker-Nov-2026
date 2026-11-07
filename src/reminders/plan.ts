import { NOTIFY_DAYS_BEFORE } from '@/domain/reminders';
import { refuelKey, serviceKey, type PlannedNotification } from '@/domain/notifyPlan';

import type { VehicleReminders } from './vehicleDues';

const DAY = 86_400_000;

/** Candidate notifications across all vehicles: each enabled service's notifyAt + refuel predictions. */
export function notificationCandidates(all: VehicleReminders[]): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  for (const v of all) {
    for (const s of v.services) {
      if (!s.due || s.due.notifyAt == null) continue;
      out.push({
        key: serviceKey(v.vehicle.id, s.serviceType, s.due.anchor.id, s.due.interval.km, s.due.interval.days),
        at: s.due.notifyAt,
        kind: 'service',
        vehicleId: v.vehicle.id,
        serviceType: s.serviceType,
      });
    }
    if (v.predictedNextRefuelAt != null && v.lastRefuelId) {
      out.push({
        key: refuelKey(v.vehicle.id, v.lastRefuelId),
        at: v.predictedNextRefuelAt - NOTIFY_DAYS_BEFORE * DAY,
        kind: 'refuel',
        vehicleId: v.vehicle.id,
      });
    }
  }
  return out;
}
