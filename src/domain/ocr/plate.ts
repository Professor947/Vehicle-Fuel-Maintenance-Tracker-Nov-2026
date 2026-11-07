import { toAsciiDigits } from '../phone';
import type { Candidate, OcrLine } from './types';

/** Words printed on plates/cards that are never the registration number. */
const STOPWORDS = new Set([
  'PUNJAB', 'SINDH', 'SIND', 'KPK', 'KP', 'BALOCHISTAN', 'ISLAMABAD', 'PAKISTAN', 'GOVT', 'GOVERNMENT',
  'EXCISE', 'TAXATION', 'MOTOR', 'REGISTRATION', 'CERTIFICATE', 'KHYBER', 'PAKHTUNKHWA', 'GB', 'AJK',
]);

const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G' };
const TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7' };

/**
 * Coerce an alphanumeric run into LETTERS + DIGITS (the shape shared by Pakistani plates across
 * provinces and eras: "LEA-1234", "LEB-07-1234", "ICT AB-123", "BKA-123", "KHI-2345").
 * Fixes common OCR swaps (O/0, I/1, S/5, B/8…). Returns null if it can't be made to fit.
 */
export function coercePlate(raw: string): { letters: string; digits: string; fixes: number } | null {
  const s = toAsciiDigits(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 3 || s.length > 11) return null;
  let best: { letters: string; digits: string; fixes: number; cost: number } | null = null;
  for (let k = 1; k <= Math.min(5, s.length - 1); k++) {
    const head = s.slice(0, k);
    const tail = s.slice(k);
    if (tail.length > 6) continue;
    let fixes = 0;
    let letterFixes = 0;
    let letters = '';
    for (const c of head) {
      if (/[A-Z]/.test(c)) letters += c;
      else if (TO_LETTER[c]) {
        letters += TO_LETTER[c];
        fixes++;
        letterFixes++;
      }
      else {
        letters = '';
        break;
      }
    }
    if (letters.length !== k) continue;
    let digits = '';
    for (const c of tail) {
      if (/\d/.test(c)) digits += c;
      else if (TO_DIGIT[c]) {
        digits += TO_DIGIT[c];
        fixes++;
      }
      else {
        digits = '';
        break;
      }
    }
    if (digits.length !== tail.length) continue;
    if (!/\d/.test(tail)) continue; // at least one real digit, or "HELLO" becomes "HELL-0"
    // Most plates end in 1–4 digits; longer suffixes (year forms like LEB-07-1234) cost a little more.
    // Prefixes are normally ≤3 letters; a longer one is only trusted if no letters had to be fixed
    // (e.g. "ICTAB" from a two-row Islamabad plate).
    const cost = fixes + (digits.length > 4 ? 1.5 : 0) + (letters.length > 3 && letterFixes > 0 ? 1.2 : 0);
    if (!best || cost < best.cost) best = { letters, digits, fixes, cost };
  }
  return best ? { letters: best.letters, digits: best.digits, fixes: best.fixes } : null;
}

export function formatCoerced(p: { letters: string; digits: string }): string {
  return `${p.letters}-${p.digits}`;
}

/**
 * Ranked plate guesses from OCR lines. Considers single lines and two-row plates (letters over
 * digits). Bigger text and fewer OCR fixes score higher. The user always confirms/edits.
 */
export function plateCandidates(lines: OcrLine[], max = 3): Candidate<string>[] {
  const usable = lines.filter((l) => {
    const words = l.text.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
    return !(words.length && words.every((w) => STOPWORDS.has(w)));
  });
  const maxH = Math.max(1, ...usable.map((l) => l.height));
  const scored = new Map<string, number>();
  const consider = (text: string, height: number) => {
    const c = coercePlate(text);
    if (!c || c.digits.length < 1 || c.letters.length < 1) return;
    if (c.letters.length + c.digits.length < 4 && c.digits.length < 3) return;
    const score = height / maxH - c.fixes * 0.15 + (c.digits.length >= 3 ? 0.2 : 0);
    const key = formatCoerced(c);
    scored.set(key, Math.max(scored.get(key) ?? -Infinity, score));
  };
  for (const l of usable) consider(l.text, l.height);
  // Two-row plates: a line directly above another, horizontally overlapping.
  for (const a of usable)
    for (const b of usable) {
      if (a === b || b.top <= a.top || b.top - (a.top + a.height) > a.height * 1.2) continue;
      const overlap = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
      if (overlap <= 0) continue;
      consider(a.text + b.text, Math.min(a.height, b.height));
    }
  return [...scored.entries()]
    .map(([value, score]) => ({ value, score }))
    .sort((x, y) => y.score - x.score)
    .slice(0, max);
}
