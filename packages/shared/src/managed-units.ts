/**
 * Managed units (ADR 0034; O4, A1, R2, U4, U5): a unit whose owner hands its day-to-day running to a JAD Global
 * property management team (e.g. Harbor Property Management). The arrangement starts when the owner's property
 * management consultation reaches "Active" (ADR 0031), when JAD+ Admin sets it, or in bulk for units sold with
 * complimentary management for a fixed time.
 *
 * While a unit is managed:
 * - the managing team's office invites, extends and ends the tenant (the owner's own rights of ADR 0021 pass to
 *   the manager; the owner reads);
 * - a tenant's repair request waits for the manager's approval instead of the owner's (A1), and once approved
 *   goes to the manager's chosen maintenance company when one is set (otherwise the normal routing applies);
 * - the owner's own requests run the normal owner flow; the manager sees them on its "Managed units" page;
 * - the manager uploads one PDF statement per month; the owner reads them in My unit.
 *
 * Arrangements are history: ending one keeps the row (ended_at). The CHECK lists of migration 0032 mirror the
 * lists below (drift-tested).
 */
import { z } from 'zod';
import { emailSchema, idSchema, sfIdSchema } from './schemas.js';
import { monthSchema } from './periods.js';

/** How an arrangement started. Mirrors managed_units.source in migration 0032. */
export const MANAGED_SOURCES = ['consultation', 'admin', 'complimentary'] as const;
export type ManagedSource = (typeof MANAGED_SOURCES)[number];

/** The property management consultation stage that starts the arrangement (ADR 0031 stages). */
export const MANAGEMENT_SERVICE_CODE = 'property-management';
export const MANAGEMENT_ACTIVE_STAGE = 'active';

/** The services whose requests the manager sees on a managed unit (repairs; never sales, mortgage or visas). */
export const MANAGER_VISIBLE_SERVICES: ReadonlySet<string> = new Set(['maintenance']);

/** A monthly statement: a PDF of at most 20 MB, like reports (ADR 0032). */
export const STATEMENT_MAX_BYTES = 20 * 1024 * 1024;
/** How many rows one bulk entry may carry. */
export const BULK_MAX_ROWS = 200;
/** Complimentary or admin-set management lasts at most this long at a time (it can be set again). */
export const MAX_MANAGEMENT_DAYS = 5 * 366;

const DAY = 86_400_000;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

export interface ManagedFacts {
  /** YYYY-MM-DD (Dubai). */
  readonly since: string;
  /** YYYY-MM-DD (Dubai), the last day; null = open-ended. */
  readonly until: string | null;
  /** When it was ended early (ms), or null. */
  readonly endedAt: number | null;
}

/** O4: whether the arrangement is in force on this Dubai date (from `since` through `until`, unless ended). */
export function isManagedOn(m: ManagedFacts, today: string): boolean {
  return m.endedAt === null && m.since <= today && (m.until === null || today <= m.until);
}

/** A1 (ADR 0034): who decides a tenant's routine request: the managing team while the unit is managed. */
export function approverFor(managedNow: boolean): 'owner' | 'manager' {
  return managedNow ? 'manager' : 'owner';
}

/** O4 (ADR 0021, 0034): who invites, extends and ends the tenant of a unit. */
export function tenancyKeeperFor(managedNow: boolean): 'owner' | 'manager' {
  return managedNow ? 'manager' : 'owner';
}

export interface MaintenancePartnerFacts {
  readonly id: string;
  readonly kind: 'external' | 'jad_group';
  readonly status: 'active' | 'suspended' | 'ended';
}

/**
 * A1 (ADR 0034): where an approved tenant request on a managed unit goes. The manager's chosen maintenance company
 * when one is set, is an outside partner and is active; otherwise null, meaning the normal maintenance routing
 * (primary, or backup when the primary is suspended).
 */
export function maintenancePartnerFor(chosen: MaintenancePartnerFacts | null): string | null {
  if (chosen?.kind !== 'external' || chosen.status !== 'active') return null;
  return chosen.id;
}

/**
 * ADR 0034 choice: an owner's own request on a managed unit runs the normal owner flow and routing (the owner
 * chose the work and pays for it, L4); the manager is kept informed by seeing it on its "Managed units" page.
 */
export function ownerRequestRouting(): 'normal' {
  return 'normal';
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
function days(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

/** Dates JAD+ Admin may give: from today or earlier (at most a year back), ending after today, within 5 years. */
export function managementDatesAllowed(since: string, until: string | null, today: string): boolean {
  if (days(since, today) > 366 || since > today) return false;
  if (until === null) return true;
  return until > today && until > since && days(since, until) <= MAX_MANAGEMENT_DAYS;
}

/** "2026-11" for a Dubai date (YYYY-MM-DD). */
const monthOfDate = (date: string): string => date.slice(0, 7);

/**
 * A statement month the manager may upload: within the arrangement (from the month it started, through the month
 * it ends) and not in the future.
 */
export function statementMonthAllowed(month: string, m: ManagedFacts, today: string): boolean {
  if (m.endedAt !== null) return false;
  if (month < monthOfDate(m.since) || month > monthOfDate(today)) return false;
  return m.until === null || month <= monthOfDate(m.until);
}

/** Whether a request (raised on a managed unit) is one the manager sees. */
export function managerSeesRequest(serviceCode: string, isEmergency: boolean): boolean {
  return isEmergency || MANAGER_VISIBLE_SERVICES.has(serviceCode);
}

// ---- Payloads (strict: unknown keys rejected, C-VAL-1) ----

export const managedIdParam = z.strictObject({ id: idSchema });
export const managedTenancyParam = z.strictObject({ id: idSchema, tenancyId: idSchema });
export const managedStatementParam = z.strictObject({ id: idSchema, statementId: idSchema });
export const providerIdParam = z.strictObject({ providerId: idSchema });

/** POST /api/admin/managed-units: JAD+ Admin sets a unit as managed (person page / unit). */
export const setManagedBody = z.strictObject({
  sfUnitId: sfIdSchema,
  ownerUserId: idSchema,
  providerId: idSchema,
  since: isoDate,
  until: isoDate.nullable(),
});
export type SetManagedBody = z.infer<typeof setManagedBody>;

/** POST /api/admin/managed-units/bulk: units sold with complimentary management (all or nothing). */
export const bulkManagedBody = z.strictObject({
  providerId: idSchema,
  rows: z
    .array(
      z.strictObject({
        unitName: z.string().trim().min(1).max(80),
        ownerEmail: emailSchema,
        until: isoDate,
      }),
    )
    .min(1)
    .max(BULK_MAX_ROWS),
});
export type BulkManagedBody = z.infer<typeof bulkManagedBody>;

/** PUT /api/{admin/managed-units/settings/:providerId | partner/managed-units/settings}: the maintenance company. */
export const maintenancePartnerBody = z.strictObject({ partnerId: idSchema.nullable() });
export type MaintenancePartnerBody = z.infer<typeof maintenancePartnerBody>;

/** POST /api/partner/managed-units/:id/statements?month=YYYY-MM (the PDF is the raw body). */
export const statementUploadQuery = z.strictObject({ month: monthSchema });

/** POST /api/partner/managed-units/requests/:id/approval (the manager's A1 decision). */
export const managerApprovalBody = z.strictObject({ decision: z.enum(['approve', 'decline']) });

// ---- Answers ----

const tenancyStatus = z.enum(['invited', 'active', 'ended', 'revoked']);

const statementView = z.object({ id: z.string(), month: z.string(), uploadedAt: z.number() });
export type StatementView = z.infer<typeof statementView>;

const arrangementView = z.object({
  id: z.string(),
  sfUnitId: z.string(),
  unitName: z.string().nullable(),
  project: z.string().nullable(),
  providerId: z.string(),
  providerName: z.string(),
  source: z.enum(MANAGED_SOURCES),
  since: z.string(),
  until: z.string().nullable(),
  endedAt: z.number().nullable(),
  /** In force today (isManagedOn). */
  current: z.boolean(),
});
export type ArrangementView = z.infer<typeof arrangementView>;

/** GET /api/owner/managed-units: the owner's managed units (current and past) with their statements. */
export const ownerManagedUnitsResponse = z.object({
  units: z.array(arrangementView.extend({ statements: z.array(statementView) })),
});
export type OwnerManagedUnit = z.infer<typeof ownerManagedUnitsResponse>['units'][number];

/** GET /api/admin/managed-units: arrangements (filtered by provider or unit). */
export const adminManagedUnitsResponse = z.object({
  units: z.array(arrangementView.extend({ ownerUserId: z.string() })),
});

export const managedSetResponse = z.object({ id: z.string() });
export const bulkManagedResponse = z.object({ added: z.number().int() });
/** 400 answer of a refused bulk entry: every row's problem, nothing saved. */
export const bulkProblemsBody = z.object({
  error: z.string(),
  problems: z.array(z.object({ row: z.number().int(), problem: z.string() })),
});

export const maintenanceSettingResponse = z.object({
  partnerId: z.string().nullable(),
  partnerName: z.string().nullable(),
  /** Outside partners that can be chosen (active). */
  choices: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type MaintenanceSetting = z.infer<typeof maintenanceSettingResponse>;

const managedRequestView = z.object({
  id: z.string(),
  ref: z.string(),
  serviceCode: z.string(),
  status: z.string(),
  isEmergency: z.boolean(),
  raisedBy: z.enum(['owner', 'tenant']),
  description: z.string(),
  createdAt: z.number(),
});

/** GET /api/partner/managed-units: the units this office manages now, with what waits for it. */
export const officeManagedUnitsResponse = z.object({
  units: z.array(
    arrangementView.extend({
      tenantStatus: tenancyStatus.nullable(),
      awaitingApproval: z.number().int(),
      openRequests: z.number().int(),
      lastStatementMonth: z.string().nullable(),
    }),
  ),
});
export type OfficeManagedUnit = z.infer<typeof officeManagedUnitsResponse>['units'][number];

/** GET /api/partner/managed-units/:id: one managed unit. */
export const officeManagedUnitResponse = z.object({
  unit: arrangementView,
  tenancy: z
    .object({
      id: z.string(),
      tenantName: z.string(),
      contact: z.string(),
      startsOn: z.string(),
      endsOn: z.string(),
      status: tenancyStatus,
      current: z.boolean(),
      daysLeft: z.number().int(),
    })
    .nullable(),
  requests: z.array(managedRequestView),
  statements: z.array(statementView),
});
export type OfficeManagedUnitDetail = z.infer<typeof officeManagedUnitResponse>;
