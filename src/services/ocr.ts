import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import { File } from 'expo-file-system';

import { odometerCandidates } from '@/domain/ocr/odometer';
import { plateCandidates } from '@/domain/ocr/plate';
import { consistent, parsePump, type PumpGuess } from '@/domain/ocr/pump';
import { parseRegCard, type RegCardGuess } from '@/domain/ocr/regCard';
import type { OcrLine } from '@/domain/ocr/types';

import { isSupabaseConfigured, supabase } from './supabase';

/**
 * On-device text recognition (ML Kit, bundled model: works offline). Never throws — any failure
 * returns no lines and the user simply types the values. Every OCR value goes through an editable
 * confirm step before it is used.
 */
export async function recognizeLines(uri: string): Promise<OcrLine[]> {
  try {
    const result = await recognizeText(uri);
    return result.blocks.flatMap((b) =>
      b.lines.map((l) => ({
        text: l.text,
        top: l.frame.top,
        left: l.frame.left,
        height: l.frame.bottom - l.frame.top,
        width: l.frame.right - l.frame.left,
      })),
    );
  } catch {
    return [];
  }
}

export async function scanPlate(uri: string): Promise<string[]> {
  return plateCandidates(await recognizeLines(uri)).map((c) => c.value);
}

export async function scanRegCard(uri: string): Promise<RegCardGuess> {
  return parseRegCard(await recognizeLines(uri));
}

export async function scanOdometer(uri: string, lastKnown: number | null): Promise<number[]> {
  return odometerCandidates(await recognizeLines(uri), lastKnown).map((c) => c.value);
}

export type PumpScan = PumpGuess & { source: 'device' | 'cloud' | 'none' };

const CLOUD_TIMEOUT_MS = 20_000;

/**
 * Pump display: on-device first. Seven-segment digits are often misread, so when the three values
 * don't satisfy litres × rate ≈ total we ask the cloud reader (Claude, via the ocr-pump edge
 * function). Offline or on any failure we keep whatever the device read.
 */
export async function scanPump(uri: string): Promise<PumpScan> {
  const device = parsePump(await recognizeLines(uri));
  if (device.consistent) return { ...device, source: 'device' };
  if (!isSupabaseConfigured) return { ...device, source: device.total || device.litres ? 'device' : 'none' };
  try {
    const imageBase64 = await new File(uri).base64();
    const res = await Promise.race([
      supabase.functions.invoke<{
        reading: { rate_per_litre: number | null; litres: number | null; total: number | null } | null;
      }>('ocr-pump', { body: { image_base64: imageBase64 } }),
      new Promise<null>((r) => setTimeout(() => r(null), CLOUD_TIMEOUT_MS)),
    ]);
    const reading = res?.data?.reading;
    if (reading && (reading.litres != null || reading.rate_per_litre != null || reading.total != null)) {
      const litres = reading.litres ?? device.litres;
      const ratePerLitre = reading.rate_per_litre ?? device.ratePerLitre;
      const total = reading.total ?? device.total;
      return {
        litres,
        ratePerLitre,
        total,
        consistent: litres != null && ratePerLitre != null && total != null && consistent(litres, ratePerLitre, total),
        source: 'cloud',
      };
    }
  } catch {
    // keep the device result
  }
  return { ...device, source: device.total || device.litres || device.ratePerLitre ? 'device' : 'none' };
}
