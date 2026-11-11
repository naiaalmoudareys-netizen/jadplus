/**
 * What the owner app shows of a report request (ADR 0032; O3, L2): the snagging choices, the names of the
 * reports and snag statuses, the snag counts, and which reports belong under a unit's documents. Pure, so it is
 * tested without a phone.
 */
import {
  SNAGGING_CHOICES,
  SNAGGING_TYPES,
  type OwnerReport,
  type ReportKind,
  type SnaggingType,
  type SnagStatus,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';

export interface SnaggingOption {
  readonly type: SnaggingType;
  readonly title: MessageKey;
  readonly detail: MessageKey;
  /** "From AED 999" for professional snagging; null when free. */
  readonly priceFromAed: number | null;
}

/** O3: soft (free, handover team) first, then professional (from AED 999). */
export const SNAGGING_OPTIONS: readonly SnaggingOption[] = SNAGGING_TYPES.map((type) => ({
  type,
  title: type === 'soft' ? 'report.snagging.soft' : 'report.snagging.pro',
  detail: type === 'soft' ? 'report.snagging.softDetail' : 'report.snagging.proDetail',
  priceFromAed: SNAGGING_CHOICES[type].priceFromAed,
}));

export const REPORT_TITLE: Readonly<Record<ReportKind, MessageKey>> = {
  snagging: 'report.kind.snagging',
  valuation: 'report.kind.valuation',
  reinspection: 'report.kind.reinspection',
};

export const SNAG_STATUS: Readonly<Record<SnagStatus, MessageKey>> = {
  open: 'snag.status.open',
  fixed: 'snag.status.fixed',
  confirmed: 'snag.status.confirmed',
};

/** How many snags are open, fixed and confirmed. */
export function snagCounts(statuses: readonly SnagStatus[]): Record<SnagStatus, number> {
  const count = (s: SnagStatus) => statuses.filter((x) => x === s).length;
  return { open: count('open'), fixed: count('fixed'), confirmed: count('confirmed') };
}

/** The reports filed for a unit (matched by the unit's name, as the owner's deal names it). */
export function reportsForUnit(reports: readonly OwnerReport[], unitName: string | null): OwnerReport[] {
  if (unitName === null) return [];
  return reports.filter((r) => r.unitName === unitName);
}
