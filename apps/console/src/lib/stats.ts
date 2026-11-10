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
