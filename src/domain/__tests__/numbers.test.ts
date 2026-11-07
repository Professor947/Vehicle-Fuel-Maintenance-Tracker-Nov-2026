import { parseDecimal, round } from '../numbers';

describe('parseDecimal', () => {
  it.each([
    ['12', 12],
    ['12.5', 12.5],
    ['1,234.56', 1234.56],
    [' 7 ', 7],
    ['.5', 0.5],
    ['5.', 5],
    ['۲۷۲٫۸۹', 272.89],
    ['-3', -3],
  ])('%p → %p', (s, n) => expect(parseDecimal(s)).toBe(n));

  it.each(['', '   ', 'abc', '1.2.3', '12a', null, undefined])('%p → null', (s) =>
    expect(parseDecimal(s as string)).toBeNull(),
  );
});

test('round', () => {
  expect(round(1.005, 2)).toBe(1.01);
  expect(round(33.333333, 1)).toBe(33.3);
});
