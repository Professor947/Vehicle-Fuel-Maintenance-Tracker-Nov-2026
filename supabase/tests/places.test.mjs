// Tests the pure helpers of the places-nearby edge function (TypeScript via Node type stripping).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapPlacesResponse, parseRequest, placesRequest } from '../functions/places-nearby/lib.ts';

test('parseRequest validates coordinates', () => {
  assert.deepEqual(parseRequest({ lat: 31.5, lng: 74.3 }), { lat: 31.5, lng: 74.3 });
  assert.equal(parseRequest({ lat: '31.5', lng: 74.3 }), null);
  assert.equal(parseRequest({ lat: 91, lng: 0 }), null);
  assert.equal(parseRequest(null), null);
});

test('placesRequest asks for nearest gas stations', () => {
  const r = placesRequest(31.5, 74.3);
  assert.deepEqual(r.includedTypes, ['gas_station']);
  assert.equal(r.rankPreference, 'DISTANCE');
  assert.equal(r.locationRestriction.circle.radius, 500);
});

test('mapPlacesResponse keeps valid places, sorted by distance', () => {
  const out = mapPlacesResponse(
    {
      places: [
        { displayName: { text: 'Shell Far' }, location: { latitude: 31.504, longitude: 74.3 } },
        { displayName: { text: ' PSO Near ' }, location: { latitude: 31.5005, longitude: 74.3 } },
        { displayName: { text: 'No location' } },
        { location: { latitude: 31.5, longitude: 74.3 } },
      ],
    },
    31.5,
    74.3,
  );
  assert.deepEqual(out.map((s) => s.name), ['PSO Near', 'Shell Far']);
  assert.ok(out[0].distanceM > 50 && out[0].distanceM < 60);
});

test('mapPlacesResponse tolerates an empty/odd body', () => {
  assert.deepEqual(mapPlacesResponse({}, 0, 0), []);
  assert.deepEqual(mapPlacesResponse(null, 0, 0), []);
});
