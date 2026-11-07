import type { ServiceType, VehicleType } from './types';

export interface IntervalSpec {
  /** null = time-only (e.g. wash, general service). */
  km: number | null;
  /** null = distance-only. */
  days: number | null;
}

/**
 * Owner-approved defaults (2026-11-07). Whichever of km / days comes first.
 * Used until 2+ events of that type are logged; then the user's observed intervals take over.
 */
export const DEFAULT_INTERVALS: Record<VehicleType, Partial<Record<ServiceType, IntervalSpec>>> = {
  bike: {
    oil: { km: 1500, days: 60 },
    chain_oil: { km: 500, days: 14 },
    filter: { km: 3000, days: 180 },
    general_service: { km: null, days: 30 }, // once a month
    wash: { km: null, days: 14 }, // fortnightly
  },
  car: {
    oil: { km: 3500, days: 90 },
    filter: { km: 5000, days: 180 },
    general_service: { km: null, days: 60 }, // every two months
    wash: { km: null, days: 14 },
  },
};

export function defaultInterval(vehicleType: VehicleType, type: ServiceType): IntervalSpec | null {
  return DEFAULT_INTERVALS[vehicleType][type] ?? null;
}
