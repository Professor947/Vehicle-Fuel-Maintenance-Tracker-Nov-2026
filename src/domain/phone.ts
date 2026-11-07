/**
 * Pakistani mobile numbers → E.164 (+92 3XX XXXXXXX).
 * Accepts 03001234567, 3001234567, 923001234567, +92 300 1234567, 0092-300-1234567.
 * Returns null when the input is not a valid PK mobile number.
 */
export function normalizePkMobile(input: string): string | null {
  let digits = toAsciiDigits(input).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('92')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  // PK mobile numbers: 3XX XXXXXXX (10 digits after country code).
  if (!/^3\d{9}$/.test(digits)) return null;
  return `+92${digits}`;
}

/** Convert Urdu (Extended Arabic-Indic) and Arabic-Indic digits to ASCII. */
export function toAsciiDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}
