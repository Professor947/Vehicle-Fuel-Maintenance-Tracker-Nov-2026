import { nearestKnownStation, type KnownStation } from '@/domain/geo';

import { isSupabaseConfigured, supabase } from './supabase';

export interface StationGuess {
  name: string;
  source: 'places' | 'history';
}

/**
 * Nearest fuel station name. Tries the places-nearby edge function (Google Places) with a short
 * timeout, then falls back to the closest station the user has refuelled at before.
 * Never throws and never blocks the refuel flow: the field stays editable throughout.
 */
export async function guessStation(lat: number, lng: number, history: KnownStation[]): Promise<StationGuess | null> {
  if (isSupabaseConfigured) {
    try {
      const res = await Promise.race([
        supabase.functions.invoke<{ stations?: { name: string }[] }>('places-nearby', { body: { lat, lng } }),
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ]);
      const name = res?.data?.stations?.[0]?.name;
      if (name) return { name, source: 'places' };
    } catch {
      // fall through to history
    }
  }
  const known = nearestKnownStation(history, lat, lng);
  return known ? { name: known.name, source: 'history' } : null;
}
