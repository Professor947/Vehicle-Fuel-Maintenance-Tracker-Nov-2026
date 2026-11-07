/**
 * expo-secure-store values should stay under ~2 KB, but a Supabase session JSON is larger.
 * This adapter splits values into chunks: `<key>.n` holds the count, `<key>.0..n-1` the parts.
 * Pure over a minimal store interface so it is unit-testable.
 */
export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const CHUNK = 1800;
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export function chunkedStorage(store: KeyValueStore) {
  async function removeItem(key: string) {
    const k = safe(key);
    const n = Number((await store.getItemAsync(`${k}.n`)) ?? 0);
    for (let i = 0; i < n; i++) await store.deleteItemAsync(`${k}.${i}`);
    await store.deleteItemAsync(`${k}.n`);
  }
  return {
    async getItem(key: string): Promise<string | null> {
      const k = safe(key);
      const raw = await store.getItemAsync(`${k}.n`);
      if (raw == null) return null;
      const parts: string[] = [];
      for (let i = 0; i < Number(raw); i++) {
        const p = await store.getItemAsync(`${k}.${i}`);
        if (p == null) return null; // torn write → treat as signed out
        parts.push(p);
      }
      return parts.join('');
    },
    async setItem(key: string, value: string) {
      await removeItem(key);
      const k = safe(key);
      const n = Math.max(1, Math.ceil(value.length / CHUNK));
      for (let i = 0; i < n; i++) await store.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
      await store.setItemAsync(`${k}.n`, String(n));
    },
    removeItem,
  };
}
