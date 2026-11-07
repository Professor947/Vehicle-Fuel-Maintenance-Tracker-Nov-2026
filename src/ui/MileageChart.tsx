import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { chartGeometry } from '@/domain/chart';
import type { Interval } from '@/domain/mileage';
import { formatNumber } from '@/i18n/format';
import { useApp } from '@/state/app';

export const FLAG_COLORS = { unusual_drop: '#C62828', unusually_high: '#E08600', invalid_entry: '#757575' } as const;

/** Raw km/l per interval (no smoothing). Dashed line = that interval's baseline (median of prior). */
export function MileageChart({ intervals, height = 160 }: { intervals: Interval[]; height?: number }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const lang = useApp((s) => s.language);
  const [width, setWidth] = useState(0);
  const g = width ? chartGeometry(intervals, width, height) : null;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ direction: 'ltr' }}>
      {g ? (
        <Svg width={width} height={height}>
          {g.yTicks.map((tk) => (
            <SvgText key={tk.y} x={30} y={tk.y + 4} fontSize={10} fill={theme.colors.onSurfaceVariant} textAnchor="end">
              {formatNumber(tk.value, lang, 0)}
            </SvgText>
          ))}
          {g.baseline.map((b, i) => (
            <Line key={i} x1={b.x1} x2={b.x2} y1={b.y} y2={b.y} stroke={theme.colors.outline} strokeDasharray="4 3" strokeWidth={1} />
          ))}
          <Polyline
            points={g.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={theme.colors.primary}
            strokeWidth={2}
          />
          {g.points.map((p) => (
            <Circle
              key={p.index}
              cx={p.x}
              cy={p.y}
              r={p.flag ? 5 : 3.5}
              fill={p.flag ? FLAG_COLORS[p.flag] : theme.colors.primary}
            />
          ))}
          {g.invalidX.map((x) => (
            <SvgText key={x} x={x} y={height - 4} fontSize={12} fill={FLAG_COLORS.invalid_entry} textAnchor="middle">
              ×
            </SvgText>
          ))}
        </Svg>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
        <Text variant="labelSmall">┄ {t('economy.legendBaseline')}</Text>
        <Text variant="labelSmall" style={{ color: FLAG_COLORS.unusual_drop }}>
          ● {t('economy.legendDrop')}
        </Text>
        <Text variant="labelSmall" style={{ color: FLAG_COLORS.unusually_high }}>
          ● {t('economy.legendHigh')}
        </Text>
      </View>
    </View>
  );
}
