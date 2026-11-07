import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

import type { PlannedNotification, PlanResult } from '@/domain/notifyPlan';

const CHANNEL = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let channelReady = false;

/** Asks once (Android 13+ shows the system prompt); returns whether we may notify. */
export async function ensureNotificationPermission(channelName: string): Promise<boolean> {
  if (!channelReady) {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: channelName,
      importance: AndroidImportance.DEFAULT,
    });
    channelReady = true;
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export type Render = (n: PlannedNotification) => { title: string; body: string };

/**
 * Replace every scheduled reminder with the new plan. Local scheduled notifications fire even when
 * the app is closed and the phone is offline; no push server is involved.
 */
export async function applyNotificationPlan(plan: PlanResult, render: Render) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const n of plan.schedule) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.key,
      content: { ...render(n), data: { vehicleId: n.vehicleId, kind: n.kind, serviceType: n.serviceType ?? null } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL },
    });
  }
  for (const n of plan.fireNow) {
    await Notifications.scheduleNotificationAsync({
      content: { ...render(n), data: { vehicleId: n.vehicleId, kind: n.kind, serviceType: n.serviceType ?? null } },
      trigger: { channelId: CHANNEL },
    });
  }
}
