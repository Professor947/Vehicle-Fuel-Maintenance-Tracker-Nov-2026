import { toAsciiDigits } from '../phone';
import type { Candidate, OcrLine } from './types';

/**
 * Ranked odometer readings from OCR. The odometer is usually the largest whole number (4–7 digits)
 * on the cluster; trip meters have a decimal and are smaller; speed/rpm scales are short numbers.
 * If the last known reading is given, plausible values (not lower, < +20,000 km) rank higher.
 */
export function odometerCandidates(lines: OcrLine[], lastKnown: number | null, max = 3): Candidate<number>[] {
  const maxH = Math.max(1, ...lines.map((l) => l.height));
  const out = new Map<number, number>();
  for (const l of lines) {
    const text = toAsciiDigits(l.text).toUpperCase();
    if (/KM\s*\/\s*H|MPH|RPM|X\s*1000/.test(text)) continue;
    // Drum digits often come back space-separated ("0 4 5 2 1 7"): join runs of single digits.
    const joined = text.replace(/\b(\d)(?:\s+(?=\d\b))/g, '$1');
    for (const m of joined.matchAll(/\d[\d,]*(?:\.\d)?/g)) {
      const token = m[0];
      const hasDecimal = token.includes('.');
      const digits = token.replace(/[,.]/g, '');
      const value = Number(token.replace(/,/g, '').split('.')[0]);
      if (digits.length < 3 || digits.length > 7 || !Number.isFinite(value)) continue;
      let score = l.height / maxH;
      if (digits.length >= 4) score += 0.3;
      if (hasDecimal) score -= 0.6; // trip meter
      if (lastKnown != null) {
        if (value < lastKnown) score -= 1;
        else if (value - lastKnown <= 20_000) score += 0.8;
      }
      out.set(value, Math.max(out.get(value) ?? -Infinity, score));
    }
  }
  return [...out.entries()]
    .map(([value, score]) => ({ value, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
