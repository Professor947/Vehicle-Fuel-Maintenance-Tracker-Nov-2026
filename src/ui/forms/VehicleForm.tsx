import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, HelperText, SegmentedButtons, Text } from 'react-native-paper';

import { VEHICLE_TYPES, type VehicleType } from '@/domain/types';
import { validateVehicle, type FieldErrors, type VehicleInput } from '@/domain/validation';
import { db } from '@/db/client';
import { useApp } from '@/state/app';
import { useRepo } from '@/state/RepoContext';
import { requestSync } from '@/sync/scheduler';
import { confirmDestructive } from '@/ui/confirm';
import { NumberField } from '@/ui/NumberField';
import { PhotoField } from '@/ui/PhotoField';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

export function VehicleForm({ id }: { id?: string }) {
  const { t } = useTranslation();
  const repo = useRepo();
  const existing = id ? repo.vehicles.get(id) : undefined;

  const [form, setForm] = useState<VehicleInput>({
    plate: existing?.plate ?? '',
    type: existing?.type ?? null,
    make: existing?.make ?? '',
    model: existing?.model ?? '',
    odometerStart: existing ? String(existing.odometerStart) : '',
  });
  const [photo, setPhoto] = useState<string | null>(existing?.photoLocalUri ?? null);
  const [regCard, setRegCard] = useState<string | null>(existing?.regCardPhotoLocalUri ?? null);
  const [photoTouched, setPhotoTouched] = useState({ photo: false, regCard: false });
  const [errors, setErrors] = useState<FieldErrors<keyof VehicleInput>>({});

  const set = <K extends keyof VehicleInput>(k: K, v: VehicleInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const r = validateVehicle(form, repo.vehicles.plates(id));
    if (!r.ok) return setErrors(r.errors);
    if (existing) {
      repo.vehicles.update(existing.id, r.value);
      if (photoTouched.photo) repo.vehicles.setPhoto(existing.id, 'photo', photo);
      if (photoTouched.regCard) repo.vehicles.setPhoto(existing.id, 'regCard', regCard);
    } else {
      const newId = repo.vehicles.create(r.value, { photo, regCard });
      useApp.getState().selectVehicle(db, newId);
      requestSync();
      // Ask once per service type: "Any record of the last oil change?" (Yes → log it, No → skip).
      router.replace({ pathname: '/maintenance', params: { vehicleId: newId } });
      return;
    }
    requestSync();
    router.back();
  };

  const remove = () =>
    existing &&
    confirmDestructive(t('vehicle.deleteConfirm', { plate: existing.plate }), () => {
      repo.vehicles.remove(existing.id);
      if (useApp.getState().selectedVehicleId === existing.id) useApp.getState().selectVehicle(db, null);
      requestSync();
      router.back();
    });

  return (
    <Screen>
      <TextField
        label={t('vehicle.plate')}
        hint={t('vehicle.plateHint')}
        value={form.plate}
        onChangeText={(v) => set('plate', v)}
        error={errors.plate}
        autoCapitalize="characters"
      />
      <Text variant="labelMedium">{t('vehicle.type')}</Text>
      <SegmentedButtons
        value={form.type ?? ''}
        onValueChange={(v) => set('type', v as VehicleType)}
        buttons={VEHICLE_TYPES.map((v) => ({ value: v, label: t(`vehicle.type_${v}`), icon: v === 'bike' ? 'motorbike' : 'car' }))}
      />
      <HelperText type="error" visible={!!errors.type}>
        {errors.type ? t(`errors.${errors.type}`) : ''}
      </HelperText>
      <TextField label={`${t('vehicle.make')} (${t('common.optional')})`} value={form.make} onChangeText={(v) => set('make', v)} />
      <TextField label={`${t('vehicle.model')} (${t('common.optional')})`} value={form.model} onChangeText={(v) => set('model', v)} />
      <NumberField
        label={t('vehicle.odometerStart')}
        value={form.odometerStart}
        onChangeText={(v) => set('odometerStart', v)}
        error={errors.odometerStart}
      />
      <PhotoField
        label={t('vehicle.vehiclePhoto')}
        localUri={photo}
        remotePath={photoTouched.photo ? null : existing?.photoPath}
        onChange={(u) => {
          setPhoto(u);
          setPhotoTouched((p) => ({ ...p, photo: true }));
        }}
      />
      <PhotoField
        label={t('vehicle.regCardPhoto')}
        localUri={regCard}
        remotePath={photoTouched.regCard ? null : existing?.regCardPhotoPath}
        onChange={(u) => {
          setRegCard(u);
          setPhotoTouched((p) => ({ ...p, regCard: true }));
        }}
      />
      <View style={{ gap: 8, marginTop: 8 }}>
        <Button mode="contained" onPress={save}>
          {t('common.save')}
        </Button>
        {existing ? (
          <Button mode="outlined" textColor="#B3261E" onPress={remove}>
            {t('common.delete')}
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}
