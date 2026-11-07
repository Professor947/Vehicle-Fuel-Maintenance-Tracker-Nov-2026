import { normalizePkMobile, toAsciiDigits } from '../phone';

describe('normalizePkMobile', () => {
  it.each([
    ['03001234567', '+923001234567'],
    ['0300 1234567', '+923001234567'],
    ['0300-1234567', '+923001234567'],
    ['3001234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['0092-300-1234567', '+923001234567'],
    ['۰۳۰۰۱۲۳۴۵۶۷', '+923001234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePkMobile(input)).toBe(expected);
  });

  it.each(['', '0300123456', '030012345678', '04235761234', '+14155550100', 'abc'])('rejects %p', (input) => {
    expect(normalizePkMobile(input)).toBeNull();
  });
});

test('toAsciiDigits converts Urdu and Arabic-Indic digits', () => {
  expect(toAsciiDigits('۱۲۳ ١٢٣')).toBe('123 123');
});
