import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { runSync, type SyncDeps, type SyncOutcome } from './engine';

const PERIOD_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 2000;

/**
 * Triggers: app start, network regained, app foregrounded, every 5 min, and shortly after
 * local writes (requestSync). Skips while offline. Returns a stop function.
 */
export function startSyncScheduler(deps: SyncDeps, onResult: (r: SyncOutcome) => void) {
  let online = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const go = async () => {
    if (!online) return;
    onResult(await runSync(deps));
  };
  const schedule = (delay = DEBOUNCE_MS) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void go(), delay);
  };

  const unsubNet = NetInfo.addEventListener((s) => {
    const was = online;
    online = s.isConnected !== false && s.isInternetReachable !== false;
    if (online && !was) schedule(0);
  });
  const appSub = AppState.addEventListener('change', (st) => st === 'active' && schedule(0));
  const interval = setInterval(() => void go(), PERIOD_MS);
  schedule(0);

  requestSyncImpl = () => schedule();
  return () => {
    unsubNet();
    appSub.remove();
    clearInterval(interval);
    if (timer) clearTimeout(timer);
    requestSyncImpl = () => {};
  };
}

let requestSyncImpl: () => void = () => {};
/** Call after any local write; debounced. No-op when signed out. */
export function requestSync() {
  requestSyncImpl();
}
