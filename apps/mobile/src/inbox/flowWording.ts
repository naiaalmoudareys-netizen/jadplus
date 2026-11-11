/**
 * Notifications for the service flows (ADR 0035) in the person's language: consultations, reports and snags,
 * handover, investor education, statements and furnishing deliveries, and the provider office's snag items. The
 * item carries codes only (service, stage, handover step, report kind, a date or a start time); this module turns
 * them into words and picks the wording variant. wording.ts uses it for every kind. Plain logic, no React Native.
 */
import {
  VISIT_SLOTS,
  dubaiClock,
  dubaiDate,
  type InboxItem,
  type InboxKind,
  type ReportKind,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import { isEnglish, isMessageKey, latinDigits, type Lang } from '../i18n/lang.js';
import { serviceName, visitSlotText } from '../i18n/sharedLabels.js';
import { dayLabel } from '../jobs/format.js';
import type { InboxIcon } from './wording.js';

export type FlowKind = Extract<
  InboxKind,
  | 'consultation_contact_made'
  | 'stage_reached'
  | 'consultation_closed'
  | 'report_ready'
  | 'snag_fixed'
  | 'handover_step_done'
  | 'key_collection_booked'
  | 'handover_complete'
  | 'session_changed'
  | 'session_cancelled'
  | 'session_reminder'
  | 'book_sent'
  | 'statement_ready'
  | 'delivery_scheduled'
  | 'reinspection_requested'
  | 'snag_reopened'
  | 'snags_all_confirmed'
  | 'snags_to_fix'
>;

interface KindLook {
  readonly icon: InboxIcon;
  readonly needsYou: boolean;
}

export const FLOW_LOOK: Readonly<Record<FlowKind, KindLook>> = {
  consultation_contact_made: { icon: 'call-outline', needsYou: false },
  stage_reached: { icon: 'flag-outline', needsYou: false },
  consultation_closed: { icon: 'checkmark-circle-outline', needsYou: true },
  report_ready: { icon: 'document-text-outline', needsYou: true },
  snag_fixed: { icon: 'hammer-outline', needsYou: true },
  handover_step_done: { icon: 'checkmark-done-outline', needsYou: false },
  key_collection_booked: { icon: 'key-outline', needsYou: false },
  handover_complete: { icon: 'home-outline', needsYou: false },
  session_changed: { icon: 'school-outline', needsYou: false },
  session_cancelled: { icon: 'close-circle-outline', needsYou: false },
  session_reminder: { icon: 'alarm-outline', needsYou: false },
  book_sent: { icon: 'book-outline', needsYou: false },
  statement_ready: { icon: 'receipt-outline', needsYou: false },
  delivery_scheduled: { icon: 'cube-outline', needsYou: false },
  reinspection_requested: { icon: 'calendar-outline', needsYou: true },
  snag_reopened: { icon: 'refresh-outline', needsYou: true },
  snags_all_confirmed: { icon: 'checkmark-done-outline', needsYou: false },
  snags_to_fix: { icon: 'hammer-outline', needsYou: true },
};

/** "pre_approval" → "Pre approval": an id the app has no words for yet (a newer server) still reads. */
const humanize = (id: string): string => {
  const text = id.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const lookup = (key: string, lang: Lang): string | null => (isMessageKey(key) ? lang.t(key) : null);

/** A stage name: `stage.<id>` (later flows, e.g. interior design), then the consultation stages, else the id. */
export function stageName(stage: string, lang: Lang): string {
  return lookup(`stage.${stage}`, lang) ?? lookup(`cons.step.${stage}`, lang) ?? humanize(stage);
}

/** "Wed 11 Nov · Morning (9:00 - 12:00)" for a day with an optional window. */
function dayWithSlot(item: InboxItem, lang: Lang): string {
  const { date, slot } = item.data;
  if (date === undefined) return '';
  const window = VISIT_SLOTS.find((s) => s.key === slot);
  const day = dayLabel(date, lang.locale);
  return window === undefined ? day : `${day} · ${visitSlotText(window, lang.t)}`;
}

/** "Wed 11 Nov · 18:00": an education session's start (Dubai time). */
function sessionStart(item: InboxItem, lang: Lang): string {
  const at = item.data.startsAt;
  return at === undefined ? '' : `${dayLabel(dubaiDate(at), lang.locale)} · ${dubaiClock(at)}`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "November 2026" from YYYY-MM, in the person's language. */
export function monthLabel(period: string, locale: string): string {
  const [y, m] = period.split('-').map(Number);
  if (y === undefined || m === undefined || Number.isNaN(y) || Number.isNaN(m)) return period;
  if (isEnglish(locale)) return `${MONTHS[m - 1] ?? ''} ${String(y)}`.trim();
  return new Intl.DateTimeFormat(latinDigits(locale), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(y, m - 1, 1));
}

const SESSION_WHEN: ReadonlySet<InboxKind> = new Set<InboxKind>([
  'session_changed',
  'session_cancelled',
  'session_reminder',
]);

/** The values the service-flow sentences use; `when` replaces the visit window for these kinds. */
export function flowValues(item: InboxItem, lang: Lang): Record<string, string | number> {
  const { service, stage, step, period, count } = item.data;
  const values: Record<string, string | number> = {
    service: service === undefined ? '' : serviceName(service, humanize(service), lang.t),
    stage: stage === undefined ? '' : stageName(stage, lang),
    step: step === undefined ? '' : lang.t(`handover.step.${step}`),
    period: period === undefined ? '' : monthLabel(period, lang.locale),
    count: count ?? 1,
  };
  if (SESSION_WHEN.has(item.kind)) values.when = sessionStart(item, lang);
  if (item.kind === 'key_collection_booked' || item.kind === 'delivery_scheduled') {
    values.when = dayWithSlot(item, lang);
  }
  return values;
}

const REPORT_TITLES: Readonly<Record<ReportKind, MessageKey>> = {
  snagging: 'inbox.report_ready.titleSnagging',
  valuation: 'inbox.report_ready.titleValuation',
  reinspection: 'inbox.report_ready.titleReinspection',
};

/** The title variant for a service-flow item (or a reminder on a consultation or report), or null for the default. */
export function flowTitleKey(item: InboxItem): MessageKey | null {
  const d = item.data;
  switch (item.kind) {
    case 'consultation_closed':
      return d.outcome === 'did_not_proceed' ? 'inbox.consultation_closed.titleNotProceeded' : null;
    case 'report_ready':
      return d.reportKind === undefined ? null : REPORT_TITLES[d.reportKind];
    case 'key_collection_booked':
      return d.moved === true ? 'inbox.key_collection_booked.titleMoved' : null;
    case 'delivery_scheduled':
      return d.moved === true ? 'inbox.delivery_scheduled.titleMoved' : null;
    case 'snags_to_fix':
      return d.reopened === true ? 'inbox.snags_to_fix.titleReopened' : null;
    case 'confirm_reminder':
      if (d.flow === 'consultation') return 'inbox.confirm_reminder.titleConsultation';
      return d.flow === 'report' ? 'inbox.confirm_reminder.titleReport' : null;
    default:
      return null;
  }
}

/** Kinds whose line is only the day and time: without one, nothing but the reference is shown. */
const WHEN_ONLY: ReadonlySet<InboxKind> = new Set<InboxKind>([
  'key_collection_booked',
  'delivery_scheduled',
  'session_reminder',
  'session_cancelled',
]);

/**
 * The detail variant: a key, '' for no sentence (a day-and-time line without its day), or null for the default.
 */
export function flowDetailKey(item: InboxItem, v: Record<string, string | number>): MessageKey | '' | null {
  const d = item.data;
  if (WHEN_ONLY.has(item.kind) && v.when === '') return '';
  switch (item.kind) {
    case 'stage_reached':
      return d.hasNote === true ? 'inbox.stage_reached.detailNote' : null;
    case 'handover_step_done':
      return d.hasNote === true ? 'inbox.handover_step_done.detailNote' : null;
    case 'consultation_closed':
      return d.outcome === 'did_not_proceed' ? 'inbox.consultation_closed.detailNotProceeded' : null;
    case 'session_changed':
      return d.moved === true && v.when !== '' ? null : 'inbox.session_changed.detailPlace';
    case 'statement_ready':
      return v.period === '' ? 'inbox.statement_ready.detailPlain' : null;
    case 'auto_closed':
      return d.flow === 'consultation' ? 'inbox.auto_closed.detailConsultation' : null;
    default:
      return null;
  }
}

/** Handover items open My unit at the handover card. */
export const HANDOVER_KINDS: ReadonlySet<InboxKind> = new Set<InboxKind>([
  'handover_step_done',
  'key_collection_booked',
  'handover_complete',
]);

/** Education items open the Investor Education screen. */
export const EDUCATION_KINDS: ReadonlySet<InboxKind> = new Set<InboxKind>([...SESSION_WHEN, 'book_sent']);
