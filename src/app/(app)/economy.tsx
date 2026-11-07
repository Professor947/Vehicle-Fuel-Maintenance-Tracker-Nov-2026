import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Card, Chip, List, Text, useTheme } from 'react-native-paper';

import type { Interval } from '@/domain/mileage';
import { round } from '@/domain/numbers';
import { formatDate, formatKm, formatKmPerLitre, formatLitres, formatPKR, formatSignedPercent } from '@/i18n/format';
import { useApp } from '@/state/app';
import { useLive, useRepo } from '@/state/RepoContext';
import { useMileage } from '@/state/useMileage';
import { requestSync } from '@/sync/scheduler';
import { AnomalyCauseDialog } from '@/ui/AnomalyCauseDialog';
import { FLAG_COLORS, MileageChart } from '@/ui/MileageChart';

const needsPrompt = (i: Interval | undefined) =>
  !!i && (i.flag === 'unusual_drop' || i.flag === 'unusually_high') && !i.cause && !i.note;

export default function Economy() {
  const { t } = useTranslation();
  const theme = useTheme();
  const repo = useRepo();
  const lang = useApp((s) => s.language);
  const { vehicleId, highlight } = useLocalSearchParams<{ vehicleId: string; highlight?: string }>();
  const m = useMileage(vehicleId);
  const pending = useLive((r) => (m?.pendingRefuelId ? r.refuels.get(m.pendingRefuelId) : undefined), [m?.pendingRefuelId]);

  // Right after logging a refuel that closes a flagged interval, ask for a cause once.
  const [dialogFor, setDialogFor] = useState<string | null>(() => {
    const iv = m?.intervals.find((i) => i.toRefuelId === highlight);
    return needsPrompt(iv) ? iv!.toRefuelId : null;
  });
  const dialogInterval = m?.intervals.find((i) => i.toRefuelId === dialogFor) ?? null;

  if (!m) return null;
  const editRefuel = (id: string) => router.push({ pathname: '/refuel/[id]', params: { id, vehicleId } });
  const newestFirst = [...m.intervals].reverse();

  const flagLabel = (i: Interval) =>
    i.flag
      ? t(`economy.flag_${i.flag}`, { pct: i.deviation != null ? formatSignedPercent(i.deviation, lang) : '' })
      : null;

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {pending ? (
        <Card mode="outlined">
          <Card.Title title={t('economy.pending')} left={(p) => <List.Icon {...p} icon="timer-sand" />} />
          <Card.Content>
            <Text>
              {t('economy.pendingHint', { litres: formatLitres(pending.litres, lang), date: formatDate(pending.timestamp, lang) })}
            </Text>
          </Card.Content>
        </Card>
      ) : null}

      {m.intervals.length === 0 ? (
        <Text style={{ textAlign: 'center', marginTop: 24 }}>{t('economy.noData')}</Text>
      ) : (
        <>
          <Card>
            <Card.Content style={{ gap: 10 }}>
              <Stat label={t('economy.baseline')} value={m.currentBaseline != null ? formatKmPerLitre(m.currentBaseline, lang) : t('economy.baselineNeeds')} />
              <Stat
                label={t('economy.lifetimeAvg')}
                value={m.lifetimeKmPerLitre != null ? formatKmPerLitre(m.lifetimeKmPerLitre, lang) : '—'}
                hint={t('economy.lifetimeAvgHint')}
              />
              {m.avgDaysBetweenRefuels != null ? (
                <Stat label={t('economy.avgDays')} value={t('economy.days', { count: round(m.avgDaysBetweenRefuels, 1) })} />
              ) : null}
              {m.predictedNextRefuelAt != null ? (
                <Stat label={t('economy.nextRefuel')} value={formatDate(m.predictedNextRefuelAt, lang)} />
              ) : null}
            </Card.Content>
          </Card>

          <Card>
            <Card.Title title={t('economy.trend')} />
            <Card.Content>
              <MileageChart intervals={m.intervals} />
            </Card.Content>
          </Card>

          {newestFirst.map((i) => (
            <Card key={i.toRefuelId} mode="outlined" onPress={() => (i.flag && i.flag !== 'invalid_entry' ? setDialogFor(i.toRefuelId) : editRefuel(i.toRefuelId))}>
              <Card.Content style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="titleLarge">{i.kmPerLitre != null ? formatKmPerLitre(i.kmPerLitre, lang) : '—'}</Text>
                  <Text variant="bodyMedium">
                    {i.costPerKm != null ? `${formatPKR(i.costPerKm, lang, 2)}/${lang === 'ur' ? 'کلومیٹر' : 'km'}` : ''}
                  </Text>
                </View>
                <Text variant="bodySmall">
                  {t('economy.interval', { from: formatDate(i.startAt, lang), to: formatDate(i.endAt, lang) })} ·{' '}
                  {formatKm(i.distance, lang)} · {formatLitres(i.litres, lang)}
                </Text>
                {i.flag ? (
                  <Chip
                    compact
                    icon={i.flag === 'unusual_drop' ? 'trending-down' : i.flag === 'unusually_high' ? 'trending-up' : 'alert'}
                    style={{ alignSelf: 'flex-start', backgroundColor: FLAG_COLORS[i.flag] + '22' }}
                    textStyle={{ color: FLAG_COLORS[i.flag] }}
                    onPress={i.flag === 'invalid_entry' ? () => editRefuel(i.toRefuelId) : () => setDialogFor(i.toRefuelId)}
                  >
                    {flagLabel(i)}
                  </Chip>
                ) : null}
                {i.cause || i.note ? (
                  <Text variant="bodySmall" style={{ fontStyle: 'italic' }}>
                    {[i.cause ? t('economy.cause', { cause: t(`anomaly.cause_${i.cause}`) }) : null, i.note].filter(Boolean).join(' — ')}
                  </Text>
                ) : i.flag && i.flag !== 'invalid_entry' ? (
                  <Text variant="labelSmall" style={{ color: theme.colors.primary }}>
                    {t('economy.addCause')}
                  </Text>
                ) : null}
              </Card.Content>
            </Card>
          ))}
        </>
      )}

      <AnomalyCauseDialog
        key={dialogFor ?? 'none'}
        interval={dialogInterval}
        onDismiss={() => setDialogFor(null)}
        onSave={(cause, note) => {
          if (dialogFor) repo.refuels.setAnomaly(dialogFor, cause, note);
          requestSync();
          setDialogFor(null);
        }}
        onFixEntry={() => {
          const id = dialogFor;
          setDialogFor(null);
          if (id) editRefuel(id);
        }}
      />
    </ScrollView>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View>
      <Text variant="labelMedium">{label}</Text>
      <Text variant="titleMedium">{value}</Text>
      {hint ? <Text variant="bodySmall">{hint}</Text> : null}
    </View>
  );
}
