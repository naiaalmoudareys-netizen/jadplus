/**
 * The work boards of a provider workspace in the console (ADR 0036): the consultations pipeline laid out per
 * service and stage (O5, P5), first-call deadlines (S4), and inspections grouped by what they wait for (O3).
 * The rules (columns, groups) are in packages/shared/src/workspace-boards.ts; this only arranges and words them.
 */
import {
  INSPECTION_GROUPS,
  INSPECTION_GROUP_LABELS,
  SERVICES,
  consultationColumn,
  consultationColumns,
  firstCallDue,
  inspectionGroup,
  type InspectionGroup,
  type PartnerConsultation,
  type PartnerInspection,
} from '@jadplus/shared';
import { duration, type Tone } from './format';

export interface PipelineColumn {
  readonly id: string;
  readonly label: string;
  readonly items: readonly PartnerConsultation[];
}

export interface Pipeline {
  readonly serviceCode: string;
  readonly serviceName: string;
  readonly columns: readonly PipelineColumn[];
}

/** One pipeline per service the office has consultations for, in catalogue order. */
export function pipelines(items: readonly PartnerConsultation[]): Pipeline[] {
  return SERVICES.filter((s) => items.some((i) => i.serviceCode === s.code)).map((s) => {
    const mine = items.filter((i) => i.serviceCode === s.code);
    return {
      serviceCode: s.code,
      serviceName: s.name,
      columns: consultationColumns(s.code).map((col) => ({
        ...col,
        items: mine.filter((i) => consultationColumn(i.serviceCode, i.steps) === col.id),
      })),
    };
  });
}

/** "First call due in 3 h" / "First call overdue by 20 min", with its tone; null once contact is made. */
export function firstCallText(
  item: Pick<PartnerConsultation, 'status' | 'nextDueAt'>,
  now: number,
): { readonly text: string; readonly tone: Tone } | null {
  const due = firstCallDue(item);
  if (due === null) return null;
  return due >= now
    ? { text: `First call due in ${duration(due - now)}`, tone: due - now < 2 * 3_600_000 ? 'warn' : 'calm' }
    : { text: `First call overdue by ${duration(now - due)}`, tone: 'bad' };
}

/** "506-JAD288-C · JAD 288", or a plain fallback when the unit name is not on file. */
export function unitLine(item: {
  readonly unitName: string | null;
  readonly project: string | null;
}): string {
  if (item.unitName === null) return 'Unit name not on file';
  return item.project === null ? item.unitName : `${item.unitName} · ${item.project}`;
}

export interface InspectionSection {
  readonly group: InspectionGroup;
  readonly label: string;
  readonly items: readonly PartnerInspection[];
}

/** Inspections grouped: report due, reported with snags open, reported or finished. */
export function inspectionSections(items: readonly PartnerInspection[]): InspectionSection[] {
  return INSPECTION_GROUPS.map((group) => ({
    group,
    label: INSPECTION_GROUP_LABELS[group],
    items: items.filter((i) => inspectionGroup(i) === group),
  }));
}
