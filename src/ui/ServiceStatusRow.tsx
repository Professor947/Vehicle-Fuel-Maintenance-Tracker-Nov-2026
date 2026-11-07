import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Card, Chip, Text, useTheme } from 'react-native-paper';

import type { IntervalSpec } from '@/domain/defaults';
import { db } from '@/db/client';
import { kvGet, kvSet } from '@/db/kv';
import { formatDate, formatKm, type AppLanguage } from '@/i18n/format';
import type { ServiceStatus } from '@/reminders/vehicleDues';
import { useApp } from '@/state/app';
import { useLive } from '@/state/RepoContext';

export const STATUS_COLORS = { overdue: '#C62828', due_soon: '#E08600', ok: '#2E7D32' } as const;

const dismissKey = (vehicleId: string, type: string) => `svc_prompt_dismissed:${vehicleId}:${type}`;

export function describeInterval(i: IntervalSpec, lang: AppLanguage, t: TFunction) {
  const what =
    i.km != null && i.days != null
      ? t('maintenance.everyKmDays', { km: formatKm(i.km, lang), days: Math.round(i.days) })
      : i.days != null
        ? t('maintenance.everyDays', { days: Math.round(i.days) })
        : t('maintenance.everyKm', { km: formatKm(i.km ?? 0, lang) });
  return t('maintenance.every', { what });
}

/** One service type: status, due date/km, last record — or the one-time "Any record?" question. */
export function ServiceStatusRow({ vehicleId, s, compact }: { vehicleId: string; s: ServiceStatus; compact?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const lang = useApp((x) => x.language);
  const dismissed = useLive(() => kvGet(db, dismissKey(vehicleId, s.serviceType)) === '1', [vehicleId, s.serviceType]);
  const service = t(`service.type_${s.serviceType}`);
  const due = s.due;
  const askRecord = s.eventCount === 0 && !dismissed;

  const logIt = () => router.push({ pathname: '/service/new', params: { vehicleId, type: s.serviceType } });

  return (
    <Card
      mode="outlined"
      onPress={() => router.push({ pathname: '/maintenance/[type]', params: { vehicleId, type: s.serviceType } })}
    >
      <Card.Content style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="titleMedium">{service}</Text>
          {due ? (
            <Chip compact textStyle={{ color: STATUS_COLORS[due.status] }} style={{ backgroundColor: STATUS_COLORS[due.status] + '1A' }}>
              {t(`maintenance.status_${due.status}`)}
            </Chip>
          ) : (
            <Chip compact>{t('maintenance.off')}</Chip>
          )}
        </View>

        {due ? (
          <Text>
            {due.dueAt != null ? t('maintenance.dueIn', { date: formatDate(due.dueAt, lang) }) : ''}
            {due.dueKm != null && due.trigger !== 'km' ? ` ${t('maintenance.dueAtKm', { km: formatKm(due.dueKm, lang) })}` : ''}
            {due.kmRemaining != null
              ? ` · ${due.kmRemaining >= 0 ? t('maintenance.kmLeft', { km: formatKm(due.kmRemaining, lang) }) : t('maintenance.kmOver', { km: formatKm(-due.kmRemaining, lang) })}`
              : ''}
          </Text>
        ) : null}

        {!compact && due ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {describeInterval(due.interval, lang, t)} · {t(`maintenance.source_${due.interval.source}`)}
          </Text>
        ) : null}

        {s.lastEvent ? (
          !compact ? (
            <Text variant="bodySmall">
              {t('maintenance.last', { date: formatDate(s.lastEvent.timestamp, lang), km: formatKm(s.lastEvent.odometer, lang) })}
            </Text>
          ) : null
        ) : askRecord ? (
          <View style={{ gap: 4, marginTop: 4 }}>
            <Text variant="bodyMedium">{t('maintenance.anyRecord', { service: service.toLowerCase() })}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button mode="contained-tonal" compact onPress={logIt}>
                {t('common.yes')}
              </Button>
              <Button mode="text" compact onPress={() => kvSet(db, dismissKey(vehicleId, s.serviceType), '1')}>
                {t('common.no')}
              </Button>
            </View>
          </View>
        ) : !compact ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('maintenance.noRecordAnchor')}
          </Text>
        ) : null}

        {!compact ? (
          <Button mode="text" compact icon="plus" style={{ alignSelf: 'flex-start' }} onPress={logIt}>
            {t('maintenance.log', { service: service.toLowerCase() })}
          </Button>
        ) : null}
      </Card.Content>
    </Card>
  );
}
