/**
 * Pure rules behind JAD+ Admin's platform pages (ADR 0025): which contacts, notices and guide sections belong
 * to one building page (E12, V1), the audit log filters as a query (C-AUD-1), and the on-call calendar's
 * weeks (E6, E7).
 */
import {
  GUIDE_SECTIONS,
  addDays,
  auditPersonLookup,
  calendarDate,
  type GuideSection,
  type Place,
} from '@jadplus/shared';
import { dayEnd, dayStart } from './dates';
import { monthText } from './format';

/** "Building B · JAD 288", or "JAD 288 (whole project)". */
export function placeName(place: Place): string {
  return place.building === null
    ? `${place.project} (whole project)`
    : `${place.building} · ${place.project}`;
}

/** Items attached exactly to this place (the whole project, or this one building), not to its neighbours. */
export function exactlyAt<T extends Place>(items: readonly T[], place: Place): T[] {
  return items.filter((i) => i.project === place.project && i.building === place.building);
}

/** Items that reach residents of this place: its own, and the project-wide ones. */
export function reaching<T extends Place>(items: readonly T[], place: Place): T[] {
  return items.filter(
    (i) => i.project === place.project && (i.building === null || i.building === place.building),
  );
}

export interface GuideRow<G> {
  readonly section: GuideSection;
  /** The section written for this place, if any. */
  readonly own: G | null;
  /** For a building without its own text: the project-wide text residents see instead. */
  readonly inherited: G | null;
}

/** One row per home guide section, in the app's order, with what residents of this place see. */
export function guideRows<G extends Place & { readonly section: GuideSection }>(
  sections: readonly G[],
  place: Place,
): GuideRow<G>[] {
  return GUIDE_SECTIONS.map((section) => {
    const own =
      sections.find(
        (s) => s.section === section && s.project === place.project && s.building === place.building,
      ) ?? null;
    const inherited =
      own !== null || place.building === null
        ? null
        : (sections.find(
            (s) => s.section === section && s.project === place.project && s.building === null,
          ) ?? null);
    return { section, own, inherited };
  });
}

export interface AuditFilters {
  readonly action: string;
  readonly actor: string;
  readonly target: string;
  /** Exact email or mobile of one person: what they did and what was done to them (not a name: ADR 0003). */
  readonly person: string;
  /** Dubai dates YYYY-MM-DD, both included; empty = no limit. */
  readonly from: string;
  readonly to: string;
}

export const NO_AUDIT_FILTERS: AuditFilters = {
  action: '',
  actor: '',
  target: '',
  person: '',
  from: '',
  to: '',
};

const ACTION = /^[a-z_]{1,64}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Why the filters cannot be sent, or null when they can. */
export function auditFilterProblem(f: AuditFilters): string | null {
  if (f.action !== '' && !ACTION.test(f.action.trim())) {
    return 'An action is written in small letters and underscores, e.g. partner_suspended.';
  }
  if ((f.actor !== '' && !ID.test(f.actor.trim())) || (f.target !== '' && !ID.test(f.target.trim()))) {
    return 'An id has letters, digits, "-" and "_" only.';
  }
  if (f.person.trim() !== '' && auditPersonLookup(f.person) === null) {
    return 'Find a person by their exact email address or mobile number (names cannot be searched).';
  }
  if (f.from !== '' && !calendarDate.safeParse(f.from).success) return 'Choose a real "from" date.';
  if (f.to !== '' && !calendarDate.safeParse(f.to).success) return 'Choose a real "to" date.';
  if (f.from !== '' && f.to !== '' && f.to < f.from) return 'The "to" date cannot be before the "from" date.';
  return null;
}

/**
 * The audit query for GET /api/admin/audit: dates become Dubai day bounds (from 00:00, to the end of the
 * "to" day), and `before` asks for the next (older) page.
 */
export function auditQuery(f: AuditFilters, before: number | null): Record<string, string | null> {
  const from = f.from === '' ? null : dayStart(f.from);
  const to = f.to === '' ? null : dayEnd(f.to);
  return {
    action: f.action.trim(),
    actor: f.actor.trim(),
    target: f.target.trim(),
    person: f.person.trim(),
    from: from === null ? null : String(from),
    to: to === null ? null : String(to),
    before: before === null ? null : String(before),
  };
}

/** A detail record as "key: value" lines (null shown as "—"). */
export function detailLines(
  detail: Readonly<Record<string, string | number | boolean | null>> | null,
): string[] {
  if (detail === null) return [];
  return Object.entries(detail).map(([k, v]) => `${k}: ${v === null ? '—' : String(v)}`);
}

/** How many weeks the on-call calendar shows at a time. */
export const ON_CALL_PAGE_WEEKS = 8;

/** The first Monday of the next or previous 8-week page. */
export function onCallPage(from: string, direction: 1 | -1): string {
  return addDays(from, direction * ON_CALL_PAGE_WEEKS * 7);
}

/** E6, E7: past weeks cannot be changed (the API refuses them too). */
export function weekEditable(weekStarting: string, thisWeek: string): boolean {
  return weekStarting >= thisWeek;
}

/** "July" for 7 (months 1-12, as the AC season list counts them). */
export function monthName(month: number): string {
  return monthText(`2000-${String(month).padStart(2, '0')}`).replace(/ \d{4}$/, '');
}
