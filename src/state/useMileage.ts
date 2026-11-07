import { computeMileage, type MileageSummary } from '@/domain/mileage';

import { useLive } from './RepoContext';

/** Live mileage summary for a vehicle; recomputed from raw refuels on every DB change. */
export function useMileage(vehicleId: string | undefined): MileageSummary | null {
  return useLive((r) => (vehicleId ? computeMileage(r.refuels.list(vehicleId)) : null), [vehicleId]);
}
