import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';
import { Avatar, Button, List, useTheme } from 'react-native-paper';

import { formatKm } from '@/i18n/format';
import { useApp } from '@/state/app';
import { useLive } from '@/state/RepoContext';

export default function Vehicles() {
  const { t } = useTranslation();
  const theme = useTheme();
  const lang = useApp((s) => s.language);
  const rows = useLive((r) => r.vehicles.list().map((v) => ({ v, odo: r.odometer.latest(v.id)?.odometer })), []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        data={rows}
        keyExtractor={(x) => x.v.id}
        renderItem={({ item: { v, odo } }) => (
          <List.Item
            title={v.plate}
            description={[v.make, v.model, odo != null ? formatKm(odo, lang) : null].filter(Boolean).join(' · ')}
            left={(p) =>
              v.photoLocalUri ? (
                <Avatar.Image {...p} size={44} source={{ uri: v.photoLocalUri }} />
              ) : (
                <Avatar.Icon {...p} size={44} icon={v.type === 'bike' ? 'motorbike' : 'car'} />
              )
            }
            onPress={() => router.push({ pathname: '/vehicles/[id]', params: { id: v.id } })}
          />
        )}
        ListFooterComponent={
          <Button mode="contained" icon="plus" style={{ margin: 16 }} onPress={() => router.push('/vehicles/new')}>
            {t('vehicle.new')}
          </Button>
        }
      />
    </View>
  );
}
