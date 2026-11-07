/**
 * Locale-aware formatting for PKR / km / litres. Pure (no RN imports) so it is unit-testable.
 * `lang` is the app language ('en' | 'ur'); both use Pakistani conventions (en-PK / ur-PK).
 */
export type AppLanguage = 'en' | 'ur';

const intlLocale = (lang: AppLanguage) => (lang === 'ur' ? 'ur-PK' : 'en-PK');

const cache = new Map<string, Intl.NumberFormat>();
function nf(lang: AppLanguage, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = lang + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(intlLocale(lang), opts);
    cache.set(key, f);
  }
  return f;
}

export function formatNumber(n: number, lang: AppLanguage, maxFractionDigits = 0): string {
  return nf(lang, { maximumFractionDigits: maxFractionDigits, minimumFractionDigits: 0 }).format(n);
}

/** Whole rupees by default; fuel rates use 2 decimals. */
export function formatPKR(n: number, lang: AppLanguage, fractionDigits = 0): string {
  const num = nf(lang, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(n);
  return lang === 'ur' ? `${num} روپے` : `Rs ${num}`;
}

export function formatKm(n: number, lang: AppLanguage): string {
  return `${formatNumber(n, lang, 0)} ${lang === 'ur' ? 'کلومیٹر' : 'km'}`;
}

export function formatLitres(n: number, lang: AppLanguage): string {
  return `${formatNumber(n, lang, 2)} ${lang === 'ur' ? 'لیٹر' : 'L'}`;
}

export function formatKmPerLitre(n: number, lang: AppLanguage): string {
  return `${formatNumber(n, lang, 1)} ${lang === 'ur' ? 'کلومیٹر/لیٹر' : 'km/l'}`;
}

export function formatDate(ms: number, lang: AppLanguage): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(ms),
  );
}

export function formatDateTime(ms: number, lang: AppLanguage): string {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

/** Signed percentage from a fraction: −0.2 → "−20%", 0.31 → "+31%". */
export function formatSignedPercent(fraction: number, lang: AppLanguage): string {
  return nf(lang, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' }).format(fraction);
}
