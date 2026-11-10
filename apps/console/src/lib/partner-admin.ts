/**
 * JAD+ Admin's view of a partner's paperwork (ADR 0025; S7, S9, S10, P1): how a proposed price compares with
 * today's card, and which uploads and rate-card changes belong to one partner, newest decisions first.
 */
import type { Tone } from './format';

export interface PriceChange {
  readonly text: string;
  readonly tone: Tone;
}

/** "New line", "No change", "+12.5 %" (a raise, amber) or "-4 %" (cheaper, green). */
export function priceChange(proposedFils: number, currentFils: number | null): PriceChange {
  if (currentFils === null || currentFils <= 0) return { text: 'New line', tone: 'calm' };
  if (proposedFils === currentFils) return { text: 'No change', tone: 'calm' };
  const pct = Math.round(((proposedFils - currentFils) / currentFils) * 1000) / 10;
  return pct > 0 ? { text: `+${String(pct)} %`, tone: 'warn' } : { text: `${String(pct)} %`, tone: 'good' };
}

interface Decided {
  readonly partnerId: string;
  readonly status: 'pending' | 'accepted' | 'rejected';
  readonly decidedAt: number | null;
}

/** One partner's items: waiting ones first, then the decided ones, most recent decision first. */
export function forPartner<T extends Decided>(items: readonly T[], partnerId: string): T[] {
  return items
    .filter((i) => i.partnerId === partnerId)
    .sort((a, b) => {
      if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
      return (b.decidedAt ?? 0) - (a.decidedAt ?? 0);
    });
}
