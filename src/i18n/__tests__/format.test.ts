import { formatKm, formatKmPerLitre, formatLitres, formatNumber, formatPKR, formatSignedPercent } from '../format';

describe('formatting (en-PK)', () => {
  it('formats rupees', () => {
    expect(formatPKR(1234567, 'en')).toBe('Rs 1,234,567');
    expect(formatPKR(272.894, 'en', 2)).toBe('Rs 272.89');
  });
  it('formats distance, volume, economy', () => {
    expect(formatKm(15234.6, 'en')).toBe('15,235 km');
    expect(formatLitres(4.5, 'en')).toBe('4.5 L');
    expect(formatKmPerLitre(42.26, 'en')).toBe('42.3 km/l');
  });
  it('drops trailing zeros by default', () => {
    expect(formatNumber(12, 'en', 2)).toBe('12');
  });
});

describe('formatting (ur-PK)', () => {
  it('uses Urdu unit labels', () => {
    expect(formatPKR(1500, 'ur')).toMatch(/روپے$/);
    expect(formatKm(100, 'ur')).toMatch(/کلومیٹر$/);
    expect(formatLitres(2, 'ur')).toMatch(/لیٹر$/);
    expect(formatKmPerLitre(40, 'ur')).toMatch(/کلومیٹر\/لیٹر$/);
  });
});

test('signed percent', () => {
  expect(formatSignedPercent(-0.2, 'en')).toBe('-20%');
  expect(formatSignedPercent(0.314, 'en')).toBe('+31%');
});
