import type { VehicleType } from '../types';
import { plateCandidates } from './plate';
import type { OcrLine } from './types';

export interface RegCardGuess {
  plate: string | null;
  type: VehicleType | null;
  make: string | null;
}

const BIKE = /\b(MOTOR\s*CYCLE|MOTORCYCLE|M\.?\s*CYCLE|M\/CYCLE|SCOOTER|BIKE)\b/;
const CAR = /\b(MOTOR\s*CAR|CAR|JEEP|SALOON|SEDAN|HATCH\s*BACK|STATION\s*WAGON|SUV|CROSSOVER)\b/;
const MAKES = [
  'HONDA', 'YAMAHA', 'SUZUKI', 'TOYOTA', 'KIA', 'HYUNDAI', 'CHANGAN', 'MG', 'HAVAL', 'PROTON', 'NISSAN',
  'DAIHATSU', 'MITSUBISHI', 'UNITED', 'ROAD PRINCE', 'SUPER POWER', 'UNIQUE', 'HI SPEED', 'DFSK', 'BAIC',
];

/** Best-effort read of a Pakistani registration card (book or smart card). Everything is editable. */
export function parseRegCard(lines: OcrLine[]): RegCardGuess {
  const all = lines.map((l) => l.text.toUpperCase()).join('\n');

  const type: VehicleType | null = BIKE.test(all) ? 'bike' : CAR.test(all) ? 'car' : null;

  let make: string | null = null;
  const makerLine = all.match(/(?:MAKER'?S?\s*NAME|MAKE|MANUFACTURER)\s*[:\-.]?\s*([A-Z][A-Z .]{1,30})/);
  if (makerLine?.[1]) make = makerLine[1].trim().replace(/\s+/g, ' ');
  if (!make) make = MAKES.find((m) => new RegExp(`\\b${m}\\b`).test(all)) ?? null;
  if (make) make = make.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());

  // Prefer the value printed after a "Registration No" label; else the best plate-like text.
  let plate: string | null = null;
  const regIdx = lines.findIndex((l) => /REG(ISTRATION)?\.?\s*(NO|NUMBER|#)/i.test(l.text));
  if (regIdx >= 0) {
    const sameLine = lines[regIdx]!.text.replace(/.*?(NO|NUMBER|#)\.?\s*[:\-]?\s*/i, '');
    const near = [sameLine, lines[regIdx + 1]?.text ?? ''].map((t) => ({ ...lines[regIdx]!, text: t }));
    plate = plateCandidates(near, 1)[0]?.value ?? null;
  }
  if (!plate) plate = plateCandidates(lines, 1)[0]?.value ?? null;

  return { plate, type, make };
}
