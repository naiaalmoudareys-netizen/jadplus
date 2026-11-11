/**
 * What the API answers about a provider workspace (ADR 0036), so the console checks what it receives:
 *
 * - GET /api/partner/workspace       the company, its workspace title, services and pages
 * - GET /api/partner/overview        only the sections of the workspace (null for the others)
 * - GET /api/partner/consultations   the consultations pipeline (O5, P5)
 * - GET /api/partner/inspections     inspections and reports (O3, S4)
 *
 * No resident's name or contact details: units are named by unit and project only.
 */
import { z } from 'zod';
import { STATUSES } from './lifecycle.js';
import { overviewAlert, visitsOverview } from './partner-office/responses.js';
import { REPORT_KINDS, REPORT_SERVICES, SNAGGING_TYPES } from './reports.js';
import { PROVIDER_KINDS } from './services.js';
import { VISIT_SLOT_KEYS } from './visits.js';
import { OFFICE_PAGES, WORK_AREAS } from './workspace.js';

const int = z.number().int();

export const workspaceView = z.object({
  title: z.string(),
  subtitle: z.string(),
  areas: z.array(z.enum(WORK_AREAS)),
  also: z.array(z.string()),
  services: z.array(z.object({ code: z.string(), name: z.string() })),
  pages: z.array(z.enum(OFFICE_PAGES)),
});

/** GET /api/partner/workspace */
export const partnerWorkspaceResponse = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(PROVIDER_KINDS),
  managesUnits: z.boolean(),
  workspace: workspaceView,
});
export type PartnerWorkspace = z.infer<typeof partnerWorkspaceResponse>;

const unit = { unitName: z.string().nullable(), project: z.string().nullable() };

export const handoverOverview = z.object({
  /** Checklists open now, and handover requests still waiting for their checklist. */
  inProgress: int,
  waitingToStart: int,
  keyCollectionsThisWeek: z.array(
    z.object({ id: z.string(), ...unit, date: z.string(), slot: z.enum(VISIT_SLOT_KEYS) }),
  ),
  /** Snags the handover team fixes (ADR 0032): open, and of those reopened by the owner. */
  snagsOpen: int,
  snagsReopened: int,
});

export const managedOverview = z.object({
  units: int,
  /** Tenants' repair requests waiting for the manager's decision (A1). */
  approvalsWaiting: int,
  /** Units managed last month without a statement for last month yet. */
  statementsDue: z.array(z.object({ id: z.string(), ...unit })),
  statementMonth: z.string(),
});

export const consultationsOverview = z.object({
  byService: z.array(
    z.object({
      serviceCode: z.string(),
      serviceName: z.string(),
      columns: z.array(z.object({ id: z.string(), label: z.string(), count: int })),
    }),
  ),
  firstCallsDueToday: int,
  firstCallsOverdue: int,
});

export const reportsOverview = z.object({
  /** Open inspections without their report yet, and of those past their deadline. */
  due: int,
  overdue: int,
  uploadedThisMonth: int,
  /** Open snags on this company's own inspections. */
  snagsOpen: int,
});

export const educationOverview = z.object({
  nextSession: z
    .object({ id: z.string(), title: z.string(), startsAt: int, seats: int, booked: int })
    .nullable(),
  booksToSend: int,
});

/** GET /api/partner/overview: the sections the workspace has; every other section is null. */
export const partnerOverviewResponse = z.object({
  alerts: z.array(overviewAlert),
  visits: visitsOverview.nullable(),
  handover: handoverOverview.nullable(),
  managed: managedOverview.nullable(),
  consultations: consultationsOverview.nullable(),
  reports: reportsOverview.nullable(),
  education: educationOverview.nullable(),
});
export type PartnerOverview = z.infer<typeof partnerOverviewResponse>;

/** GET /api/partner/consultations: open consultations and those finished in the last 30 days. */
export const partnerConsultationsResponse = z.object({
  consultations: z.array(
    z.object({
      id: z.string(),
      ref: z.string(),
      serviceCode: z.string(),
      ...unit,
      status: z.enum(STATUSES),
      /** The steps recorded so far, oldest first (contact_made, stages, outcome). */
      steps: z.array(z.string()),
      lastStepAt: int.nullable(),
      nextDueAt: int.nullable(),
      createdAt: int,
    }),
  ),
});
export type PartnerConsultation = z.infer<typeof partnerConsultationsResponse>['consultations'][number];

/** GET /api/partner/inspections: open inspections and those finished in the last 30 days. */
export const partnerInspectionsResponse = z.object({
  inspections: z.array(
    z.object({
      id: z.string(),
      ref: z.string(),
      service: z.enum(REPORT_SERVICES),
      snaggingType: z.enum(SNAGGING_TYPES).nullable(),
      ...unit,
      status: z.enum(STATUSES),
      nextDueAt: int.nullable(),
      nextDueKind: z.string().nullable(),
      reports: z.array(z.object({ kind: z.enum(REPORT_KINDS), uploadedAt: int })),
      reinspectionRequested: z.boolean(),
      snagsOpen: int,
      createdAt: int,
    }),
  ),
});
export type PartnerInspection = z.infer<typeof partnerInspectionsResponse>['inspections'][number];
