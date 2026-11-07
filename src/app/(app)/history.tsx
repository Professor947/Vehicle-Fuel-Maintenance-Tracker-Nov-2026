import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';
import { List, SegmentedButtons, Text, useTheme } from 'react-native-paper';

import { formatDateTime, formatKm, formatLitres, formatPKR } from '@/i18n/format';
import { useApp } from '@/state/app';
import { useLive } from '@/state/RepoContext';

type Tab = 'refuels' | 'services' | 'odometer';
interface Row {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: { pathname: '/refuel/[id]' | '/service/[id]' | '/odometer/[id]'; params: { id: string; vehicleId: string } };
}

export default function History() {
  const { t } = useTranslation();
  const theme = useTheme();
  const lang = useApp((s) => s.language);
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const [tab, setTab] = useState<Tab>('refuels');

  const rows: Row[] = useLive(
    (r) => {
      if (tab === 'refuels')
        return r.refuels
          .list(vehicleId)
          .reverse()
          .map((x) => ({
            id: x.id,
            icon: 'gas-station',
            title: `${formatLitres(x.litres, lang)} · ${formatPKR(x.totalCost, lang)}`,
            description: [formatDateTime(x.timestamp, lang), formatKm(x.odometer, lang), x.stationName].filter(Boolean).join(' · '),
            href: { pathname: '/refuel/[id]' as const, params: { id: x.id, vehicleId } },
          }));
      if (tab === 'services')
        return r.services.list(vehicleId).map((x) => ({
          id: x.id,
          icon: 'wrench',
          title: t(`service.type_${x.type}`) + (x.cost != null ? ` · ${formatPKR(x.cost, lang)}` : ''),
          description: [formatDateTime(x.timestamp, lang), formatKm(x.odometer, lang), x.notes].filter(Boolean).join(' · '),
          href: { pathname: '/service/[id]' as const, params: { id: x.id, vehicleId } },
        }));
      return r.odometer.list(vehicleId).map((x) => ({
        id: x.id,
        icon: 'speedometer',
        title: formatKm(x.odometer, lang),
        description: [formatDateTime(x.timestamp, lang), x.source === 'baseline' ? t('odometer.baseline') : null].filter(Boolean).join(' · '),
        href: { pathname: '/odometer/[id]' as const, params: { id: x.id, vehicleId } },
      }));
    },
    [tab, vehicleId, lang],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SegmentedButtons
        style={{ margin: 16 }}
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        buttons={[
          { value: 'refuels', label: t('history.refuels') },
          { value: 'services', label: t('history.services') },
          { value: 'odometer', label: t('history.odometer') },
        ]}
      />
      <FlatList
        data={rows}
        keyExtractor={(x) => x.id}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 32 }}>{t('history.empty')}</Text>}
        renderItem={({ item }) => (
          <List.Item
            title={item.title}
            description={item.description}
            left={(p) => <List.Icon {...p} icon={item.icon} />}
            onPress={() => router.push(item.href)}
          />
        )}
      />
    </View>
  );
}
