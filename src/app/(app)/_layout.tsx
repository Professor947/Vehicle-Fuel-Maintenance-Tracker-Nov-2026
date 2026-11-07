import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from 'react-native-paper';

import { db } from '@/db/client';
import { createRepo } from '@/db/repo';
import { fileExists } from '@/services/photos';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import { supabaseRemote } from '@/services/supabaseRemote';
import { useApp } from '@/state/app';
import { RepoProvider } from '@/state/RepoContext';
import { useSession } from '@/state/session';
import { startSyncScheduler } from '@/sync/scheduler';
import { randomUUID } from 'expo-crypto';

export default function AppLayout() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user)!;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const repo = createRepo({ db, userId: user.id, newId: randomUUID });
    return startSyncScheduler(
      { db, repo, remote: supabaseRemote(supabase), userId: user.id, fileExists },
      (r) => useApp.getState().setLastSync(r),
    );
  }, [user.id]);

  return (
    <RepoProvider userId={user.id}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: t('app.name'),
            headerRight: () => <IconButton icon="cog" onPress={() => router.push('/settings')} />,
          }}
        />
        <Stack.Screen name="vehicles/index" options={{ title: t('vehicle.list') }} />
        <Stack.Screen name="vehicles/new" options={{ title: t('vehicle.new') }} />
        <Stack.Screen name="vehicles/[id]" options={{ title: t('vehicle.edit') }} />
        <Stack.Screen name="refuel/new" options={{ title: t('refuel.new') }} />
        <Stack.Screen name="refuel/[id]" options={{ title: t('refuel.edit') }} />
        <Stack.Screen name="service/new" options={{ title: t('service.new') }} />
        <Stack.Screen name="service/[id]" options={{ title: t('service.edit') }} />
        <Stack.Screen name="odometer/new" options={{ title: t('odometer.title') }} />
        <Stack.Screen name="odometer/[id]" options={{ title: t('odometer.title') }} />
        <Stack.Screen name="history" options={{ title: t('history.title') }} />
        <Stack.Screen name="economy" options={{ title: t('economy.title') }} />
        <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
      </Stack>
    </RepoProvider>
  );
}
