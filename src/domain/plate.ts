import { toAsciiDigits } from './phone';

/**
 * Pakistani plates vary by province and era (e.g. "LEA-1234", "LEB 07 1234", "ICT AB-123",
 * "BKA 123", "ABC 123", "KHI 2345"). We do not enforce a single pattern; we only require
 * something plausible and let the user correct it.
 */
export function formatPlate(input: string): string {
  return toAsciiDigits(input).toUpperCase().replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').trim();
}

/** Canonical key used for duplicate detection (and later OCR matching). */
export function normalizePlate(input: string): string {
  return toAsciiDigits(input).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type PlateError = 'plate_required' | 'plate_invalid';

export function validatePlate(input: string): PlateError | null {
  const n = normalizePlate(input);
  if (n.length === 0) return 'plate_required';
  if (n.length < 3 || n.length > 12 || !/\d/.test(n)) return 'plate_invalid';
  return null;
}
