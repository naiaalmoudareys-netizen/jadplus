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

/**
 * One pipeline per consultation service the office holds (`held`, its workspace services) or still has
 * consultations for, in catalogue order. A service with no consultations yet still shows its empty columns.
 */
export function pipelines(items: readonly PartnerConsultation[], held: readonly string[] = []): Pipeline[] {
  const shown = (code: string, flow: string): boolean =>
    items.some((i) => i.serviceCode === code) || (flow === 'consultation' && held.includes(code));
  return SERVICES.filter((s) => shown(s.code, s.flow)).map((s) => {
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

/** The kinds of report an office writes: snagging inspections (snagging, or a handover team's soft snagging). */
export interface ReportWork {
  readonly snagging: boolean;
  readonly valuation: boolean;
}

/** What the office writes, from the services it holds and the reports it still has in hand. */
export function reportWork(held: readonly string[], items: readonly PartnerInspection[] = []): ReportWork {
  return {
    snagging:
      held.includes('snagging') || held.includes('handover') || items.some((i) => i.service === 'snagging'),
    valuation: held.includes('valuation') || items.some((i) => i.service === 'valuation'),
  };
}

/** A valuation office reads "Reports due" and "Delivered"; it never sees snagging words. */
const VALUATION_GROUP_LABELS: Readonly<Record<InspectionGroup, string>> = {
  report_due: 'Reports due',
  snags_open: 'Reported, snags open',
  done: 'Delivered',
};

/**
 * Inspections grouped: report due, reported with snags open, reported or finished. The snags group shows only
 * for an office that does snagging inspections; a valuation-only office gets valuation words.
 */
export function inspectionSections(
  items: readonly PartnerInspection[],
  work: ReportWork = { snagging: true, valuation: true },
): InspectionSection[] {
  const labels = work.snagging ? INSPECTION_GROUP_LABELS : VALUATION_GROUP_LABELS;
  return INSPECTION_GROUPS.filter((g) => work.snagging || g !== 'snags_open').map((group) => ({
    group,
    label: labels[group],
    items: items.filter((i) => inspectionGroup(i) === group),
  }));
}
