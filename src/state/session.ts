import { create } from 'zustand';

import { kvGet, kvSet } from '@/db/kv';
import { wipeLocalData } from '@/db/maintenance';
import type { Db } from '@/db/types';

export interface SessionUser {
  id: string;
  phone: string;
}

interface SessionState {
  user: SessionUser | null;
  setUser(db: Db, u: SessionUser | null): void;
  /** Restore the last signed-in user from local storage so the app opens offline. */
  hydrate(db: Db): void;
}

const KEY = 'session_user';

export const useSession = create<SessionState>((set) => ({
  user: null,
  setUser(db, u) {
    kvSet(db, KEY, u ? JSON.stringify(u) : null);
    set({ user: u });
  },
  hydrate(db) {
    const raw = kvGet(db, KEY);
    set({ user: raw ? (JSON.parse(raw) as SessionUser) : null });
  },
}));

const OWNER = 'owner_user_id';

/**
 * Called after a successful OTP verify. If a different account signs in on this device,
 * the previous account's local data (including its unsynced outbox) is removed first,
 * otherwise its queued rows would be rejected by RLS and block sync forever.
 */
export function onSignedIn(db: Db, user: SessionUser) {
  const prev = kvGet(db, OWNER);
  if (prev && prev !== user.id) wipeKeepingDevicePrefs(db);
  kvSet(db, OWNER, user.id);
  useSession.getState().setUser(db, user);
}

/** Explicit sign-out: wipe this device's copy (warned in the UI). */
export function onSignedOut(db: Db) {
  wipeKeepingDevicePrefs(db);
  useSession.getState().setUser(db, null);
}

/** Device preferences that survive a wipe. */
const DEVICE_PREFS = ['language'];

function wipeKeepingDevicePrefs(db: Db) {
  const keep = DEVICE_PREFS.map((k) => [k, kvGet(db, k)] as const);
  wipeLocalData(db);
  for (const [k, v] of keep) if (v != null) kvSet(db, k, v);
}
