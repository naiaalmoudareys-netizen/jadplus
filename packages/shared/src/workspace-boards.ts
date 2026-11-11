/**
 * The work boards of a provider workspace (ADR 0036): the consultations pipeline (O5, P5) and the inspections and
 * reports list (O3, S4). Pure rules: which column a consultation sits in, the columns of each service, and which
 * group an inspection belongs to. The API sends the facts; the console lays them out with these rules.
 */
import { CONSULTATION_OUTCOMES, isConsultationService, stagesFor } from './consultation.js';
import { OPEN_STATUSES, type Status } from './lifecycle.js';

export interface BoardColumn {
  readonly id: string;
  readonly label: string;
}

/** New → Contact made → the service's stages → Done / Did not proceed (O5, P5). */
export function consultationColumns(serviceCode: string): BoardColumn[] {
  return [
    { id: 'new', label: 'New' },
    { id: 'contact_made', label: 'Contact made' },
    ...stagesFor(serviceCode),
    { id: 'done', label: 'Done' },
    { id: 'did_not_proceed', label: 'Did not proceed' },
  ];
}

/**
 * The column of a consultation from the steps the office recorded: its outcome when it has one, else the latest
 * stage reached (by the service's stage order, not by the order they were recorded), else "Contact made", else
 * "New".
 */
export function consultationColumn(serviceCode: string, steps: readonly string[]): string {
  const outcome = CONSULTATION_OUTCOMES.find((o) => steps.includes(o));
  if (outcome !== undefined) return outcome;
  if (isConsultationService(serviceCode)) {
    const reached = stagesFor(serviceCode).filter((s) => steps.includes(s.id));
    const last = reached.at(-1);
    if (last !== undefined) return last.id;
  }
  return steps.includes('contact_made') ? 'contact_made' : 'new';
}

/** S4: the first call is still owed while the consultation waits for "Contact made" and has a deadline. */
export function firstCallDue(item: {
  readonly status: Status;
  readonly nextDueAt: number | null;
}): number | null {
  return item.status === 'assigned' ? item.nextDueAt : null;
}

export type FirstCallState = 'overdue' | 'today' | 'later' | null;

/** Whether a first call is late, due before the end of today, or later (`dayEnd`: end of today, Dubai). */
export function firstCallState(dueAt: number | null, now: number, dayEnd: number): FirstCallState {
  if (dueAt === null) return null;
  if (dueAt < now) return 'overdue';
  return dueAt < dayEnd ? 'today' : 'later';
}

/** The groups of the inspections and reports page. */
export const INSPECTION_GROUPS = ['report_due', 'snags_open', 'done'] as const;
export type InspectionGroup = (typeof INSPECTION_GROUPS)[number];

export const INSPECTION_GROUP_LABELS: Readonly<Record<InspectionGroup, string>> = {
  report_due: 'Report due',
  snags_open: 'Reported, snags open',
  done: 'Reported or finished',
};

export interface InspectionFacts {
  readonly service: 'snagging' | 'valuation';
  readonly status: Status;
  readonly reports: readonly { readonly kind: string }[];
  readonly reinspectionRequested: boolean;
  readonly snagsOpen: number;
}

/**
 * Report due: an open inspection without its report (snagging or valuation), or with a re-inspection asked for
 * and no re-inspection report yet. Snags open: reported, open, with snags the owner still waits on. Everything
 * else is reported or finished.
 */
export function inspectionGroup(f: InspectionFacts): InspectionGroup {
  const open = OPEN_STATUSES.has(f.status);
  const kinds = new Set(f.reports.map((r) => r.kind));
  const reportOwed = !kinds.has(f.service) || (f.reinspectionRequested && !kinds.has('reinspection'));
  if (open && reportOwed) return 'report_due';
  if (open && f.snagsOpen > 0) return 'snags_open';
  return 'done';
}
