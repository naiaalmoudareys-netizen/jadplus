/**
 * Managed units, furnishing delivery and design stages in the app (ADR 0034; O4, O5, S4): which arrangement My unit
 * shows for a residence, its statements, the delivery line and stage timeline on a request, and the technician's
 * delivery form. Plain logic, tested without a phone.
 */
import {
  DELIVERY_SERVICE_CODE,
  DESIGN_SERVICE_CODE,
  SERVICES,
  VISIT_SLOTS,
  addDays,
  deliveryRefusal,
  type DeliveryRefusal,
  type OwnerManagedUnit,
  type RequestProject,
  type VisitSlot,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import { isEnglish, latinDigits, type Lang } from '../i18n/lang.js';
import { visitSlotText } from '../i18n/sharedLabels.js';
import { dayLabel } from '../jobs/format.js';
import { longDate } from '../portal/format.js';

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

/** S4/O5: whether a request (by its service's English name) has a delivery date or design stages to show. */
export function hasProjectSide(serviceName: string | null): boolean {
  const code = SERVICES.find((s) => s.name === serviceName)?.code;
  return code === DELIVERY_SERVICE_CODE || code === DESIGN_SERVICE_CODE;
}

/** O4: the arrangement in force for this unit (by Salesforce unit id, else unit name), or null. */
export function currentArrangement(
  units: readonly OwnerManagedUnit[],
  unit: { readonly sfUnitId: string | null; readonly unitName: string | null },
): OwnerManagedUnit | null {
  return units.find((m) => m.current && sameUnit(m, unit)) ?? null;
}

function sameUnit(
  m: OwnerManagedUnit,
  unit: { readonly sfUnitId: string | null; readonly unitName: string | null },
): boolean {
  if (unit.sfUnitId !== null) return m.sfUnitId === unit.sfUnitId;
  return unit.unitName !== null && m.unitName === unit.unitName;
}

export interface UnitStatement {
  readonly managedUnitId: string;
  readonly id: string;
  readonly month: string;
}

/** Every statement of the unit, current and past arrangements, newest month first. */
export function unitStatements(
  units: readonly OwnerManagedUnit[],
  unit: { readonly sfUnitId: string | null; readonly unitName: string | null },
): UnitStatement[] {
  return units
    .filter((m) => sameUnit(m, unit))
    .flatMap((m) => m.statements.map((s) => ({ managedUnitId: m.id, id: s.id, month: s.month })))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** A1: the names of units managed now; their tenant requests wait for the manager, not the owner. */
export function managedUnitNames(units: readonly OwnerManagedUnit[]): ReadonlySet<string> {
  return new Set(units.filter((m) => m.current && m.unitName !== null).map((m) => m.unitName ?? ''));
}

/** "November 2026" (in the person's language) for "2026-11". */
export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  const index = (m ?? 0) - 1;
  if (y === undefined || Number.isNaN(y) || MONTHS[index] === undefined) return month;
  if (isEnglish(locale)) return `${MONTHS[index] ?? ''} ${String(y)}`;
  return new Intl.DateTimeFormat(latinDigits(locale), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(y, index, 1));
}

/** "Since 1 Nov 2026" or "From 1 Nov 2026 to 31 Oct 2027". */
export function arrangementPeriod(m: Pick<OwnerManagedUnit, 'since' | 'until'>, lang: Lang): string {
  return m.until === null
    ? lang.t('managed.since', { date: longDate(m.since, lang.locale) })
    : lang.t('managed.period', { from: longDate(m.since, lang.locale), to: longDate(m.until, lang.locale) });
}

/** "Fri 20 Nov, Morning (9:00 - 12:00)". */
export function deliveryWhen(date: string, slot: VisitSlot, lang: Lang): string {
  const s = VISIT_SLOTS.find((x) => x.key === slot) ?? VISIT_SLOTS[0];
  return `${dayLabel(date, lang.locale)}, ${visitSlotText(s, lang.t)}`;
}

/** S4: the request's delivery lines: "Delivery: …" and, after a move, "Moved: {reason}". Empty without a date. */
export function deliveryLines(project: RequestProject, lang: Lang): string[] {
  const d = project.delivery;
  if (d === null) return [];
  const lines = [lang.t('project.delivery', { when: deliveryWhen(d.date, d.slot, lang) })];
  if (d.moves > 0 && d.reason !== null) lines.push(lang.t('project.deliveryMoved', { reason: d.reason }));
  return lines;
}

export interface StageRow {
  readonly title: string;
  readonly reached: boolean;
  readonly detail: string;
  readonly note: string | null;
}

/** O5: the design stage timeline, every stage in order with when it was reached (Dubai date). */
export function stageRows(
  project: RequestProject,
  lang: Lang,
  dubaiDateOf: (at: number) => string,
): StageRow[] {
  return project.stages.map((s) => ({
    title: lang.t(`stage.${s.stage}`),
    reached: s.at !== null,
    detail:
      s.at === null
        ? lang.t('project.stageNext')
        : lang.t('project.stageReached', { date: longDate(dubaiDateOf(s.at), lang.locale) }),
    note: s.note,
  }));
}

/** How many days the technician can choose from for a delivery (today onward). */
export const DELIVERY_DAY_CHOICES = 30;

/** The days offered for a delivery: today and the next days; the current date stays offered if later. */
export function deliveryDays(today: string, current: string | null): string[] {
  const days = Array.from({ length: DELIVERY_DAY_CHOICES }, (_, i) => addDays(today, i));
  if (current !== null && current >= today && !days.includes(current)) days.push(current);
  return days;
}

const REFUSAL_KEYS: Readonly<Record<DeliveryRefusal, MessageKey>> = {
  in_past: 'delivery.day',
  too_far: 'delivery.day',
  reason_needed: 'delivery.reasonNeeded',
  unchanged: 'delivery.unchanged',
};

/** S4: why the delivery form cannot be sent (a message key), or null; a change needs a reason. */
export function deliveryFormProblem(
  current: RequestProject['delivery'],
  next: { readonly date: string; readonly slot: VisitSlot; readonly reason: string },
  today: string,
): MessageKey | null {
  const reason = next.reason.trim();
  const refusal = deliveryRefusal(
    current === null ? null : { date: current.date, slot: current.slot },
    { date: next.date, slot: next.slot, reason: reason === '' ? null : reason },
    today,
  );
  return refusal === null ? null : REFUSAL_KEYS[refusal];
}
