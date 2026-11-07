import { toAsciiDigits } from '../phone';
import type { OcrLine } from './types';

export interface PumpGuess {
  litres: number | null;
  ratePerLitre: number | null;
  total: number | null;
  /** true when litres × rate ≈ total (within 2%): safe to skip the cloud fallback. */
  consistent: boolean;
}

const LABELS = {
  total: /\b(SALE|AMOUNT|AMT|RUPEES|RS\.?|PKR|TOTAL)\b/,
  litres: /\b(VOLUME|VOL|LITRES?|LITERS?|LTRS?|LTR)\b/,
  ratePerLitre: /\b(PRICE|RATE|UNIT\s*PRICE|RS\s*\/\s*L(TR)?)\b/,
} as const;

interface Num {
  value: number;
  line: OcrLine;
}

function numbersIn(lines: OcrLine[]): Num[] {
  const out: Num[] = [];
  for (const line of lines) {
    const t = toAsciiDigits(line.text).replace(/,/g, '');
    for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) {
      const v = Number(m[0]);
      if (Number.isFinite(v) && v > 0) out.push({ value: v, line });
    }
  }
  return out;
}

export const consistent = (l: number, r: number, t: number) => Math.abs(l * r - t) / t <= 0.02;

/**
 * Read litres / rate / total from on-device OCR of a pump display. Uses printed labels when
 * present, otherwise searches all number triples for one where litres × rate ≈ total.
 * Seven-segment digits are often misread on-device; when this isn't `consistent`, the app asks
 * the cloud reader (Claude) and the user confirms either way.
 */
export function parsePump(lines: OcrLine[]): PumpGuess {
  const nums = numbersIn(lines);
  const guess: PumpGuess = { litres: null, ratePerLitre: null, total: null, consistent: false };

  // 1. Labelled values: number on the same line as the label, or on the next line below it.
  for (const [key, re] of Object.entries(LABELS) as [keyof typeof LABELS, RegExp][]) {
    const label = lines.find((l) => re.test(l.text.toUpperCase()));
    if (!label) continue;
    const same = nums.find((n) => n.line === label);
    const below = nums
      .filter((n) => n.line.top > label.top && n.line.top - label.top < label.height * 3)
      .sort((a, b) => a.line.top - b.line.top)[0];
    const pick = same ?? below;
    if (pick) guess[key] = pick.value;
  }
  if (guess.litres && guess.ratePerLitre && guess.total && consistent(guess.litres, guess.ratePerLitre, guess.total)) {
    return { ...guess, consistent: true };
  }

  // 2. Any triple that satisfies litres × rate ≈ total (rate in a sane PKR range).
  const values = [...new Set(nums.map((n) => n.value))].slice(0, 12);
  for (const t of values)
    for (const r of values)
      for (const l of values) {
        if (t === r || t === l || r === l) continue;
        if (r < 50 || r > 2000 || l > 500) continue;
        if (consistent(l, r, t)) return { litres: l, ratePerLitre: r, total: t, consistent: true };
      }

  return guess;
}
