import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { Button, Dialog, Portal, RadioButton, Text, TextInput } from 'react-native-paper';

import { ANOMALY_CAUSES, type Interval } from '@/domain/mileage';
import { formatKmPerLitre, formatSignedPercent } from '@/i18n/format';
import { useApp } from '@/state/app';

interface Props {
  interval: Interval | null;
  onDismiss(): void;
  onSave(cause: string | null, note: string | null): void;
  onFixEntry(): void;
}

/** "Unusual drop" / "unusually high" prompt. Skipping is always allowed — no nagging. */
export function AnomalyCauseDialog({ interval, onDismiss, onSave, onFixEntry }: Props) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.language);
  const [cause, setCause] = useState<string | null>(interval?.cause ?? null);
  const [note, setNote] = useState(interval?.note ?? '');

  if (!interval) return null;
  const high = interval.flag === 'unusually_high';
  const pct = interval.deviation != null ? formatSignedPercent(Math.abs(interval.deviation), lang).replace('+', '') : '';
  const body = t(high ? 'anomaly.bodyHigh' : 'anomaly.bodyDrop', {
    kmpl: interval.kmPerLitre != null ? formatKmPerLitre(interval.kmPerLitre, lang) : '—',
    baseline: interval.baseline != null ? formatKmPerLitre(interval.baseline, lang) : '—',
    pct,
  });

  return (
    <Portal>
      <Dialog visible onDismiss={onDismiss}>
        <Dialog.Title>{t(high ? 'anomaly.titleHigh' : 'anomaly.titleDrop')}</Dialog.Title>
        <Dialog.ScrollArea style={{ maxHeight: 420, paddingHorizontal: 0 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24 }}>
            <Text style={{ marginBottom: 8 }}>{body}</Text>
            <RadioButton.Group value={cause ?? ''} onValueChange={setCause}>
              {(high ? (['entry_error', 'other'] as const) : ANOMALY_CAUSES).map((c) => (
                <RadioButton.Item key={c} value={c} label={t(`anomaly.cause_${c}`)} style={{ paddingVertical: 2 }} />
              ))}
            </RadioButton.Group>
            <TextInput mode="outlined" label={t('anomaly.note')} value={note} onChangeText={setNote} multiline />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions style={{ flexWrap: 'wrap' }}>
          <Button onPress={onFixEntry}>{t('anomaly.fixEntry')}</Button>
          <Button onPress={onDismiss}>{t('anomaly.skip')}</Button>
          <Button mode="contained" onPress={() => onSave(cause, note.trim() || null)} disabled={!cause && !note.trim()}>
            {t('anomaly.save')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
