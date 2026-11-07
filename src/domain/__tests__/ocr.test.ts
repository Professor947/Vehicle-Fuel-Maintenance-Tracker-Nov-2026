import { odometerCandidates } from '../ocr/odometer';
import { coercePlate, plateCandidates } from '../ocr/plate';
import { parsePump } from '../ocr/pump';
import { parseRegCard } from '../ocr/regCard';
import type { OcrLine } from '../ocr/types';

let y = 0;
const line = (text: string, height = 20, left = 0, width = 200): OcrLine => {
  y += height + 10;
  return { text, top: y, left, height, width };
};
beforeEach(() => (y = 0));

describe('coercePlate (province/era variants + OCR swaps)', () => {
  it.each([
    ['LEA-1234', 'LEA', '1234', 0],
    ['LEB 07 1234', 'LEB', '071234', 0],
    ['ICT AB-123', 'ICTAB', '123', 0],
    ['BKA 123', 'BKA', '123', 0],
    ['KHI 2345', 'KHI', '2345', 0],
    ['LE0-I234', 'LEO', '1234', 2], // 0→O in letters, I→1 in digits
    ['5TR-8O8', 'STR', '808', 2],
  ])('%s', (raw, letters, digits, fixes) => {
    expect(coercePlate(raw)).toEqual({ letters, digits, fixes });
  });

  it('rejects text that cannot be a plate', () => {
    expect(coercePlate('PUNJABPAKISTAN')).toBeNull();
    expect(coercePlate('12')).toBeNull();
  });
});

describe('plateCandidates', () => {
  it('ignores province words and prefers the biggest plate-like text', () => {
    const c = plateCandidates([line('PUNJAB', 12), line('LEA-1234', 40), line('07', 10)]);
    expect(c[0]!.value).toBe('LEA-1234');
  });

  it('joins two-row plates (letters above digits)', () => {
    const lines = [
      { text: 'ICT', top: 10, left: 50, height: 30, width: 80 },
      { text: 'AB-123', top: 45, left: 40, height: 30, width: 110 },
    ];
    expect(plateCandidates(lines).map((c) => c.value)).toContain('ICTAB-123');
  });

  it('returns nothing for unrelated text', () => {
    expect(plateCandidates([line('GOVERNMENT OF PUNJAB')])).toEqual([]);
  });
});

describe('parseRegCard', () => {
  it('reads plate after the label, type and make', () => {
    const r = parseRegCard([
      line('EXCISE & TAXATION DEPARTMENT'),
      line('Registration No: LEB-19-4521'),
      line("Maker's Name: HONDA"),
      line('Class of Vehicle: MOTOR CYCLE'),
    ]);
    expect(r).toEqual({ plate: 'LEB-194521', type: 'bike', make: 'Honda' });
  });

  it('detects cars and known makes without labels', () => {
    const r = parseRegCard([line('TOYOTA COROLLA SALOON'), line('ABC 123', 30)]);
    expect(r).toMatchObject({ type: 'car', make: 'Toyota', plate: 'ABC-123' });
  });

  it('returns nulls when nothing is recognisable', () => {
    expect(parseRegCard([line('hello')])).toEqual({ plate: null, type: null, make: null });
  });
});

describe('odometerCandidates', () => {
  it('prefers the big whole number over trip meter and speed scale', () => {
    const c = odometerCandidates([line('0 4 5 2 1 7', 40), line('TRIP 123.4', 15), line('120 km/h', 12)], null);
    expect(c[0]!.value).toBe(45217);
    expect(c.map((x) => x.value)).not.toContain(120);
  });

  it('uses the last known reading to break ties', () => {
    const c = odometerCandidates([line('45217', 30), line('15217', 30)], 45_000);
    expect(c[0]!.value).toBe(45217);
    expect(c[1]!.value).toBe(15217);
  });

  it('handles thousands separators and Urdu digits', () => {
    expect(odometerCandidates([line('45,217 km', 30)], null)[0]!.value).toBe(45217);
    expect(odometerCandidates([line('۴۵۲۱۷', 30)], null)[0]!.value).toBe(45217);
  });

  it('empty when no plausible number', () => {
    expect(odometerCandidates([line('ODO')], null)).toEqual([]);
  });
});

describe('parsePump', () => {
  it('reads labelled values and checks consistency', () => {
    const g = parsePump([line('SALE Rs'), line('1000.00', 40), line('VOLUME Ltr'), line('3.66', 40), line('PRICE'), line('272.89', 30)]);
    expect(g).toEqual({ total: 1000, litres: 3.66, ratePerLitre: 272.89, consistent: true });
  });

  it('finds the consistent triple without labels', () => {
    const g = parsePump([line('2729.00', 40), line('10.00', 40), line('272.90', 30), line('PSO')]);
    expect(g).toEqual({ total: 2729, litres: 10, ratePerLitre: 272.9, consistent: true });
  });

  it('flags inconsistent / partial reads so the app can ask the cloud reader', () => {
    const g = parsePump([line('SALE'), line('1000', 40), line('VOLUME'), line('366', 40)]);
    expect(g.consistent).toBe(false);
    expect(g.total).toBe(1000);
  });

  it('nothing readable → all null', () => {
    expect(parsePump([line('PSO')])).toEqual({ litres: null, ratePerLitre: null, total: null, consistent: false });
  });
});
