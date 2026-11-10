/**
 * Plain rules and wording for the request journey screens (ADR 0018), tested without a phone: the visit
 * windows a partner can book, reading a quote amount as typed, and how a visit and a quote are described.
 */
import {
  DEFAULT_CALENDAR,
  VISIT_SLOTS,
  dubaiClock,
  dubaiDate,
  preferredDays,
  visitWindowAllowed,
  type RequestDetail,
  type VisitSlot,
  type WorkingCalendar,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import type { Lang, Translate } from '../i18n/lang.js';
import { longDate } from '../portal/format.js';
import { dayLabel } from './format.js';

const MINUTE = 60_000;
/** Dubai is UTC+4 all year (no daylight saving). */
const DUBAI_OFFSET_MS = 4 * 60 * MINUTE;

export interface VisitWindow {
  readonly windowStart: number;
  readonly windowEnd: number;
}

/** "9:00" → minutes after midnight. */
function minutesOf(clock: string): number {
  const [h = '0', m = '0'] = clock.trim().split(':');
  return Number(h) * 60 + Number(m);
}

/** A slot on a Dubai date ('YYYY-MM-DD') as a visit window, e.g. Morning = 9:00-12:00 Dubai time. */
export function slotWindow(date: string, slot: VisitSlot): VisitWindow {
  const hours = VISIT_SLOTS.find((s) => s.key === slot)?.hours ?? '';
  const [from = '', to = ''] = hours.split('-');
  const midnight = Date.parse(`${date}T00:00:00Z`) - DUBAI_OFFSET_MS;
  return { windowStart: midnight + minutesOf(from) * MINUTE, windowEnd: midnight + minutesOf(to) * MINUTE };
}

/** The API accepts this window now (visitWindowAllowed: not started yet, within 30 days). */
export function slotOpen(date: string, slot: VisitSlot, now: number): boolean {
  const w = slotWindow(date, slot);
  return visitWindowAllowed(w.windowStart, w.windowEnd, now);
}

/**
 * The days a partner can book: today while a window is left, the next working days, and the resident's
 * preferred day (ADR 0013) when it is still bookable. Sorted, each once.
 */
export function visitDays(
  now: number,
  preferred: string | null,
  cal: WorkingCalendar = DEFAULT_CALENDAR,
): string[] {
  const today = dubaiDate(now);
  const days = new Set([today, ...preferredDays(today, cal)]);
  if (preferred !== null) days.add(preferred);
  return [...days].filter((d) => VISIT_SLOTS.some((s) => slotOpen(d, s.key, now))).sort();
}

/**
 * A quote amount as typed (numeric keyboard): above zero, at most two decimals, "." or "," as the decimal
 * mark, no thousands separators. Null when it cannot be sent.
 */
export function parseAed(typed: string): number | null {
  const [whole = '', fraction, extra] = typed.trim().replace(',', '.').split('.');
  const digits = /^\d+$/;
  if (extra !== undefined || !digits.test(whole) || whole.length > 8) return null;
  if (fraction !== undefined && (!digits.test(fraction) || fraction.length > 2)) return null;
  const amount = Number(fraction === undefined ? whole : `${whole}.${fraction}`);
  return amount > 0 && amount <= 10_000_000 ? amount : null;
}

type Visit = NonNullable<RequestDetail['visit']>;
type Quote = NonNullable<RequestDetail['quote']>;

/** "Wed 11 Nov · 09:00-12:00" in Dubai time. */
export function visitLabel(visit: Visit, lang: Lang): string {
  return lang.t('journey.visit.when', {
    day: dayLabel(dubaiDate(visit.start), lang.locale),
    from: dubaiClock(visit.start),
    to: dubaiClock(visit.end),
  });
}

const QUOTE_STATUS_KEYS: Readonly<Record<Quote['status'], MessageKey>> = {
  pending: 'journey.quote.status.pending',
  approved: 'journey.quote.status.approved',
  declined: 'journey.quote.status.declined',
  expired: 'journey.quote.status.expired',
  withdrawn: 'journey.quote.status.withdrawn',
};

export function quoteStatusLabel(status: Quote['status'], t: Translate): string {
  return t(QUOTE_STATUS_KEYS[status]);
}

/** "Valid until 24 Nov 2026" (A2: 14 days after it was sent). */
export function validUntilLabel(quote: Quote, lang: Lang): string {
  return lang.t('journey.quote.validUntil', { date: longDate(dubaiDate(quote.expiresAt), lang.locale) });
}
