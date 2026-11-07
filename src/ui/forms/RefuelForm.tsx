import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Chip, HelperText } from 'react-native-paper';

import { parseDecimal } from '@/domain/numbers';
import { odometerGoesBackwards, validateRefuel, type FieldErrors, type RefuelInput } from '@/domain/validation';
import { formatKm } from '@/i18n/format';
import { getRefuelLocation, type Fix } from '@/services/location';
import { guessStation } from '@/services/places';
import { useApp } from '@/state/app';
import { useRepo } from '@/state/RepoContext';
import { requestSync } from '@/sync/scheduler';
import { confirmDestructive } from '@/ui/confirm';
import { DateTimeField } from '@/ui/DateTimeField';
import { NumberField } from '@/ui/NumberField';
import { PhotoField } from '@/ui/PhotoField';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

const str = (n: number | null | undefined) => (n == null ? '' : String(Math.round(n * 100) / 100));

/**
 * "Refueling now?" — time auto-filled, GPS captured once on this screen only (new refuels),
 * nearest station suggested (editable). Nothing here ever waits on the network.
 */
export function RefuelForm({ vehicleId, id }: { vehicleId: string; id?: string }) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.language);
  const repo = useRepo();
  const existing = id ? repo.refuels.get(id) : undefined;

  const [form, setForm] = useState<RefuelInput>({
    odometer: str(existing?.odometer),
    litres: str(existing?.litres),
    ratePerLitre: str(existing?.ratePerLitre),
    totalCost: str(existing?.totalCost),
    stationName: existing?.stationName ?? '',
  });
  const [timestamp, setTimestamp] = useState(() => existing?.timestamp ?? Date.now());
  const [receipt, setReceipt] = useState<string | null>(existing?.receiptPhotoLocalUri ?? null);
  const [receiptTouched, setReceiptTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<keyof RefuelInput>>({});
  const set = <K extends keyof RefuelInput>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const [fix, setFix] = useState<Fix | null>(null);
  const [locStatus, setLocStatus] = useState<'idle' | 'locating' | 'done' | 'none'>(existing ? 'idle' : 'locating');
  const [stationSource, setStationSource] = useState<'places' | 'history' | null>(null);
  const stationTouched = useRef(false);

  useEffect(() => {
    if (existing) return;
    let alive = true;
    void (async () => {
      const f = await getRefuelLocation();
      if (!alive) return;
      setFix(f);
      setLocStatus(f ? 'done' : 'none');
      if (!f) return;
      const guess = await guessStation(f.lat, f.lng, repo.refuels.knownStations());
      if (!alive || !guess || stationTouched.current) return;
      setForm((x) => ({ ...x, stationName: guess.name }));
      setStationSource(guess.source);
    })();
    return () => {
      alive = false;
    };
    // run once when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = useMemo(() => validateRefuel(form), [form]);
  const latest = existing ? null : (repo.odometer.latest(vehicleId)?.odometer ?? null);
  const odo = parseDecimal(form.odometer);
  const backwards = odo != null && odometerGoesBackwards(odo, latest);

  const save = () => {
    const r = validateRefuel(form);
    if (!r.ok) return setErrors(r.errors);
    if (existing) {
      repo.refuels.update(existing.id, { ...r.value, timestamp });
      if (receiptTouched) repo.refuels.setReceiptPhoto(existing.id, receipt);
    } else {
      const newId = repo.refuels.create(vehicleId, r.value, {
        timestamp,
        receiptPhoto: receipt,
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
      });
      requestSync();
      // Show the interval this refuel just closed (and ask for a cause if it is unusual).
      router.replace({ pathname: '/economy', params: { vehicleId, highlight: newId } });
      return;
    }
    requestSync();
    router.back();
  };

  return (
    <Screen>
      <DateTimeField value={timestamp} onChange={setTimestamp} />
      {locStatus !== 'idle' ? (
        <Chip
          compact
          icon={locStatus === 'locating' ? 'crosshairs' : locStatus === 'done' ? 'crosshairs-gps' : 'crosshairs-off'}
          style={{ alignSelf: 'flex-start', marginBottom: 8 }}
        >
          {t(locStatus === 'locating' ? 'refuel.locating' : locStatus === 'done' ? 'refuel.located' : 'refuel.noLocation')}
        </Chip>
      ) : null}
      <NumberField
        label={t('refuel.odometer')}
        hint={existing ? undefined : t('refuel.odometerPrompt')}
        value={form.odometer}
        onChangeText={(v) => set('odometer', v)}
        error={errors.odometer}
        autoFocus={!existing}
      />
      {backwards && latest != null ? (
        <HelperText type="info">{t('warnings.odometerBackwards', { latest: formatKm(latest, lang) })}</HelperText>
      ) : null}
      <HelperText type="info">{t('refuel.autoCalcHint')}</HelperText>
      <NumberField label={t('refuel.litres')} value={form.litres} onChangeText={(v) => set('litres', v)} error={errors.litres} />
      <NumberField label={t('refuel.rate')} value={form.ratePerLitre} onChangeText={(v) => set('ratePerLitre', v)} error={errors.ratePerLitre} />
      <NumberField label={t('refuel.total')} value={form.totalCost} onChangeText={(v) => set('totalCost', v)} error={errors.totalCost} />
      {live.ok && live.value.mismatch ? <HelperText type="error">{t('refuel.mismatchWarning')}</HelperText> : null}
      <TextField
        label={`${t('refuel.station')} (${t('common.optional')})`}
        value={form.stationName}
        onChangeText={(v) => {
          stationTouched.current = true;
          setStationSource(null);
          set('stationName', v);
        }}
        hint={
          stationSource === 'places'
            ? t('refuel.stationSuggested')
            : stationSource === 'history'
              ? t('refuel.stationFromHistory')
              : undefined
        }
      />
      <PhotoField
        label={t('refuel.receiptPhoto')}
        localUri={receipt}
        remotePath={receiptTouched ? null : existing?.receiptPhotoPath}
        onChange={(u) => {
          setReceipt(u);
          setReceiptTouched(true);
        }}
      />
      <View style={{ gap: 8 }}>
        <Button mode="contained" onPress={save}>
          {t('common.save')}
        </Button>
        {existing ? (
          <Button
            mode="outlined"
            textColor="#B3261E"
            onPress={() =>
              confirmDestructive(t('refuel.deleteConfirm'), () => {
                repo.refuels.remove(existing.id);
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
