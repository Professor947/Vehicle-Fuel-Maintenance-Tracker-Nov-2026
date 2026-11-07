import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Chip, HelperText, Text } from 'react-native-paper';

import { serviceTypesFor, type ServiceType } from '@/domain/types';
import { validateService, type FieldErrors, type ServiceInput } from '@/domain/validation';
import { useRepo } from '@/state/RepoContext';
import { requestSync } from '@/sync/scheduler';
import { confirmDestructive } from '@/ui/confirm';
import { DateTimeField } from '@/ui/DateTimeField';
import { NumberField } from '@/ui/NumberField';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

export function ServiceForm({ vehicleId, id, initialType }: { vehicleId: string; id?: string; initialType?: ServiceType }) {
  const { t } = useTranslation();
  const repo = useRepo();
  const vehicle = repo.vehicles.get(vehicleId);
  const existing = id ? repo.services.get(id) : undefined;

  const [form, setForm] = useState<ServiceInput>({
    type: existing?.type ?? initialType ?? null,
    odometer: existing ? String(existing.odometer) : String(repo.odometer.latest(vehicleId)?.odometer ?? ''),
    cost: existing?.cost != null ? String(existing.cost) : '',
    notes: existing?.notes ?? '',
  });
  const [timestamp, setTimestamp] = useState(() => existing?.timestamp ?? Date.now());
  const [errors, setErrors] = useState<FieldErrors<keyof ServiceInput>>({});
  const set = <K extends keyof ServiceInput>(k: K, v: ServiceInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (!vehicle) return null;

  const save = () => {
    const r = validateService(form, vehicle.type);
    if (!r.ok) return setErrors(r.errors);
    if (existing) repo.services.update(existing.id, { ...r.value, timestamp });
    else repo.services.create(vehicleId, r.value, timestamp);
    requestSync();
    router.back();
  };

  return (
    <Screen>
      <Text variant="labelMedium">{t('service.type')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
        {serviceTypesFor(vehicle.type).map((st) => (
          <Chip key={st} selected={form.type === st} showSelectedCheck onPress={() => set('type', st)}>
            {t(`service.type_${st}`)}
          </Chip>
        ))}
      </View>
      <HelperText type="error" visible={!!errors.type}>
        {errors.type ? t(`errors.${errors.type}`) : ''}
      </HelperText>
      <DateTimeField value={timestamp} onChange={setTimestamp} />
      <NumberField label={t('service.odometer')} value={form.odometer} onChangeText={(v) => set('odometer', v)} error={errors.odometer} />
      <NumberField
        label={`${t('service.cost')} (${t('common.optional')})`}
        value={form.cost}
        onChangeText={(v) => set('cost', v)}
        error={errors.cost}
      />
      <TextField label={`${t('common.notes')} (${t('common.optional')})`} value={form.notes} onChangeText={(v) => set('notes', v)} multiline />
      <View style={{ gap: 8 }}>
        <Button mode="contained" onPress={save}>
          {t('common.save')}
        </Button>
        {existing ? (
          <Button
            mode="outlined"
            textColor="#B3261E"
            onPress={() =>
              confirmDestructive(t('service.deleteConfirm'), () => {
                repo.services.remove(existing.id);
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
