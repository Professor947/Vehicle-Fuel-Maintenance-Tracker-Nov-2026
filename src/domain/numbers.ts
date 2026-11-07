import { toAsciiDigits } from './phone';

/**
 * Parse a user-typed decimal. Tolerates grouping commas, spaces, Urdu/Arabic digits,
 * and the Arabic decimal separator (٫). Returns null for empty or invalid input.
 */
export function parseDecimal(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = toAsciiDigits(String(input))
    .trim()
    .replace(/٫/g, '.')
    .replace(/[,\s٬]/g, '');
  if (s === '') return null;
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}
