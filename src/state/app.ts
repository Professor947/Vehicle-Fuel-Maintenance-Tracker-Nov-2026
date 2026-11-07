import { create } from 'zustand';

import { kvGet, kvSet } from '@/db/kv';
import type { Db } from '@/db/types';
import type { AppLanguage } from '@/i18n/format';
import type { SyncOutcome } from '@/sync/engine';

interface AppState {
  hydrated: boolean;
  language: AppLanguage;
  selectedVehicleId: string | null;
  lastSync: SyncOutcome | null;
  syncing: boolean;
  hydrate(db: Db, fallbackLanguage: AppLanguage): void;
  setLanguage(db: Db, l: AppLanguage): void;
  selectVehicle(db: Db, id: string | null): void;
  setSyncing(v: boolean): void;
  setLastSync(r: SyncOutcome): void;
}

export const useApp = create<AppState>((set) => ({
  hydrated: false,
  language: 'en',
  selectedVehicleId: null,
  lastSync: null,
  syncing: false,
  hydrate(db, fallbackLanguage) {
    set({
      hydrated: true,
      language: (kvGet(db, 'language') as AppLanguage | null) ?? fallbackLanguage,
      selectedVehicleId: kvGet(db, 'selected_vehicle'),
    });
  },
  setLanguage(db, language) {
    kvSet(db, 'language', language);
    set({ language });
  },
  selectVehicle(db, id) {
    kvSet(db, 'selected_vehicle', id);
    set({ selectedVehicleId: id });
  },
  setSyncing: (syncing) => set({ syncing }),
  setLastSync: (lastSync) => set({ lastSync, syncing: false }),
}));
