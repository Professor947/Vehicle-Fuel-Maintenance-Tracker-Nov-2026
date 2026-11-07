import en from '../en.json';
import ur from '../ur.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function placeholders(s: string) {
  return (s.match(/{{\s*\w+\s*}}/g) ?? []).sort();
}

test('Urdu has exactly the same keys as English', () => {
  expect(keys(ur).sort()).toEqual(keys(en).sort());
});

test('interpolation placeholders match between languages', () => {
  const get = (o: object, path: string) => path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)[k], o);
  for (const k of keys(en)) {
    expect([k, placeholders(get(ur, k) as string)]).toEqual([k, placeholders(get(en, k) as string)]);
  }
});

test('no empty strings', () => {
  const get = (o: object, path: string) => path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)[k], o);
  for (const k of keys(en)) {
    expect((get(en, k) as string).trim()).not.toBe('');
    expect((get(ur, k) as string).trim()).not.toBe('');
  }
});
