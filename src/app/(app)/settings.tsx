import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { Button, Divider, List, RadioButton, Text } from 'react-native-paper';

import { db } from '@/db/client';
import { kvGet } from '@/db/kv';
import { applyDirection, type AppLanguage } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import { signOutRemote } from '@/services/auth';
import { fileExists } from '@/services/photos';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import { supabaseRemote } from '@/services/supabaseRemote';
import { useApp } from '@/state/app';
import { useLive, useRepo } from '@/state/RepoContext';
import { onSignedOut, useSession } from '@/state/session';
import { runSync } from '@/sync/engine';
import { Screen } from '@/ui/Screen';

export default function Settings() {
  const { t } = useTranslation();
  const repo = useRepo();
  const user = useSession((s) => s.user)!;
  const lang = useApp((s) => s.language);
  const lastSync = useApp((s) => s.lastSync);
  const [syncing, setSyncing] = useState(false);
  const pending = useLive((r) => r.sync.pendingCount(), [lastSync]);
  const lastAt = useLive(() => kvGet(db, 'last_sync_at'), [lastSync]);
  const lastError = useLive(() => kvGet(db, 'last_sync_error'), [lastSync]);

  const changeLanguage = (l: AppLanguage) => {
    useApp.getState().setLanguage(db, l);
    if (applyDirection(l)) Alert.alert('', t('settings.rtlRestart'));
  };

  const syncNow = async () => {
    if (!isSupabaseConfigured) return;
    setSyncing(true);
    const r = await runSync({ db, repo, remote: supabaseRemote(supabase), userId: user.id, fileExists });
    useApp.getState().setLastSync(r);
    setSyncing(false);
  };

  const signOut = () =>
    Alert.alert('', t('auth.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.signOut'),
        style: 'destructive',
        onPress: () => {
          void signOutRemote();
          onSignedOut(db);
        },
      },
    ]);

  return (
    <Screen>
      <List.Subheader>{t('settings.language')}</List.Subheader>
      <RadioButton.Group value={lang} onValueChange={(v) => changeLanguage(v as AppLanguage)}>
        <RadioButton.Item label={t('settings.lang_en')} value="en" />
        <RadioButton.Item label={t('settings.lang_ur')} value="ur" />
      </RadioButton.Group>
      <Divider />
      <List.Subheader>{t('settings.sync')}</List.Subheader>
      <Text style={{ paddingHorizontal: 16 }}>
        {pending > 0 ? t('settings.pending', { count: pending }) : t('settings.allSynced')}
      </Text>
      <Text style={{ paddingHorizontal: 16 }}>
        {lastAt ? t('settings.lastSync', { when: formatDateTime(Number(lastAt), lang) }) : t('settings.neverSynced')}
      </Text>
      {lastError ? (
        <Text style={{ paddingHorizontal: 16, color: '#B3261E' }}>{t('settings.syncError', { message: lastError })}</Text>
      ) : null}
      <Button mode="outlined" icon="sync" style={{ margin: 16 }} loading={syncing} disabled={syncing} onPress={() => void syncNow()}>
        {t('settings.syncNow')}
      </Button>
      <Divider />
      <List.Subheader>{t('settings.account')}</List.Subheader>
      <Text style={{ paddingHorizontal: 16 }}>{t('settings.signedInAs', { phone: user.phone })}</Text>
      <Button mode="outlined" textColor="#B3261E" icon="logout" style={{ margin: 16 }} onPress={signOut}>
        {t('auth.signOut')}
      </Button>
    </Screen>
  );
}
