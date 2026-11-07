// Pure helpers for the ocr-pump function (unit-tested with `node --test`).

export interface PumpReading {
  rate_per_litre: number | null;
  litres: number | null;
  total: number | null;
}

/** Structured-output schema: every field present, null when not clearly readable. */
export const PUMP_SCHEMA = {
  type: 'object',
  properties: {
    rate_per_litre: { type: ['number', 'null'], description: 'Price per litre in PKR as shown on the display' },
    litres: { type: ['number', 'null'], description: 'Volume dispensed in litres as shown on the display' },
    total: { type: ['number', 'null'], description: 'Sale amount in PKR as shown on the display' },
  },
  required: ['rate_per_litre', 'litres', 'total'],
  additionalProperties: false,
} as const;

export const PUMP_PROMPT = `This photo shows the display of a fuel dispenser at a petrol station in Pakistan.
Read the three numbers it shows:
- total: the sale amount in rupees (often labelled Sale, Amount, Rs or Rupees; usually the top or largest row)
- litres: the volume dispensed (often labelled Volume, Litres or Ltr)
- rate_per_litre: the unit price in rupees per litre (often labelled Price, Rate or Rs/Ltr)
Displays are usually seven-segment LCD or LED digits; decimal points are small and easy to miss, so look for them carefully.
Report only numbers that are actually visible on the display. Do not calculate a missing value from the other two, and do not guess: use null for any value you cannot read with confidence.`;

/** Upper bound on the base64 payload (≈3 MB image); the app sends ≤1280 px JPEGs, typically 150–400 KB. */
export const MAX_IMAGE_B64 = 4_000_000;

export function parseRequest(body: unknown): { imageBase64: string } | null {
  const b64 = (body as { image_base64?: unknown } | null)?.image_base64;
  if (typeof b64 !== 'string' || b64.length < 100 || b64.length > MAX_IMAGE_B64) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  return { imageBase64: b64 };
}

const RANGES = {
  rate_per_litre: [10, 5_000],
  litres: [0.05, 500],
  total: [10, 2_000_000],
} as const;

/** Parse the model's JSON text and drop values that are not plausible for a fuel sale. */
export function sanitizeReading(text: string): PumpReading {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
  } catch {
    // fall through to all-null
  }
  const out: PumpReading = { rate_per_litre: null, litres: null, total: null };
  for (const key of Object.keys(RANGES) as (keyof PumpReading)[]) {
    const v = raw[key];
    const [min, max] = RANGES[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) out[key] = v;
  }
  return out;
}
