import { addDatabaseChangeListener } from 'expo-sqlite';
import { AppState } from 'react-native';

import { planNotifications, type NotifyState } from '@/domain/notifyPlan';
import { db } from '@/db/client';
import { kvGet, kvSet } from '@/db/kv';
import type { Repo } from '@/db/repo';
import { i18n } from '@/i18n';
import { formatDate, formatKm } from '@/i18n/format';
import { applyNotificationPlan, ensureNotificationPermission, type Render } from '@/services/notifications';
import { useApp } from '@/state/app';

import { notificationCandidates } from './plan';
import { vehicleReminders } from './vehicleDues';

const STATE_KEY = 'notify_state';
const DEBOUNCE_MS = 3000;

/**
 * Recomputes reminders for every vehicle and reschedules local notifications:
 * on start, when the app returns to the foreground, and (debounced) after any DB change.
 */
export function startReminderScheduler(repo: Repo) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      if (!(await ensureNotificationPermission(i18n.t('reminders.channel')))) return;
      const now = Date.now();
      const all = repo.vehicles.list().map((v) => vehicleReminders(repo, v, now));
      const byVehicle = new Map(all.map((r) => [r.vehicle.id, r]));
      const state = JSON.parse(kvGet(db, STATE_KEY) ?? '{}') as NotifyState;
      const plan = planNotifications(notificationCandidates(all), state, now);
      const lang = useApp.getState().language;

      const render: Render = (n) => {
        const v = byVehicle.get(n.vehicleId);
        const plate = v?.vehicle.plate ?? '';
        if (n.kind === 'refuel')
          return {
            title: i18n.t('reminders.refuelTitle', { plate }),
            body: i18n.t('reminders.refuelBody', { date: formatDate(v?.predictedNextRefuelAt ?? n.at, lang) }),
          };
        const s = v?.services.find((x) => x.serviceType === n.serviceType)?.due;
        const service = i18n.t(`service.type_${n.serviceType}`);
        const body =
          s?.status === 'overdue'
            ? i18n.t('reminders.overdueBody', { service })
            : s?.trigger === 'km' && s.dueKm != null
              ? i18n.t('reminders.dueKmBody', { service, km: formatKm(s.dueKm, lang) })
              : i18n.t('reminders.dueDateBody', { service, date: s?.dueAt ? formatDate(s.dueAt, lang) : '' });
        return { title: i18n.t('reminders.serviceTitle', { service, plate }), body };
      };

      await applyNotificationPlan(plan, render);
      kvSet(db, STATE_KEY, JSON.stringify(plan.nextState));
    } catch (e) {
      console.warn('reminder scheduling failed', e);
    } finally {
      running = false;
    }
  };

  const schedule = (delay = DEBOUNCE_MS) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), delay);
  };

  const dbSub = addDatabaseChangeListener((e) => {
    if (e.tableName !== 'kv' && e.tableName !== 'outbox' && e.tableName !== 'photo_uploads') schedule();
  });
  const appSub = AppState.addEventListener('change', (s) => s === 'active' && schedule(500));
  schedule(500);

  return () => {
    dbSub.remove();
    appSub.remove();
    if (timer) clearTimeout(timer);
  };
}
