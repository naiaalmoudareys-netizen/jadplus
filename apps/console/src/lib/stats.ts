/** How the partner office's numbers read (S5: real data only, so "no data yet" rather than a made-up 100 %). */
import type { PartnerStats } from '@jadplus/shared';

/** "92 %", or "—" when no SLA target was measured in the period. */
export function onTimeText(onTime: PartnerStats['onTime']): string {
  if (onTime.total === 0) return '—';
  return `${Math.round((onTime.met / onTime.total) * 100)} %`;
}

/** "4.6 / 5", or "—" when nobody rated a job in the period. */
export function ratingText(rating: PartnerStats['rating']): string {
  return rating.average === null || rating.count === 0 ? '—' : `${rating.average.toFixed(1)} / 5`;
}

/** The periods the office can look back over (GET /api/partner/stats?days=). */
export const STATS_DAYS = ['7', '30', '90'] as const;
export type StatsDays = (typeof STATS_DAYS)[number];

/** How a figure compares with JAD+'s target (PARTNER_TARGETS): green on target, red below, grey with no data. */
export function meetsTone(meets: boolean | null): 'good' | 'bad' | 'calm' {
  if (meets === null) return 'calm';
  return meets ? 'good' : 'bad';
}

/** The per-technician numbers' period: the month on the Performance page, or the last 30 days. */
export type TeamPeriod = 'month' | 'recent';

/** The query for GET /api/partner/technician-stats (no month = the last 30 days). */
export function teamStatsQuery(period: TeamPeriod, month: string): Record<string, string | null> {
  return { month: period === 'month' ? month : null };
}
