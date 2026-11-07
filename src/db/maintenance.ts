import { kv, odometerReadings, outbox, photoUploads, refuels, reminderRules, serviceEvents, vehicles } from './schema';
import type { Db } from './types';

/** Sign-out: remove everything this device holds for the account. */
export function wipeLocalData(db: Db) {
  db.transaction((tx) => {
    for (const t of [outbox, photoUploads, reminderRules, serviceEvents, refuels, odometerReadings, vehicles, kv]) {
      tx.delete(t).run();
    }
  });
}
