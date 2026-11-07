import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { formatDateTime } from '@/i18n/format';
import { useApp } from '@/state/app';

/** Date then time, using the native Android dialogs. */
export function DateTimeField({ value, onChange }: { value: number; onChange(ms: number): void }) {
  const { t } = useTranslation();
  const lang = useApp((s) => s.language);

  const pick = () => {
    DateTimePickerAndroid.open({
      value: new Date(value),
      mode: 'date',
      maximumDate: new Date(),
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onChange: (e2, time) => {
            if (e2.type !== 'set' || !time) return onChange(date.getTime());
            onChange(Math.min(time.getTime(), Date.now()));
          },
        });
      },
    });
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Text variant="labelMedium">{t('common.date')}</Text>
      <Button mode="outlined" icon="calendar" onPress={pick} contentStyle={{ justifyContent: 'flex-start' }}>
        {formatDateTime(value, lang)}
      </Button>
    </View>
  );
}
