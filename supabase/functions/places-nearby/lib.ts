// Pure helpers for the places-nearby function (unit-tested with `node --test`).

export interface Station {
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
}

export function parseRequest(body: unknown): { lat: number; lng: number } | null {
  if (!body || typeof body !== 'object') return null;
  const { lat, lng } = body as Record<string, unknown>;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Request body for Places API (New) searchNearby, nearest fuel stations first. */
export function placesRequest(lat: number, lng: number, radiusM = 500) {
  return {
    includedTypes: ['gas_station'],
    maxResultCount: 5,
    rankPreference: 'DISTANCE',
    locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusM } },
  };
}

export const FIELD_MASK = 'places.displayName,places.location';

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function mapPlacesResponse(json: unknown, lat: number, lng: number): Station[] {
  const places = (json as { places?: unknown[] } | null)?.places ?? [];
  const out: Station[] = [];
  for (const p of places) {
    const place = p as { displayName?: { text?: string }; location?: { latitude?: number; longitude?: number } };
    const name = place.displayName?.text?.trim();
    const pl = place.location?.latitude;
    const pg = place.location?.longitude;
    if (!name || typeof pl !== 'number' || typeof pg !== 'number') continue;
    out.push({ name, lat: pl, lng: pg, distanceM: Math.round(haversineMeters(lat, lng, pl, pg)) });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}
