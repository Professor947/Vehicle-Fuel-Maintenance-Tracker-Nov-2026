import { serviceTypesFor } from '../types';
import {
  applySoftRate,
  odometerGoesBackwards,
  validateOdometer,
  validateRefuel,
  validateService,
  validateVehicle,
} from '../validation';

describe('validateVehicle', () => {
  const base = { plate: 'lea-1234', type: 'bike' as const, make: ' Honda ', model: '', odometerStart: '12,345' };

  it('accepts and normalizes', () => {
    const r = validateVehicle(base);
    expect(r).toEqual({
      ok: true,
      value: { plate: 'LEA-1234', type: 'bike', make: 'Honda', model: null, odometerStart: 12345 },
    });
  });

  it('reports every field error at once', () => {
    const r = validateVehicle({ plate: '', type: null, make: '', model: '', odometerStart: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual({ plate: 'plate_required', type: 'required', odometerStart: 'required' });
  });

  it('rejects a duplicate plate regardless of spacing/case', () => {
    const r = validateVehicle({ ...base, plate: 'LEA 1234' }, ['LEA1234']);
    expect(!r.ok && r.errors.plate).toBe('plate_duplicate');
  });

  it('rejects negative odometer', () => {
    const r = validateVehicle({ ...base, odometerStart: '-1' });
    expect(!r.ok && r.errors.odometerStart).toBe('odometer_range');
  });
});

describe('validateOdometer', () => {
  it('accepts 0', () => expect(validateOdometer('0')).toEqual({ ok: true, value: 0 }));
  it('rejects garbage', () => expect(validateOdometer('x')).toEqual({ ok: false, errors: { odometer: 'required' } }));
  it('warns (only) when going backwards', () => {
    expect(odometerGoesBackwards(100, 200)).toBe(true);
    expect(odometerGoesBackwards(200, 200)).toBe(false);
    expect(odometerGoesBackwards(100, null)).toBe(false);
  });
});

describe('validateRefuel', () => {
  const base = { odometer: '15000', litres: '', ratePerLitre: '', totalCost: '', stationName: ' PSO Mall Road ' };

  it('computes total from litres × rate', () => {
    const r = validateRefuel({ ...base, litres: '5', ratePerLitre: '272.89' });
    expect(r.ok && r.value).toMatchObject({ litres: 5, ratePerLitre: 272.89, mismatch: false, stationName: 'PSO Mall Road' });
    expect(r.ok && r.value.totalCost).toBeCloseTo(1364.45, 6);
  });

  it('computes litres from total / rate', () => {
    const r = validateRefuel({ ...base, ratePerLitre: '250', totalCost: '1000' });
    expect(r.ok && r.value.litres).toBe(4);
  });

  it('computes rate from total / litres', () => {
    const r = validateRefuel({ ...base, litres: '4', totalCost: '1000' });
    expect(r.ok && r.value.ratePerLitre).toBe(250);
  });

  it('keeps all three as entered and flags a >1% mismatch', () => {
    const r = validateRefuel({ ...base, litres: '4', ratePerLitre: '250', totalCost: '1100' });
    expect(r.ok && r.value).toMatchObject({ litres: 4, ratePerLitre: 250, totalCost: 1100, mismatch: true });
  });

  it('tolerates pump rounding within 1%', () => {
    const r = validateRefuel({ ...base, litres: '3.66', ratePerLitre: '272.89', totalCost: '1000' });
    expect(r.ok && r.value.mismatch).toBe(false);
  });

  it('needs at least two of litres/rate/total', () => {
    const r = validateRefuel({ ...base, litres: '4' });
    expect(!r.ok && r.errors).toEqual({ ratePerLitre: 'required', totalCost: 'required' });
  });

  it('rejects zero litres and a missing odometer', () => {
    const r = validateRefuel({ ...base, odometer: '', litres: '0', ratePerLitre: '250' });
    expect(!r.ok && r.errors).toEqual({ odometer: 'required', litres: 'must_be_positive' });
  });
});

describe('validateService', () => {
  const base = { type: 'oil' as const, odometer: '15000', cost: '', notes: '' };

  it('cost is optional', () => {
    expect(validateService(base, 'car')).toEqual({
      ok: true,
      value: { type: 'oil', odometer: 15000, cost: null, notes: null },
    });
  });

  it('chain oil is bike-only', () => {
    expect(serviceTypesFor('car')).not.toContain('chain_oil');
    expect(serviceTypesFor('bike')).toContain('chain_oil');
    const r = validateService({ ...base, type: 'chain_oil' }, 'car');
    expect(!r.ok && r.errors.type).toBe('service_not_applicable');
    expect(validateService({ ...base, type: 'chain_oil' }, 'bike').ok).toBe(true);
  });

  it('rejects invalid cost text', () => {
    const r = validateService({ ...base, cost: 'abc' }, 'bike');
    expect(!r.ok && r.errors.cost).toBe('invalid_number');
  });
});

describe('applySoftRate (default fuel price pre-fill)', () => {
  const base = { odometer: '15000', litres: '', ratePerLitre: '272.89', totalCost: '', stationName: '' };

  it('keeps the default rate when only litres are entered → total computed from it', () => {
    const r = validateRefuel(applySoftRate({ ...base, litres: '4' }, true));
    expect(r.ok && r.value.totalCost).toBeCloseTo(1091.56, 6);
  });

  it('drops the default when litres and total are entered → rate derived, no false mismatch', () => {
    const r = validateRefuel(applySoftRate({ ...base, litres: '4', totalCost: '1100' }, true));
    expect(r.ok && r.value).toMatchObject({ ratePerLitre: 275, mismatch: false });
  });

  it('a rate the user typed is never dropped', () => {
    const r = validateRefuel(applySoftRate({ ...base, litres: '4', totalCost: '1200' }, false));
    expect(r.ok && r.value).toMatchObject({ ratePerLitre: 272.89, mismatch: true });
  });
});
