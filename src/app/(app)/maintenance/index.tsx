import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { HelperText, useTheme } from 'react-native-paper';

import { useReminders } from '@/state/useReminders';
import { ServiceStatusRow } from '@/ui/ServiceStatusRow';

export default function Maintenance() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const r = useReminders(vehicleId);
  if (!r) return null;

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {r.kmPerDay == null && r.services.some((s) => s.due?.dueKm != null) ? (
        <HelperText type="info">{t('maintenance.noKmRate')}</HelperText>
      ) : null}
      {r.services.map((s) => (
        <ServiceStatusRow key={s.serviceType} vehicleId={vehicleId} s={s} />
      ))}
    </ScrollView>
  );
}
