import { formatPlate, normalizePlate, validatePlate } from '../plate';

describe('plates (formats vary by province/era)', () => {
  it.each([
    ['lea-1234', 'LEA-1234', 'LEA1234'],
    ['LEB  07   1234', 'LEB 07 1234', 'LEB071234'],
    ['ict ab - 123', 'ICT AB-123', 'ICTAB123'],
    ['BKA 123', 'BKA 123', 'BKA123'],
    ['KHI-2345', 'KHI-2345', 'KHI2345'],
  ])('%p', (input, formatted, normalized) => {
    expect(formatPlate(input)).toBe(formatted);
    expect(normalizePlate(input)).toBe(normalized);
    expect(validatePlate(input)).toBeNull();
  });

  it('requires a value', () => expect(validatePlate('  - ')).toBe('plate_required'));
  it('requires a digit', () => expect(validatePlate('ABCD')).toBe('plate_invalid'));
  it('rejects too short / too long', () => {
    expect(validatePlate('A1')).toBe('plate_invalid');
    expect(validatePlate('ABCDEFGHIJK12')).toBe('plate_invalid');
  });
});
