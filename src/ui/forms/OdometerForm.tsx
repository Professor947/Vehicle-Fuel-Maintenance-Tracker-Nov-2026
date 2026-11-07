import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, HelperText } from 'react-native-paper';

import { odometerGoesBackwards, validateOdometer } from '@/domain/validation';
import { parseDecimal } from '@/domain/numbers';
import { formatKm } from '@/i18n/format';
import { useApp } from '@/state/app';
import { useRepo } from '@/state/RepoContext';
import { requestSync } from '@/sync/scheduler';
import { confirmDestructive } from '@/ui/confirm';
import { DateTimeField } from '@/ui/DateTimeField';
import { NumberField } from '@/ui/NumberField';
import { Screen } from '@/ui/Screen';

export function OdometerForm({ vehicleId, id }: { vehicleId: string; id?: string }) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.language);
  const repo = useRepo();
  const existing = id ? repo.odometer.list(vehicleId).find((r) => r.id === id) : undefined;
  const [value, setValue] = useState(existing ? String(existing.odometer) : '');
  const [timestamp, setTimestamp] = useState(() => existing?.timestamp ?? Date.now());
  const [error, setError] = useState<string>();

  const latest = existing ? null : (repo.odometer.latest(vehicleId)?.odometer ?? null);
  const parsed = parseDecimal(value);
  const backwards = parsed != null && odometerGoesBackwards(parsed, latest);

  const save = () => {
    const r = validateOdometer(value);
    if (!r.ok) return setError(r.errors.odometer);
    if (existing) repo.odometer.update(existing.id, { odometer: r.value, timestamp });
    else repo.odometer.add(vehicleId, r.value, timestamp, 'manual');
    requestSync();
    router.back();
  };

  return (
    <Screen>
      <DateTimeField value={timestamp} onChange={setTimestamp} />
      <NumberField label={t('odometer.reading')} value={value} onChangeText={setValue} error={error} />
      {backwards && latest != null ? (
        <HelperText type="info">{t('warnings.odometerBackwards', { latest: formatKm(latest, lang) })}</HelperText>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button mode="contained" onPress={save}>
          {t('common.save')}
        </Button>
        {existing && existing.source !== 'baseline' ? (
          <Button
            mode="outlined"
            textColor="#B3261E"
            onPress={() =>
              confirmDestructive(t('common.delete'), () => {
                repo.odometer.remove(existing.id);
                requestSync();
                router.back();
              })
            }
          >
            {t('common.delete')}
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}
