import { formatPlate } from '@/domain/plate';
import { i18n } from '@/i18n';
import { scanOdometer, scanPlate, scanPump, scanRegCard } from '@/services/ocr';

import type { ScanResult } from './ScanButton';

const t = (k: string): string => i18n.t(k);
const num = (n: number | null | undefined) => (n == null ? '' : String(Math.round(n * 100) / 100));

export async function runPlateScan(uri: string): Promise<ScanResult> {
  const [best, ...rest] = await scanPlate(uri);
  return { fields: [{ key: 'plate', label: t('vehicle.plate'), value: best ?? '', kind: 'text', alternatives: rest }] };
}

export async function runRegCardScan(uri: string): Promise<ScanResult> {
  const g = await scanRegCard(uri);
  return {
    fields: [
      { key: 'plate', label: t('vehicle.plate'), value: g.plate ? formatPlate(g.plate) : '', kind: 'text' },
      {
        key: 'type',
        label: t('vehicle.type'),
        value: g.type ?? '',
        kind: 'choice',
        options: [
          { value: 'bike', label: t('vehicle.type_bike') },
          { value: 'car', label: t('vehicle.type_car') },
        ],
      },
      { key: 'make', label: t('vehicle.make'), value: g.make ?? '', kind: 'text' },
    ],
  };
}

export function odometerScanRunner(lastKnown: number | null) {
  return async (uri: string): Promise<ScanResult> => {
    const [best, ...rest] = await scanOdometer(uri, lastKnown);
    return {
      fields: [
        {
          key: 'odometer',
          label: t('odometer.reading'),
          value: best != null ? String(best) : '',
          kind: 'number',
          alternatives: rest.map(String),
        },
      ],
    };
  };
}

export async function runPumpScan(uri: string): Promise<ScanResult> {
  const r = await scanPump(uri);
  return {
    note: r.source === 'none' ? undefined : t(`scan.source_${r.source}`),
    warning: r.litres != null && r.ratePerLitre != null && r.total != null && !r.consistent ? t('scan.mismatch') : undefined,
    fields: [
      { key: 'total', label: t('refuel.total'), value: num(r.total), kind: 'number' },
      { key: 'litres', label: t('refuel.litres'), value: num(r.litres), kind: 'number' },
      { key: 'ratePerLitre', label: t('refuel.rate'), value: num(r.ratePerLitre), kind: 'number' },
    ],
  };
}
