export const VEHICLE_TYPES = ['bike', 'car'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const SERVICE_TYPES = ['oil', 'filter', 'chain_oil', 'general_service', 'wash'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

/** Chain oil applies to bikes only. */
export function serviceTypesFor(vehicleType: VehicleType): ServiceType[] {
  return vehicleType === 'bike' ? [...SERVICE_TYPES] : SERVICE_TYPES.filter((t) => t !== 'chain_oil');
}

export const ODOMETER_SOURCES = ['baseline', 'manual', 'refuel', 'service', 'ocr'] as const;
export type OdometerSource = (typeof ODOMETER_SOURCES)[number];
