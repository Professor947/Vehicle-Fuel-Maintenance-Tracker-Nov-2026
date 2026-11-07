import { chunkedStorage, type KeyValueStore } from '../chunkedStorage';

function memStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
}

test('round-trips large values across chunks and cleans up old chunks', async () => {
  const mem = memStore();
  const s = chunkedStorage(mem);
  const big = 'x'.repeat(5000);
  await s.setItem('sb-abc-auth-token', big);
  expect(await s.getItem('sb-abc-auth-token')).toBe(big);
  expect(mem.map.size).toBe(4); // 3 chunks + count
  await s.setItem('sb-abc-auth-token', 'small');
  expect(await s.getItem('sb-abc-auth-token')).toBe('small');
  expect(mem.map.size).toBe(2);
  await s.removeItem('sb-abc-auth-token');
  expect(await s.getItem('sb-abc-auth-token')).toBeNull();
  expect(mem.map.size).toBe(0);
});

test('a torn write reads as null', async () => {
  const mem = memStore();
  const s = chunkedStorage(mem);
  await s.setItem('k', 'y'.repeat(4000));
  mem.map.delete('k.1');
  expect(await s.getItem('k')).toBeNull();
});
