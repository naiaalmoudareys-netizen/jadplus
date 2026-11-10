/**
 * What Home puts first (ADR 0014): a greeting, the things that need the owner's attention right now, and the
 * two requests that matter most. Plain logic, tested without a phone.
 */
import { OPEN_STATUSES, dubaiDate, type RequestSummary } from '@jadplus/shared';
import type { Translate } from '../i18n/lang.js';

const DUBAI_OFFSET_MS = 4 * 3_600_000;

/** "Good morning" / "Good afternoon" / "Good evening" by the Dubai hour. */
export function greeting(now: number, t: Translate): string {
  const hour = new Date(now + DUBAI_OFFSET_MS).getUTCHours();
  if (hour < 12) return t('greeting.morning');
  if (hour < 17) return t('greeting.afternoon');
  return t('greeting.evening');
}

export interface AttentionItem {
  readonly kind: 'overdue' | 'emergency' | 'arriving';
  readonly title: string;
  readonly detail: string;
  /** Where tapping goes: the Payments tab, or one request. */
  readonly target: { readonly tab: 'payments' } | { readonly requestId: string };
}

const isOpen = (r: RequestSummary): boolean => OPEN_STATUSES.has(r.status);

/** A technician is due today (the promised window starts on today's Dubai date). */
function arrivingToday(r: RequestSummary, now: number): boolean {
  return (
    r.arrivalWindow !== null &&
    dubaiDate(r.arrivalWindow.start) === dubaiDate(now) &&
    r.arrivalWindow.end >= now
  );
}

/**
 * Only what needs the owner now, most urgent first: an emergency in progress, a technician arriving today,
 * an overdue payment. Nothing here means all is well, and Home shows no section at all.
 */
export function attentionItems(input: {
  readonly requests: readonly RequestSummary[];
  readonly overdue: { readonly amount: string } | null;
  readonly now: number;
  readonly t: Translate;
  readonly label: (r: RequestSummary) => string;
  readonly arrival: (r: RequestSummary) => string | null;
}): AttentionItem[] {
  const { t } = input;
  const items: AttentionItem[] = [];
  for (const r of input.requests) {
    if (!isOpen(r)) continue;
    if (r.emergency && r.status !== 'completed') {
      items.push({
        kind: 'emergency',
        title: t('attention.emergency', { label: input.label(r) }),
        detail:
          input.arrival(r) ??
          (r.partnerName === null
            ? t('attention.withJad')
            : t('attention.withPartner', { partner: r.partnerName })),
        target: { requestId: r.id },
      });
    } else if (arrivingToday(r, input.now)) {
      items.push({
        kind: 'arriving',
        title: t('attention.arriving', { label: input.label(r) }),
        detail: input.arrival(r) ?? '',
        target: { requestId: r.id },
      });
    }
  }
  if (input.overdue !== null) {
    items.push({
      kind: 'overdue',
      title: t('attention.overdue'),
      detail: input.overdue.amount,
      target: { tab: 'payments' },
    });
  }
  return items;
}

/** The requests Home shows (at most `limit`): open ones, emergencies first, then the newest. */
export function topRequests(requests: readonly RequestSummary[], limit = 2): RequestSummary[] {
  return requests
    .filter(isOpen)
    .sort((a, b) => Number(b.emergency) - Number(a.emergency) || b.createdAt - a.createdAt)
    .slice(0, limit);
}

/** How many requests are still open (for "See all (n)"). */
export function openCount(requests: readonly RequestSummary[]): number {
  return requests.filter(isOpen).length;
}
