import { parseDecimal } from './numbers';
import { formatPlate, normalizePlate, validatePlate, type PlateError } from './plate';
import { serviceTypesFor, type ServiceType, type VehicleType } from './types';

/** Error values are i18n keys under "errors.*". */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;
export type Result<T, K extends string> = { ok: true; value: T } | { ok: false; errors: FieldErrors<K> };

const MAX_ODOMETER = 9_999_999;

function odometer(raw: string, required: boolean): { value: number | null; error?: string } {
  const v = parseDecimal(raw);
  if (v == null) return required ? { value: null, error: 'required' } : { value: null };
  if (v < 0 || v > MAX_ODOMETER) return { value: null, error: 'odometer_range' };
  return { value: v };
}

function positive(raw: string, required: boolean): { value: number | null; error?: string } {
  const v = parseDecimal(raw);
  if (v == null) return required ? { value: null, error: 'required' } : { value: null };
  if (v <= 0) return { value: null, error: 'must_be_positive' };
  return { value: v };
}

// ---- Vehicle --------------------------------------------------------------
export interface VehicleInput {
  plate: string;
  type: VehicleType | null;
  make: string;
  model: string;
  odometerStart: string;
}
export interface VehicleValue {
  plate: string;
  type: VehicleType;
  make: string | null;
  model: string | null;
  odometerStart: number;
}
export function validateVehicle(
  input: VehicleInput,
  existingPlates: string[] = [],
): Result<VehicleValue, keyof VehicleInput> {
  const errors: FieldErrors<keyof VehicleInput> = {};
  const plateErr: PlateError | null = validatePlate(input.plate);
  if (plateErr) errors.plate = plateErr;
  else if (existingPlates.includes(normalizePlate(input.plate)))
    errors.plate = 'plate_duplicate';
  if (!input.type) errors.type = 'required';
  const odo = odometer(input.odometerStart, true);
  if (odo.error) errors.odometerStart = odo.error;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      plate: formatPlate(input.plate),
      type: input.type!,
      make: input.make.trim() || null,
      model: input.model.trim() || null,
      odometerStart: odo.value!,
    },
  };
}

// ---- Odometer -------------------------------------------------------------
export function validateOdometer(raw: string): Result<number, 'odometer'> {
  const o = odometer(raw, true);
  return o.error ? { ok: false, errors: { odometer: o.error } } : { ok: true, value: o.value! };
}

/** Soft warning only (never blocks saving): reading lower than the latest known one. */
export function odometerGoesBackwards(value: number, latestKnown: number | null): boolean {
  return latestKnown != null && value < latestKnown;
}

// ---- Refuel ---------------------------------------------------------------
export interface RefuelInput {
  odometer: string;
  litres: string;
  ratePerLitre: string;
  totalCost: string;
  stationName: string;
}
export interface RefuelValue {
  odometer: number;
  litres: number;
  ratePerLitre: number;
  totalCost: number;
  stationName: string | null;
}
/**
 * Any two of litres / rate / total determine the third; if all three are given they are kept
 * as entered (the pump display is the source of truth) and `mismatch` is set when they disagree
 * by more than 1%.
 */
export function validateRefuel(
  input: RefuelInput,
): Result<RefuelValue & { mismatch: boolean }, keyof RefuelInput> {
  const errors: FieldErrors<keyof RefuelInput> = {};
  const odo = odometer(input.odometer, true);
  if (odo.error) errors.odometer = odo.error;
  let litres = positive(input.litres, false);
  let rate = positive(input.ratePerLitre, false);
  let total = positive(input.totalCost, false);
  if (litres.error) errors.litres = litres.error;
  if (rate.error) errors.ratePerLitre = rate.error;
  if (total.error) errors.totalCost = total.error;
  if (Object.keys(errors).length) return { ok: false, errors };

  let L = litres.value, R = rate.value, T = total.value;
  if (L == null && R != null && T != null) L = T / R;
  else if (R == null && L != null && T != null) R = T / L;
  else if (T == null && L != null && R != null) T = L * R;

  if (L == null) errors.litres = 'required';
  if (R == null) errors.ratePerLitre = 'required';
  if (T == null) errors.totalCost = 'required';
  if (Object.keys(errors).length) return { ok: false, errors };

  const mismatch = Math.abs(L! * R! - T!) / T! > 0.01;
  return {
    ok: true,
    value: {
      odometer: odo.value!,
      litres: L!,
      ratePerLitre: R!,
      totalCost: T!,
      stationName: input.stationName.trim() || null,
      mismatch,
    },
  };
}

// ---- Service event --------------------------------------------------------
export interface ServiceInput {
  type: ServiceType | null;
  odometer: string;
  cost: string;
  notes: string;
}
export interface ServiceValue {
  type: ServiceType;
  odometer: number;
  cost: number | null;
  notes: string | null;
}
export function validateService(
  input: ServiceInput,
  vehicleType: VehicleType,
): Result<ServiceValue, keyof ServiceInput> {
  const errors: FieldErrors<keyof ServiceInput> = {};
  if (!input.type) errors.type = 'required';
  else if (!serviceTypesFor(vehicleType).includes(input.type)) errors.type = 'service_not_applicable';
  const odo = odometer(input.odometer, true);
  if (odo.error) errors.odometer = odo.error;
  const cost = parseDecimal(input.cost);
  if (cost != null && cost < 0) errors.cost = 'must_be_positive';
  if (input.cost.trim() && cost == null) errors.cost = 'invalid_number';
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { type: input.type!, odometer: odo.value!, cost, notes: input.notes.trim() || null },
  };
}
