// Supabase Edge Function: nearest fuel stations for a coordinate (Google Places API, New).
// Secret: GOOGLE_PLACES_API_KEY  (supabase secrets set GOOGLE_PLACES_API_KEY=...)
// Auth: Supabase verifies the caller's JWT by default, so only signed-in users can call it.
import { FIELD_MASK, mapPlacesResponse, parseRequest, placesRequest } from './lib.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) return json({ error: 'not_configured' }, 503);

  const parsed = parseRequest(await req.json().catch(() => null));
  if (!parsed) return json({ error: 'bad_request' }, 400);

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify(placesRequest(parsed.lat, parsed.lng)),
    signal: AbortSignal.timeout(4000),
  }).catch(() => null);
  if (!res?.ok) return json({ error: 'upstream_failed', status: res?.status ?? null }, 502);

  return json({ stations: mapPlacesResponse(await res.json(), parsed.lat, parsed.lng) });
});
