import { computeMileage } from '@/domain/mileage';
import { kmPerDay } from '@/domain/odometer';
import { byUrgency, computeDue, effectiveInterval, type Anchor, type Due } from '@/domain/reminders';
import { serviceTypesFor, type ServiceType } from '@/domain/types';
import type { Repo } from '@/db/repo';
import type { Vehicle } from '@/db/schema';

export interface ServiceStatus {
  serviceType: ServiceType;
  enabled: boolean;
  /** null when disabled (or no interval could be determined). */
  due: Due | null;
  lastEvent: { timestamp: number; odometer: number } | null;
  eventCount: number;
}

export interface VehicleReminders {
  vehicle: Vehicle;
  services: ServiceStatus[];
  kmPerDay: number | null;
  latestOdometer: number | null;
  predictedNextRefuelAt: number | null;
  lastRefuelId: string | null;
}

/** Everything the maintenance UI and the notification scheduler need for one vehicle. */
export function vehicleReminders(repo: Repo, vehicle: Vehicle, now: number): VehicleReminders {
  const points = repo.odometer.points(vehicle.id);
  const latest = points.at(-1) ?? null;
  const rate = kmPerDay(points, now);
  const rules = repo.rules.byType(vehicle.id);
  const events = repo.services.list(vehicle.id);
  const baseline = repo.odometer.list(vehicle.id).find((r) => r.source === 'baseline');
  const baselineAnchor: Anchor = baseline
    ? { kind: 'baseline', id: baseline.id, timestamp: baseline.timestamp, odometer: baseline.odometer }
    : { kind: 'baseline', id: vehicle.id, timestamp: vehicle.createdAt, odometer: vehicle.odometerStart };

  const services = serviceTypesFor(vehicle.type).map((serviceType): ServiceStatus => {
    const rule = rules.get(serviceType) ?? null;
    const ofType = events.filter((e) => e.type === serviceType).sort((a, b) => a.timestamp - b.timestamp);
    const last = ofType.at(-1) ?? null;
    const enabled = rule?.enabled ?? true;
    const interval = effectiveInterval(vehicle.type, serviceType, rule, ofType);
    const anchor: Anchor = last
      ? { kind: 'event', id: last.id, timestamp: last.timestamp, odometer: last.odometer }
      : baselineAnchor;
    return {
      serviceType,
      enabled,
      due: enabled && interval ? computeDue({ serviceType, interval, anchor, latest, kmPerDay: rate, now }) : null,
      lastEvent: last ? { timestamp: last.timestamp, odometer: last.odometer } : null,
      eventCount: ofType.length,
    };
  });

  services.sort((a, b) => (a.due && b.due ? byUrgency(a.due, b.due) : a.due ? -1 : b.due ? 1 : 0));
  const mileage = computeMileage(repo.refuels.list(vehicle.id));
  return {
    vehicle,
    services,
    kmPerDay: rate,
    latestOdometer: latest?.odometer ?? null,
    predictedNextRefuelAt: mileage.predictedNextRefuelAt,
    lastRefuelId: mileage.pendingRefuelId,
  };
}
