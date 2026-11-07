import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, HelperText, SegmentedButtons, Switch, Text } from 'react-native-paper';

import { defaultInterval } from '@/domain/defaults';
import { parseDecimal } from '@/domain/numbers';
import type { ServiceType } from '@/domain/types';
import { useApp } from '@/state/app';
import { useRepo } from '@/state/RepoContext';
import { requestSync } from '@/sync/scheduler';
import { NumberField } from '@/ui/NumberField';
import { Screen } from '@/ui/Screen';
import { describeInterval } from '@/ui/ServiceStatusRow';

export default function RuleEditor() {
  const { t } = useTranslation();
  const lang = useApp((s) => s.language);
  const repo = useRepo();
  const { vehicleId, type } = useLocalSearchParams<{ vehicleId: string; type: ServiceType }>();
  const vehicle = repo.vehicles.get(vehicleId);
  const rule = repo.rules.byType(vehicleId).get(type);
  const def = vehicle ? defaultInterval(vehicle.type, type) : null;

  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [mode, setMode] = useState<'auto' | 'custom'>(rule?.mode ?? 'auto');
  const [km, setKm] = useState(rule?.intervalKm != null ? String(rule.intervalKm) : def?.km != null ? String(def.km) : '');
  const [days, setDays] = useState(rule?.intervalDays != null ? String(rule.intervalDays) : def?.days != null ? String(def.days) : '');
  const [error, setError] = useState<string | null>(null);

  if (!vehicle) return null;

  const save = () => {
    let intervalKm: number | null = null;
    let intervalDays: number | null = null;
    if (mode === 'custom') {
      intervalKm = parseDecimal(km);
      const d = parseDecimal(days);
      intervalDays = d != null ? Math.round(d) : null;
      if ((intervalKm != null && intervalKm <= 0) || (intervalDays != null && intervalDays <= 0))
        return setError(t('errors.must_be_positive'));
      if (intervalKm == null && intervalDays == null) return setError(t('rule.kmOrDaysRequired'));
    }
    repo.rules.upsert(vehicleId, type, { mode, intervalKm, intervalDays, enabled });
    requestSync();
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t(`service.type_${type}`) }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text variant="titleMedium">{t('rule.enabled')}</Text>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>
      <Text variant="labelMedium">{t('rule.mode')}</Text>
      <SegmentedButtons
        value={mode}
        onValueChange={(v) => setMode(v as 'auto' | 'custom')}
        buttons={[
          { value: 'auto', label: t('rule.mode_auto') },
          { value: 'custom', label: t('rule.mode_custom') },
        ]}
      />
      <HelperText type="info">
        {mode === 'auto' ? t('rule.autoHint') : def ? t('rule.defaultsAre', { what: describeInterval(def, lang, t) }) : ''}
      </HelperText>
      {mode === 'custom' ? (
        <>
          <NumberField label={`${t('rule.km')} (${t('common.optional')})`} value={km} onChangeText={setKm} />
          <NumberField label={`${t('rule.days')} (${t('common.optional')})`} value={days} onChangeText={setDays} integer />
        </>
      ) : null}
      {error ? <HelperText type="error">{error}</HelperText> : null}
      <Button mode="contained" onPress={save} style={{ marginTop: 8 }}>
        {t('common.save')}
      </Button>
    </Screen>
  );
}
