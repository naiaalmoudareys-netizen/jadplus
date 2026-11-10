/**
 * The notifications inbox in the person's own language (ADR 0019). The API sends only the kind of event and a
 * few facts (visit window, amount, hours, the request reference); this module writes the title and the line
 * under it, picks the icon, groups the items by Dubai day and words when each happened. Plain logic, tested
 * without a phone.
 */
import {
  AUTO_CLOSE_HOURS,
  NO_ACCESS_REBOOK_HOURS,
  QUOTE_REMINDER_AFTER,
  QUOTE_VALID_DAYS,
  dubaiClock,
  dubaiDate,
  type InboxItem,
  type InboxKind,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import type { Lang } from '../i18n/lang.js';
import { dayLabel } from '../jobs/format.js';
import { aed } from '../portal/format.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Ionicons names used by the inbox (kept as plain strings so this file needs no React Native). */
export type InboxIcon =
  | 'calendar-outline'
  | 'alarm-outline'
  | 'car-outline'
  | 'lock-closed-outline'
  | 'document-text-outline'
  | 'hourglass-outline'
  | 'close-circle-outline'
  | 'shield-checkmark-outline'
  | 'checkmark-circle-outline'
  | 'help-circle-outline'
  | 'archive-outline';

export interface InboxText {
  readonly title: string;
  readonly detail: string;
  readonly icon: InboxIcon;
  /** Something the person is asked to do (approve a quote, confirm the work): drawn in bronze. */
  readonly needsYou: boolean;
}

interface KindLook {
  readonly icon: InboxIcon;
  readonly needsYou: boolean;
}

const LOOK: Readonly<Record<InboxKind, KindLook>> = {
  visit_booked: { icon: 'calendar-outline', needsYou: false },
  visit_tomorrow: { icon: 'calendar-outline', needsYou: false },
  visit_soon: { icon: 'alarm-outline', needsYou: false },
  on_the_way: { icon: 'car-outline', needsYou: false },
  no_access: { icon: 'lock-closed-outline', needsYou: false },
  quote_received: { icon: 'document-text-outline', needsYou: true },
  quote_reminder: { icon: 'hourglass-outline', needsYou: true },
  quote_expired: { icon: 'close-circle-outline', needsYou: false },
  make_safe_done: { icon: 'shield-checkmark-outline', needsYou: false },
  work_done: { icon: 'checkmark-circle-outline', needsYou: true },
  confirm_reminder: { icon: 'help-circle-outline', needsYou: true },
  auto_closed: { icon: 'archive-outline', needsYou: false },
};

const key = (kind: InboxKind, part: 'title' | 'detail'): MessageKey => `inbox.${kind}.${part}`;

/** "Wed 11 Nov · 09:00-12:00" for a whole window, or "" when the item carries none. */
function windowText(item: InboxItem, lang: Lang, withDay: boolean): string {
  const { windowStart, windowEnd } = item.data;
  if (windowStart === undefined || windowEnd === undefined) return '';
  const from = dubaiClock(windowStart);
  const to = dubaiClock(windowEnd);
  if (!withDay) return lang.t('inbox.window', { from, to });
  return lang.t('journey.visit.when', { day: dayLabel(dubaiDate(windowStart), lang.locale), from, to });
}

/** The values each kind's sentence may use. */
function values(item: InboxItem, lang: Lang): Record<string, string | number> {
  const amount = item.data.amountAed;
  return {
    when: windowText(item, lang, true),
    window: windowText(item, lang, false),
    amount: amount === undefined ? '' : aed(amount, lang.locale),
    hours: item.kind === 'no_access' ? (item.data.hours ?? NO_ACCESS_REBOOK_HOURS) : AUTO_CLOSE_HOURS,
    days: QUOTE_VALID_DAYS - Math.round(QUOTE_REMINDER_AFTER / DAY),
  };
}

/** Kinds whose detail line is the visit window: without one, only the reference is shown. */
const WINDOW_KINDS: ReadonlySet<InboxKind> = new Set<InboxKind>([
  'visit_booked',
  'visit_tomorrow',
  'visit_soon',
  'on_the_way',
]);

/** Titles that show an amount, and their wording when the item carries none. */
const TITLE_WITHOUT_AMOUNT: Partial<Record<InboxKind, MessageKey>> = {
  quote_received: 'inbox.quote_received.titlePlain',
  quote_reminder: 'inbox.quote_reminder.titlePlain',
  make_safe_done: 'inbox.make_safe_done.titlePlain',
};

/** Title, detail line ("… · JAD-AB12CD") and icon for one notification. */
export function inboxText(item: InboxItem, lang: Lang): InboxText {
  const v = values(item, lang);
  const look = LOOK[item.kind];
  const plainTitle = v.amount === '' ? TITLE_WITHOUT_AMOUNT[item.kind] : undefined;
  const noWindow = WINDOW_KINDS.has(item.kind) && v.when === '';
  const sentence = noWindow ? '' : lang.t(key(item.kind, 'detail'), v);
  return {
    title: lang.t(plainTitle ?? key(item.kind, 'title'), v),
    detail: sentence === '' ? item.ref : `${sentence} · ${item.ref}`,
    icon: look.icon,
    needsYou: look.needsYou,
  };
}

export type InboxGroupKey = 'today' | 'yesterday' | 'earlier';

export interface InboxGroup {
  readonly key: InboxGroupKey;
  readonly items: readonly InboxItem[];
}

/** Today, Yesterday, Earlier on the Dubai calendar, newest first, empty groups left out. */
export function inboxGroups(items: readonly InboxItem[], now: number): InboxGroup[] {
  const today = dubaiDate(now);
  const yesterday = dubaiDate(now - DAY);
  const groupOf = (at: number): InboxGroupKey => {
    const day = dubaiDate(at);
    if (day === today) return 'today';
    return day === yesterday ? 'yesterday' : 'earlier';
  };
  const sorted = [...items].sort((a, b) => b.at - a.at);
  const order: InboxGroupKey[] = ['today', 'yesterday', 'earlier'];
  return order
    .map((k) => ({ key: k, items: sorted.filter((i) => groupOf(i.at) === k) }))
    .filter((g) => g.items.length > 0);
}

/** "Just now", "12 min ago", "14:05" earlier today or yesterday, "Mon 9 Nov" before that (Dubai time). */
export function inboxTime(at: number, now: number, lang: Lang): string {
  const minutes = Math.floor((now - at) / MINUTE);
  if (minutes < 1) return lang.t('inbox.justNow');
  if (minutes < 60) return lang.t('inbox.minutesAgo', { m: minutes });
  const day = dubaiDate(at);
  if (day === dubaiDate(now) || day === dubaiDate(now - DAY)) return dubaiClock(at);
  return dayLabel(day, lang.locale);
}

/** The number on the bell: nothing at zero, "9+" above nine. */
export function badgeText(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 9 ? '9+' : String(unread);
}
