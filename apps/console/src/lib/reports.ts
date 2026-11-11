/**
 * Reports and snag lists in the console (ADR 0032; O3, S4, L2, C-UPL-1). The console checks the obvious before
 * sending (a PDF of at most 20 MB; a JPEG or PNG photo of at most 10 MB); the API checks the file's own bytes
 * again, so nothing here is trusted for safety.
 */
import {
  PHOTO_MAX_BYTES,
  REPORT_MAX_BYTES,
  type ReportKind,
  type SnaggingType,
  type SnagStatus,
} from '@jadplus/shared';
import { PHOTO_TYPES } from './photos';
import type { Tone } from './format';

export const REPORT_KIND_LABELS: Readonly<Record<ReportKind, string>> = {
  snagging: 'Snagging report',
  valuation: 'Valuation report',
  reinspection: 'Re-inspection report',
};

export const SNAGGING_TYPE_LABELS: Readonly<Record<SnaggingType, string>> = {
  soft: 'Soft snagging (free, JAD Global handover team)',
  professional: 'Professional snagging (independent inspector)',
};

export const SNAG_STATUS: Readonly<Record<SnagStatus, { readonly text: string; readonly tone: Tone }>> = {
  open: { text: 'Open', tone: 'bad' },
  fixed: { text: 'Fixed, owner to confirm', tone: 'warn' },
  confirmed: { text: 'Confirmed by the owner', tone: 'good' },
};

/** Why the chosen report cannot be sent, or null when it can. */
export function reportProblem(file: { readonly type: string; readonly size: number } | null): string | null {
  if (file === null) return 'Choose the report PDF first.';
  if (file.type !== 'application/pdf') return 'The report must be a PDF.';
  if (file.size === 0 || file.size > REPORT_MAX_BYTES) return 'The report can be up to 20 MB.';
  return null;
}

/** Why the chosen photo cannot be sent, or null when it can. */
export function snagPhotoProblem(
  file: { readonly type: string; readonly size: number } | null,
): string | null {
  if (file === null) return 'Choose a photo first.';
  if (!PHOTO_TYPES.includes(file.type)) return 'Photos must be JPEG or PNG.';
  if (file.size === 0 || file.size > PHOTO_MAX_BYTES) return 'A photo can be up to 10 MB.';
  return null;
}

/** "3 snags: 1 open, 1 fixed, 1 confirmed". */
export function snagSummary(statuses: readonly SnagStatus[]): string {
  if (statuses.length === 0) return 'No snags listed.';
  const count = (s: SnagStatus) => statuses.filter((x) => x === s).length;
  const total = statuses.length === 1 ? '1 snag' : `${String(statuses.length)} snags`;
  return `${total}: ${String(count('open'))} open, ${String(count('fixed'))} fixed, ${String(count('confirmed'))} confirmed`;
}

/** The name a downloaded report is saved under (never taken from the server). */
export function reportFileName(ref: string, kind: ReportKind): string {
  return `jadplus-${ref.replace(/[^A-Za-z0-9-]/g, '')}-${kind}-report.pdf`;
}

/** The address of a snag's photo or fix photo, for an <img> (GET with the cookie). */
export function snagPhotoUrl(requestId: string, snagId: string, which: 'snag' | 'fix'): string {
  return `/api/requests/${encodeURIComponent(requestId)}/snags/${encodeURIComponent(snagId)}/photo/${which}`;
}

/** "JAD-7KQ4M2 · JAD288-1102 · JAD 288": which request and unit a snag to fix is on. */
export function snagContext(s: {
  readonly ref: string;
  readonly unit: string | null;
  readonly project: string | null;
}): string {
  const place = [s.unit, s.project].filter((x) => x !== null).join(' · ');
  return `${s.ref} · ${place === '' ? 'Unit details with JAD+' : place}`;
}
