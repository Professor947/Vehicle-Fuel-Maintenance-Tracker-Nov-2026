export interface OdoPoint {
  timestamp: number;
  odometer: number;
}

const DAY = 86_400_000;
export const RECENT_WINDOW_DAYS = 60;

/**
 * Average km/day. Prefers the last 60 days (recent usage) when that window spans ≥ 7 days,
 * else all history. Null when there is not enough data or the odometer did not advance.
 */
export function kmPerDay(points: OdoPoint[], now: number): number | null {
  const pts = [...points].sort((a, b) => a.timestamp - b.timestamp || a.odometer - b.odometer);
  const recent = pts.filter((p) => p.timestamp >= now - RECENT_WINDOW_DAYS * DAY);
  const rate = (xs: OdoPoint[]) => {
    if (xs.length < 2) return null;
    const first = xs[0]!;
    const last = xs[xs.length - 1]!;
    const days = (last.timestamp - first.timestamp) / DAY;
    if (days < 1) return null;
    const r = (last.odometer - first.odometer) / days;
    return r > 0 ? r : null;
  };
  const recentSpan = recent.length >= 2 ? (recent.at(-1)!.timestamp - recent[0]!.timestamp) / DAY : 0;
  return (recentSpan >= 7 ? rate(recent) : null) ?? rate(pts);
}
