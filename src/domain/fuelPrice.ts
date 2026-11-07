/**
 * Fuel price comes from the pump display at the time of fuelling (scanned or typed) — there is no
 * external price source. When starting a new refuel without a scan, the rate is pre-filled with the
 * last rate the user actually paid: this vehicle's latest refuel, else the latest refuel of any vehicle
 * of the same type (bike/car likely use the same fuel), else nothing.
 */
export interface PaidRate {
  ratePerLitre: number;
  timestamp: number;
  sameVehicle: boolean;
}

interface RefuelRate {
  vehicleId: string;
  timestamp: number;
  ratePerLitre: number;
}

export function lastPaidRate(
  refuels: RefuelRate[],
  vehicleId: string,
  vehicleTypeOf: (vehicleId: string) => string | undefined,
): PaidRate | null {
  const latest = (xs: RefuelRate[]) =>
    xs.filter((r) => r.ratePerLitre > 0).reduce<RefuelRate | null>((a, r) => (!a || r.timestamp > a.timestamp ? r : a), null);
  const own = latest(refuels.filter((r) => r.vehicleId === vehicleId));
  if (own) return { ratePerLitre: own.ratePerLitre, timestamp: own.timestamp, sameVehicle: true };
  const type = vehicleTypeOf(vehicleId);
  const sameType = latest(refuels.filter((r) => type != null && vehicleTypeOf(r.vehicleId) === type));
  return sameType ? { ratePerLitre: sameType.ratePerLitre, timestamp: sameType.timestamp, sameVehicle: false } : null;
}
