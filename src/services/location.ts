import * as Location from 'expo-location';

export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/**
 * One-shot location for the refuel screen ONLY (no background or continuous tracking).
 * Never throws; returns null if permission is denied, location is off, or it takes too long.
 */
export async function getRefuelLocation(timeoutMs = 8000): Promise<Fix | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos =
      (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeoutMs)) ??
      (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000, requiredAccuracy: 500 }));
    if (!pos) return null;
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? null };
  } catch {
    return null;
  }
}
