/** How jobs are described on the partner and resident screens (R3: "clock and next action due"; ADR 0016). */
import {
  VISIT_SLOTS,
  dubaiClock,
  type PartnerJob,
  type RequestSummary,
  type UnitLocation,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import { isEnglish, latinDigits, type Lang, type Translate } from '../i18n/lang.js';
import { emergencyTypeLabel, serviceNameFromEnglish, visitSlotText } from '../i18n/sharedLabels.js';

const MIN = 60_000;

type Status = PartnerJob['status'];

const STATUS_KEYS: Readonly<Record<Status, MessageKey>> = {
  awaiting_owner: 'status.awaiting_owner',
  submitted: 'status.submitted',
  assigned: 'status.assigned',
  quote_sent: 'status.quote_sent',
  scheduled: 'status.scheduled',
  in_progress: 'status.in_progress',
  on_hold: 'status.on_hold',
  completed: 'status.completed',
  reopened: 'status.reopened',
  closed: 'status.closed',
  cancelled: 'status.cancelled',
};

/** What a partner sees as the status of a job ("New: acknowledge"). */
export function statusLabel(status: Status, t: Translate): string {
  return t(STATUS_KEYS[status]);
}

const RESIDENT_STATUS_KEYS: Readonly<Record<RequestSummary['status'], MessageKey>> = {
  awaiting_owner: 'residentStatus.awaiting_owner',
  submitted: 'residentStatus.submitted',
  assigned: 'residentStatus.assigned',
  quote_sent: 'residentStatus.quote_sent',
  scheduled: 'residentStatus.scheduled',
  in_progress: 'residentStatus.in_progress',
  on_hold: 'residentStatus.on_hold',
  completed: 'residentStatus.completed',
  reopened: 'residentStatus.reopened',
  closed: 'residentStatus.closed',
  cancelled: 'residentStatus.cancelled',
};

/** What a resident sees as the status of their request. */
export function residentStatusLabel(status: RequestSummary['status'], t: Translate): string {
  return t(RESIDENT_STATUS_KEYS[status]);
}

/** "JAD288-1102 · Building B · JAD 288" (names as Salesforce holds them, never translated). */
export function placeLabel(location: UnitLocation | null, t: Translate): string {
  if (location === null) return t('job.placeUnknown');
  return [location.unitName, location.building, location.project].filter((x) => x !== null).join(' · ');
}

/** An emergency by its kind ("Water leak"); a routine request by its service ("Furnishing"). */
export function jobTitle(
  job: Pick<PartnerJob, 'emergency' | 'emergencyType' | 'serviceName'>,
  t: Translate,
): string {
  if (!job.emergency) {
    return job.serviceName === null ? t('job.serviceRequest') : serviceNameFromEnglish(job.serviceName, t);
  }
  return job.emergencyType === null ? t('job.emergency') : emergencyTypeLabel(job.emergencyType, t);
}

/** "Acknowledge in 12 min", "Overdue by 3 min", or null when nothing is due. */
export function dueLabel(job: PartnerJob, now: number, t: Translate): string | null {
  if (job.nextDueAt === null) return null;
  const minutes = Math.ceil((job.nextDueAt - now) / MIN);
  if (minutes > 0) {
    const time = formatMinutes(minutes, t);
    return job.nextDueKind === 'emergency_ack' ? t('job.acknowledgeIn', { time }) : t('job.dueIn', { time });
  }
  return t('job.overdueBy', { time: formatMinutes(Math.max(1, -minutes), t) });
}

function formatMinutes(minutes: number, t: Translate): string {
  if (minutes < 60) return t('time.minutes', { m: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? t('time.hours', { h }) : t('time.hoursMinutes', { h, m });
}

/** Overdue jobs are shown in red. */
export function isOverdue(job: PartnerJob, now: number): boolean {
  return job.nextDueAt !== null && job.nextDueAt <= now;
}

/** E4: whether this job is an emergency still waiting for this partner's acknowledgement. */
export function needsAcknowledgement(job: PartnerJob): boolean {
  return job.emergency && job.status === 'assigned';
}

/** "Arriving 14:30-16:00" in Dubai time, once acknowledged. */
export function arrivalLabel(job: Pick<PartnerJob, 'arrivalWindow'>, t: Translate): string | null {
  if (job.arrivalWindow === null) return null;
  return t('job.arriving', {
    from: dubaiClock(job.arrivalWindow.start),
    to: dubaiClock(job.arrivalWindow.end),
  });
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tue 10 Nov" from a Dubai date (YYYY-MM-DD); "mar. 10 nov." in French, "الثلاثاء، 10 نوفمبر" in Arabic. */
export function dayLabel(date: string, locale: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (!isEnglish(locale)) {
    // The date is already a Dubai calendar date at midnight UTC, so it is formatted in UTC to keep the day.
    return new Intl.DateTimeFormat(latinDigits(locale), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(d);
  }
  return `${WEEKDAYS[d.getUTCDay()] ?? ''} ${String(d.getUTCDate())} ${MONTHS[d.getUTCMonth()] ?? ''}`;
}

/** "Preferred: Tue 10 Nov · Morning (9:00 - 12:00)", or null when none was given (ADR 0013). */
export function preferredVisitLabel(job: Pick<PartnerJob, 'preferredVisit'>, lang: Lang): string | null {
  const v = job.preferredVisit;
  if (v === null) return null;
  const slot = VISIT_SLOTS.find((s) => s.key === v.slot);
  return lang.t('job.preferred', {
    day: dayLabel(v.date, lang.locale),
    slot: slot === undefined ? v.slot : visitSlotText(slot, lang.t),
  });
}
