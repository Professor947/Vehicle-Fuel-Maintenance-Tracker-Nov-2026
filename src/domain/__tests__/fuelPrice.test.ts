import { lastPaidRate } from '../fuelPrice';

const types: Record<string, string> = { bike1: 'bike', bike2: 'bike', car1: 'car' };
const typeOf = (id: string) => types[id];

test('uses the latest rate paid for this vehicle', () => {
  const r = lastPaidRate(
    [
      { vehicleId: 'bike1', timestamp: 1, ratePerLitre: 260 },
      { vehicleId: 'bike1', timestamp: 3, ratePerLitre: 272.89 },
      { vehicleId: 'bike2', timestamp: 5, ratePerLitre: 280 },
    ],
    'bike1',
    typeOf,
  );
  expect(r).toEqual({ ratePerLitre: 272.89, timestamp: 3, sameVehicle: true });
});

test('first refuel of a vehicle falls back to another vehicle of the same type', () => {
  const r = lastPaidRate(
    [
      { vehicleId: 'bike1', timestamp: 3, ratePerLitre: 272.89 },
      { vehicleId: 'car1', timestamp: 9, ratePerLitre: 283.1 },
    ],
    'bike2',
    typeOf,
  );
  expect(r).toEqual({ ratePerLitre: 272.89, timestamp: 3, sameVehicle: false });
});

test('no history (or only other vehicle types) → nothing pre-filled', () => {
  expect(lastPaidRate([], 'bike1', typeOf)).toBeNull();
  expect(lastPaidRate([{ vehicleId: 'car1', timestamp: 1, ratePerLitre: 283 }], 'bike1', typeOf)).toBeNull();
});
