import { vehicleReminders, type VehicleReminders } from '@/reminders/vehicleDues';

import { useLive } from './RepoContext';

/** Live due status for every service of a vehicle. */
export function useReminders(vehicleId: string | undefined): VehicleReminders | null {
  return useLive(
    (r) => {
      const v = vehicleId ? r.vehicles.get(vehicleId) : undefined;
      return v ? vehicleReminders(r, v, Date.now()) : null;
    },
    [vehicleId],
  );
}
