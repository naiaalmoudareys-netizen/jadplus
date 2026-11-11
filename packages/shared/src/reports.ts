/**
 * Flow B, "inspection with a report" (BUILD_SPEC O3, S4, L2; ADR 0030 wave 1, ADR 0032): snagging and valuation
 * requests end with a written report (a PDF) instead of "work finished".
 *
 * - O3: the owner chooses soft snagging (free, by the JAD Global handover team) or professional snagging (an
 *   independent inspector, from AED 999). Soft snagging goes to the provider assigned to the 'handover' service,
 *   professional snagging to the snagging provider.
 * - The provider books the inspection visit as in the visit journey (book, on my way, start) and then uploads
 *   the report. A valuation may be reported without a visit.
 * - S4: inspection booked within 48 hours (ADR 0030); snagging report within 24 hours of the inspection visit;
 *   valuation report within 3 working days of the request; one free re-inspection, booked within 48 hours.
 * - L2: a valuation report always carries "Indicative valuation, not a formal appraisal."
 *
 * The snag list itself is snags.ts. These are pure rules: the API enforces them, the apps only show what they
 * allow. Mirrors the CHECK lists of migration 0029 (drift-tested).
 */
import { z } from 'zod';
import type { Due } from './admin-ops.js';
import type { Role, Status } from './lifecycle.js';
import { idSchema } from './schemas.js';
import type { SnagStatus } from './snags.js';

const HOUR = 3_600_000;

/** O3: the two kinds of snagging the owner can choose. Mirrors report_requests.snagging_type (migration 0029). */
export const SNAGGING_TYPES = ['soft', 'professional'] as const;
export type SnaggingType = (typeof SNAGGING_TYPES)[number];

export interface SnaggingChoice {
  /** The service whose assigned provider takes the request. */
  readonly providerService: 'handover' | 'snagging';
  /** Shown to the owner: free, or "from AED 999" (the inspector quotes nothing in the app). */
  readonly priceFromAed: number | null;
}

/** O3 (product owner's service report): soft snagging is free, professional starts at AED 999. */
export const SNAGGING_CHOICES: Readonly<Record<SnaggingType, SnaggingChoice>> = {
  soft: { providerService: 'handover', priceFromAed: null },
  professional: { providerService: 'snagging', priceFromAed: 999 },
};

/**
 * O3: the snagging kind of a new request. Only a snagging request has one; when the app does not say (an older
 * app version), it is professional snagging, which is what snagging was before the choice existed.
 */
export function snaggingTypeFor(serviceCode: string, chosen: SnaggingType | undefined): SnaggingType | null {
  if (serviceCode !== 'snagging') return null;
  return chosen ?? 'professional';
}

/** O3: the service whose provider takes the request (soft snagging: the JAD Global handover team). */
export function providerServiceFor(serviceCode: string, snagging: SnaggingType | null): string {
  return snagging === null ? serviceCode : SNAGGING_CHOICES[snagging].providerService;
}

/** The two report services (ADR 0030 flow 'report'). Mirrors report_requests.service (migration 0029). */
export const REPORT_SERVICES = ['snagging', 'valuation'] as const;
export type ReportService = (typeof REPORT_SERVICES)[number];

/** The report service of a request, or null when the service runs another flow. */
export function reportServiceOf(serviceCode: string): ReportService | null {
  return serviceCode === 'snagging' || serviceCode === 'valuation' ? serviceCode : null;
}

/**
 * The reports a request can have, one of each: the snagging report, the re-inspection report (after the free
 * re-inspection), or the valuation report. Mirrors request_reports.kind (migration 0029).
 */
export const REPORT_KINDS = ['snagging', 'valuation', 'reinspection'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** Largest report PDF accepted (inspection reports carry many photos). */
export const REPORT_MAX_BYTES = 20 * 1024 * 1024;

/** L2: printed with every valuation report (exact wording; the app translates it). */
export const VALUATION_DISCLAIMER = 'Indicative valuation, not a formal appraisal.';

/** S4: a snagging report (and the re-inspection's) is due within 24 hours of the inspection visit. */
export const SNAGGING_REPORT_HOURS = 24;
/** S4: the free re-inspection is booked within 48 hours, like the first inspection (ADR 0030). */
export const REINSPECTION_BOOKING_HOURS = 48;

/** What the request's deadline is for once the report flow runs (requests.next_due_kind; free text, 40 max). */
export const REPORT_DUE_KINDS = [
  'valuation_report',
  'snagging_report',
  'reinspection_booking',
  'reinspection_report',
] as const;
export type ReportDueKind = (typeof REPORT_DUE_KINDS)[number];

/**
 * S4: the deadline after the provider books the inspection visit. A valuation keeps its report deadline
 * (3 working days from the request); a snagging inspection or re-inspection waits for the visit, as in the
 * visit journey.
 */
export function dueAfterBooking(service: ReportService, windowEnd: number, current: Due | null): Due {
  if (service === 'valuation' && current !== null) return current;
  return { at: windowEnd, kind: 'visit' };
}

/**
 * S4: once the inspection visit takes place (the inspector starts it), the snagging report, or the
 * re-inspection report, is due within 24 hours. A valuation keeps its 3-working-day deadline.
 */
export function dueAfterInspection(
  service: ReportService,
  reinspection: boolean,
  startedAt: number,
  current: Due | null,
): Due | null {
  if (service === 'valuation') return current;
  return {
    at: startedAt + SNAGGING_REPORT_HOURS * HOUR,
    kind: reinspection ? 'reinspection_report' : 'snagging_report',
  };
}

/** S4: the free re-inspection, asked for at `requestedAt`, must be booked within 48 hours. */
export function reinspectionBookingDue(requestedAt: number): Due {
  return { at: requestedAt + REINSPECTION_BOOKING_HOURS * HOUR, kind: 'reinspection_booking' };
}

/**
 * S4/S5: a report delivered against one of these deadlines counts on the provider's scorecard as the service
 * milestone (the valuation report; the snagging report when the booking was not already measured).
 */
export function reportMilestone(dueKind: string | null): boolean {
  return dueKind === 'valuation_report' || dueKind === 'snagging_report';
}

/** The report-flow steps beyond the visit journey (jobflow.ts). */
export const REPORT_ACTIONS = ['upload_report', 'add_snag', 'request_reinspection'] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

/** What the rules need to know about a report request. */
export interface ReportState {
  readonly service: ReportService;
  readonly status: Status;
  /** The first report (snagging or valuation) is on file. */
  readonly reported: boolean;
  readonly reinspectionRequested: boolean;
  readonly reinspectionReported: boolean;
  /** The snag list (snagging only; empty for a valuation). */
  readonly snags: readonly SnagStatus[];
}

/**
 * O3/S4: the free re-inspection may be asked for once, after the snagging report, when the list had snags and
 * none of them is still open (each fixed, or fixed and confirmed by the owner).
 */
export function reinspectionAllowed(s: ReportState): boolean {
  return (
    s.service === 'snagging' &&
    s.status === 'in_progress' &&
    s.reported &&
    !s.reinspectionRequested &&
    s.snags.length > 0 &&
    s.snags.every((x) => x !== 'open')
  );
}

/**
 * The report-flow steps a role may take now. `partner`/`partner_admin` means the provider the request is
 * assigned to and `owner` the request's owner (the API checks who the person is). Tenants have none: reports
 * and snag lists are the owner's (R2).
 */
export function reportActions(role: Role, s: ReportState): ReportAction[] {
  const actions: ReportAction[] = [];
  if (role === 'partner' || role === 'partner_admin') {
    if (s.service === 'valuation') {
      // A valuation may be reported with or without a visit.
      if (!s.reported && ['assigned', 'scheduled', 'in_progress'].includes(s.status)) {
        actions.push('upload_report');
      }
    } else if (s.status === 'in_progress') {
      if (!s.reported) actions.push('add_snag', 'upload_report');
      else if (s.reinspectionRequested && !s.reinspectionReported) actions.push('upload_report');
    }
  }
  if (role === 'owner' && reinspectionAllowed(s)) actions.push('request_reinspection');
  return actions;
}

/**
 * What uploading the report does: which report it is and where the request goes. A valuation report or a
 * re-inspection report finishes the request (the owner confirms, or it closes by itself after 72 hours, A4).
 * A snagging report with snags keeps the request open while the snags are fixed; without snags it finishes.
 */
export function reportUpload(s: ReportState): { readonly kind: ReportKind; readonly to: Status } {
  if (s.service === 'valuation') return { kind: 'valuation', to: 'completed' };
  if (s.reported) return { kind: 'reinspection', to: 'completed' };
  return { kind: 'snagging', to: s.snags.length > 0 ? 'in_progress' : 'completed' };
}

/** POST /api/requests: the snagging choice (O3), only with serviceCode 'snagging' (checked in services.ts). */
export const snaggingTypeSchema = z.enum(SNAGGING_TYPES);

/** GET /api/requests/:id/report/:reportId/file */
export const reportFileParam = z.strictObject({ id: idSchema, reportId: idSchema });

const reportFile = z.object({
  id: z.string(),
  kind: z.enum(REPORT_KINDS),
  uploadedAt: z.number().int(),
  byteSize: z.number().int(),
});
export type ReportFile = z.infer<typeof reportFile>;

/** GET /api/requests/:id/report: the request's report side (owner, its provider, JAD+ staff). */
export const requestReportResponse = z.object({
  /** null: the request runs another flow (nothing to show). */
  service: z.enum(REPORT_SERVICES).nullable(),
  snaggingType: z.enum(SNAGGING_TYPES).nullable(),
  reports: z.array(reportFile),
  reinspectionRequestedAt: z.number().int().nullable(),
  /** L2: the valuation line, in English (the app shows its translation). */
  disclaimer: z.string().nullable(),
  actions: z.array(z.enum(REPORT_ACTIONS)),
  /** S4: when the report is due (provider and JAD+ staff only; null for the owner, S8). */
  reportDueAt: z.number().int().nullable(),
});
export type RequestReport = z.infer<typeof requestReportResponse>;

/** POST /api/requests/:id/report answer. */
export const reportUploadedResponse = z.object({
  id: z.string(),
  kind: z.enum(REPORT_KINDS),
  status: z.string(),
});

/** GET /api/me/reports: every report on the owner's requests, for My unit → Documents. */
export const ownerReportsResponse = z.object({
  reports: z.array(
    reportFile.extend({
      requestId: z.string(),
      ref: z.string(),
      sfUnitId: z.string(),
      /** The unit's name (as on the owner's deal), to show the report under that unit's documents. */
      unitName: z.string().nullable(),
      service: z.enum(REPORT_SERVICES),
    }),
  ),
});
export type OwnerReport = z.infer<typeof ownerReportsResponse>['reports'][number];
