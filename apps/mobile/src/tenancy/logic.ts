/**
 * Tenants in the app (ADR 0021; R2, O4, U4, U5): which tenancy My unit shows for a residence, the date
 * choices when inviting and extending, and the sentences built from them. Plain logic, tested without a phone.
 */
import {
  addDays,
  endingSoon,
  extensionAllowed,
  tenancyDatesAllowed,
  type MyPlace,
  type OwnerTenancy,
  type TenantTenancy,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import type { Lang, Translate } from '../i18n/lang.js';
import { longDate } from '../portal/format.js';

/** A real calendar date written YYYY-MM-DD (not 2026-02-30). */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const at = Date.parse(`${text}T00:00:00Z`);
  return !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === text;
}

/** `date` moved by whole months, kept within the month (31 Aug + 6 months = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const year = y ?? 0;
  const month = (m ?? 1) - 1 + months;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d ?? 1, last))).toISOString().slice(0, 10);
}

/** How long a new tenancy runs, in months (the end is the day before the same date). */
export const LENGTH_CHOICES = [6, 12, 24] as const;
export type LengthChoice = (typeof LENGTH_CHOICES)[number];

export const LENGTH_KEYS: Readonly<Record<LengthChoice, MessageKey>> = {
  6: 'tenancy.months6',
  12: 'tenancy.year1',
  24: 'tenancy.years2',
};

/** The last day of a tenancy of `months` starting on `startsOn` (12 months from 15 Nov ends on 14 Nov). */
export function endAfter(startsOn: string, months: number): string {
  return addDays(addMonths(startsOn, months), -1);
}

/** The invitation form opens on a one-year tenancy starting today. */
export function defaultDates(today: string): { startsOn: string; endsOn: string } {
  return { startsOn: today, endsOn: endAfter(today, 12) };
}

/** Why the dates cannot be sent (a message key), or null when they are fine. */
export function datesProblem(startsOn: string, endsOn: string, today: string): MessageKey | null {
  if (!isIsoDate(startsOn) || !isIsoDate(endsOn)) return 'tenancy.badDate';
  return tenancyDatesAllowed(startsOn, endsOn, today) ? null : 'tenancy.badRange';
}

/** U5: one-tap extensions from the current end (+6 months, +1 year), only those the API would accept. */
export function extensionChoices(
  currentEnd: string,
  today: string,
): { months: 6 | 12; endsOn: string; key: MessageKey }[] {
  const options = [
    { months: 6 as const, endsOn: addMonths(currentEnd, 6), key: 'tenancy.plus6' as const },
    { months: 12 as const, endsOn: addMonths(currentEnd, 12), key: 'tenancy.plus12' as const },
  ];
  return options.filter((o) => extensionAllowed(currentEnd, o.endsOn, today));
}

/** Why another end date cannot be used (a message key), or null. */
export function extensionProblem(currentEnd: string, newEnd: string, today: string): MessageKey | null {
  if (!isIsoDate(newEnd)) return 'tenancy.badDate';
  return extensionAllowed(currentEnd, newEnd, today) ? null : 'tenancy.badExtension';
}

/**
 * The tenancy My unit shows for a residence: the open one (invited or active), else the latest that ended on
 * its date (the owner can bring it back, U5). Withdrawn or ended-early ones are not shown. Newest first.
 */
export function unitTenancy(tenancies: readonly OwnerTenancy[], sfUnitId: string): OwnerTenancy | null {
  const mine = tenancies.filter((x) => x.sfUnitId === sfUnitId);
  return (
    mine.find((x) => x.status === 'invited' || x.status === 'active') ??
    mine.find((x) => x.status === 'ended') ??
    null
  );
}

/**
 * The owner's unit in /api/me/places for the residence shown on My unit, matched by the Salesforce unit
 * name; an owner with one unit has only that one.
 */
export function placeForUnit(places: readonly MyPlace[], unitName: string | null): MyPlace | null {
  const owned = places.filter((p) => p.sfUnitId !== null);
  const match = owned.find((p) => unitName !== null && p.location.unitName === unitName);
  if (match !== undefined) return match;
  return owned.length === 1 ? (owned[0] ?? null) : null;
}

/** "15 Nov 2026 to 14 Nov 2027" */
export function periodText(startsOn: string, endsOn: string, lang: Lang): string {
  return lang.t('tenancy.period', {
    from: longDate(startsOn, lang.locale),
    to: longDate(endsOn, lang.locale),
  });
}

/** "30 days left", "1 day left", "Last day today". */
export function daysLeftText(daysLeft: number, t: Translate): string {
  if (daysLeft <= 0) return t('tenancy.lastDay');
  return daysLeft === 1 ? t('tenancy.dayLeft') : t('tenancy.daysLeft', { days: daysLeft });
}

/** U4: within 30 days of the end the days left are drawn in the warning colour. */
export function warnEnding(endsOn: string, today: string): boolean {
  return endingSoon(endsOn, today);
}

/** "Ask Nadia to install JAD+ and sign in with n•••t@example.com." (first name only). */
export function invitationSentText(name: string, maskedContact: string, t: Translate): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return t('tenancy.sentAsk', { name: first, contact: maskedContact });
}

/** "1204-J188 · J188" for the tenant (the project only when Salesforce gives one). */
export function tenantPlace(tenancy: Pick<TenantTenancy, 'unitName' | 'project'>, t: Translate): string {
  const unit = tenancy.unitName === '' ? t('tenancy.yourHome') : tenancy.unitName;
  return tenancy.project === null || tenancy.project === '' ? unit : `${unit} · ${tenancy.project}`;
}

/** "You have been invited to 1204-J188 · J188, from 15 Nov 2026 to 14 Nov 2027." */
export function invitationText(tenancy: TenantTenancy, lang: Lang): string {
  return lang.t('tenancy.invitedText', {
    place: tenantPlace(tenancy, lang.t),
    from: longDate(tenancy.startsOn, lang.locale),
    to: longDate(tenancy.endsOn, lang.locale),
  });
}

/** The tenant's note under their home: when access starts, or (U4) that it ends soon. Null otherwise. */
export function tenantHomeNote(tenancy: TenantTenancy, today: string, lang: Lang): string | null {
  if (tenancy.startsOn > today) {
    return lang.t('tenancy.startsOn', { date: longDate(tenancy.startsOn, lang.locale) });
  }
  if (!endingSoon(tenancy.endsOn, today)) return null;
  if (tenancy.daysLeft <= 0) return lang.t('tenancy.endsToday');
  return tenancy.daysLeft === 1
    ? lang.t('tenancy.endsInOne')
    : lang.t('tenancy.endsIn', { days: tenancy.daysLeft });
}
