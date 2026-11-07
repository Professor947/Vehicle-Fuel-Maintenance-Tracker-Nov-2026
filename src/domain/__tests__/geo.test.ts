import { haversineMeters, nearestKnownStation } from '../geo';

test('haversine: ~111 km per degree of latitude', () => {
  expect(haversineMeters(31.5, 74.3, 32.5, 74.3)).toBeCloseTo(111_195, -2);
  expect(haversineMeters(31.5, 74.3, 31.5, 74.3)).toBe(0);
});

describe('nearestKnownStation (offline fallback)', () => {
  const history = [
    { stationName: 'PSO Mall Road', lat: 31.5546, lng: 74.3272 },
    { stationName: 'Shell Gulberg', lat: 31.5204, lng: 74.3587 },
    { stationName: null, lat: 31.5546, lng: 74.3272 },
    { stationName: 'No GPS', lat: null, lng: null },
  ];

  it('returns the closest previously used station within range', () => {
    expect(nearestKnownStation(history, 31.5547, 74.3273)?.name).toBe('PSO Mall Road');
  });

  it('returns null when nothing is within range', () => {
    expect(nearestKnownStation(history, 33.6844, 73.0479)).toBeNull();
  });
});
