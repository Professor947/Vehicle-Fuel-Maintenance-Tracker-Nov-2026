import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, View } from 'react-native';
import { Button, Card, Menu, Text, useTheme } from 'react-native-paper';

import { db } from '@/db/client';
import { formatDate, formatKm, formatKmPerLitre, formatLitres, formatPKR, formatSignedPercent } from '@/i18n/format';
import { useApp } from '@/state/app';
import { useLive } from '@/state/RepoContext';
import { useMileage } from '@/state/useMileage';
import { FLAG_COLORS } from '@/ui/MileageChart';

export default function Home() {
  const { t } = useTranslation();
  const theme = useTheme();
  const lang = useApp((s) => s.language);
  const selectedId = useApp((s) => s.selectedVehicleId);
  const [menu, setMenu] = useState(false);

  const vehicles = useLive((r) => r.vehicles.list(), []);
  const vehicle = vehicles.find((v) => v.id === selectedId) ?? vehicles[0];
  const summary = useLive(
    (r) =>
      vehicle
        ? { odo: r.odometer.latest(vehicle.id), lastRefuel: r.refuels.list(vehicle.id).at(-1) ?? null }
        : null,
    [vehicle?.id],
  );

  const mileage = useMileage(vehicle?.id);
  const latest = mileage?.intervals.at(-1);

  if (!vehicle) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: theme.colors.background }}>
        <Text variant="titleMedium">{t('home.noVehicles')}</Text>
        <Button mode="contained" icon="plus" onPress={() => router.push('/vehicles/new')}>
          {t('home.addFirstVehicle')}
        </Button>
      </View>
    );
  }

  const go = (pathname: '/refuel/new' | '/service/new' | '/odometer/new' | '/history' | '/economy') =>
    router.push({ pathname, params: { vehicleId: vehicle.id } });

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Menu
        visible={menu}
        onDismiss={() => setMenu(false)}
        anchor={
          <Button mode="outlined" icon={vehicle.type === 'bike' ? 'motorbike' : 'car'} onPress={() => setMenu(true)}>
            {vehicle.plate} ▾
          </Button>
        }
      >
        {vehicles.map((v) => (
          <Menu.Item
            key={v.id}
            title={v.plate}
            leadingIcon={v.type === 'bike' ? 'motorbike' : 'car'}
            onPress={() => {
              useApp.getState().selectVehicle(db, v.id);
              setMenu(false);
            }}
          />
        ))}
        <Menu.Item
          title={t('home.manageVehicles')}
          leadingIcon="cog"
          onPress={() => {
            setMenu(false);
            router.push('/vehicles');
          }}
        />
      </Menu>

      <Card onPress={() => router.push({ pathname: '/vehicles/[id]', params: { id: vehicle.id } })}>
        {vehicle.photoLocalUri ? <Image source={{ uri: vehicle.photoLocalUri }} style={{ height: 140, borderTopLeftRadius: 12, borderTopRightRadius: 12 }} /> : null}
        <Card.Title title={vehicle.plate} subtitle={[t(`vehicle.type_${vehicle.type}`), vehicle.make, vehicle.model].filter(Boolean).join(' · ')} />
        <Card.Content style={{ gap: 4 }}>
          <Text variant="labelMedium">{t('home.currentOdometer')}</Text>
          <Text variant="headlineSmall">{summary?.odo ? formatKm(summary.odo.odometer, lang) : '—'}</Text>
          <Text variant="labelMedium" style={{ marginTop: 8 }}>
            {t('home.lastRefuel')}
          </Text>
          <Text>
            {summary?.lastRefuel
              ? `${formatDate(summary.lastRefuel.timestamp, lang)} · ${formatLitres(summary.lastRefuel.litres, lang)} · ${formatPKR(summary.lastRefuel.totalCost, lang)}`
              : t('home.noRefuels')}
          </Text>
        </Card.Content>
      </Card>

      <Card onPress={() => go('/economy')}>
        <Card.Title title={t('home.economy')} right={(p) => <Text {...p} style={{ marginEnd: 16 }}>›</Text>} />
        <Card.Content style={{ gap: 4 }}>
          <Text variant="labelMedium">{t('home.latestMileage')}</Text>
          {latest ? (
            <Text variant="headlineSmall">{latest.kmPerLitre != null ? formatKmPerLitre(latest.kmPerLitre, lang) : '—'}</Text>
          ) : (
            <Text variant="titleMedium">{t('home.mileagePending')}</Text>
          )}
          {latest?.flag ? (
            <Text style={{ color: FLAG_COLORS[latest.flag] }}>
              {t(`economy.flag_${latest.flag}`, { pct: latest.deviation != null ? formatSignedPercent(latest.deviation, lang) : '' })}
            </Text>
          ) : null}
          {!latest && summary?.lastRefuel ? <Text variant="bodySmall">{t('home.mileagePendingHint')}</Text> : null}
          {mileage?.predictedNextRefuelAt != null ? (
            <Text variant="bodySmall">
              {t('home.nextRefuel')}: {formatDate(mileage.predictedNextRefuelAt, lang)}
            </Text>
          ) : null}
        </Card.Content>
      </Card>

      <Button mode="contained" icon="gas-station" contentStyle={{ height: 56 }} onPress={() => go('/refuel/new')}>
        {t('home.addRefuel')}
      </Button>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button style={{ flex: 1 }} mode="outlined" icon="wrench" onPress={() => go('/service/new')}>
          {t('home.addService')}
        </Button>
        <Button style={{ flex: 1 }} mode="outlined" icon="speedometer" onPress={() => go('/odometer/new')}>
          {t('home.addOdometer')}
        </Button>
      </View>
      <Button mode="text" icon="history" onPress={() => go('/history')}>
        {t('home.history')}
      </Button>
    </ScrollView>
  );
}
