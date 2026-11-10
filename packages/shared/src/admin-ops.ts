/**
 * JAD+ Admin operations payloads and rules (ADR 0025; R4, A1, E6, E13, S6, U8, U9, V3, ADR 0011): the overview,
 * staff actions on requests, people, the desk queue, staff accounts, the audit log viewer and monthly reports.
 * Pure rules (month ranges, CSV, percentages, clocks after a staff action) live here with tests.
 */
import { z } from 'zod';
import { DEFAULT_CALENDAR, addWorkingMinutes } from './calendar.js';
import { DESK_REQUEST_TYPES, DESK_STATUSES, type DeskStatus } from './desk.js';
import { EMERGENCY_ACK_MINUTES } from './emergency.js';
import { ROLES, STATUSES, type Status } from './lifecycle.js';
import { normalisePhone } from './owners.js';
import { emailSchema, idSchema, sfIdSchema } from './schemas.js';
import { SERVICE_CODES } from './services.js';
import { MAINTENANCE_SLA } from './sla.js';
import { VISIT_SLOT_KEYS } from './visits.js';

const MIN = 60_000;
const DAY = 86_400_000;
/** Dubai is UTC+4 all year (no daylight saving). */
const DUBAI_OFFSET = 4 * 3_600_000;

/** The audit log viewer shows this many entries per page. */
export const AUDIT_PAGE_SIZE = 100;

/** "YYYY-MM": a calendar month, January to December. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM.');

/** The Dubai month that contains the instant `t`. */
export function monthOf(t: number): string {
  return new Date(t + DUBAI_OFFSET).toISOString().slice(0, 7);
}

/** The month before `month` (YYYY-MM). */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** A Dubai month as [start, end) in UTC milliseconds, for "created_at >= start AND created_at < end". */
export function monthRange(month: string): { readonly start: number; readonly end: number } {
  const [y, m] = month.split('-').map(Number);
  const start = Date.UTC(y ?? 1970, (m ?? 1) - 1, 1) - DUBAI_OFFSET;
  const end = Date.UTC(y ?? 1970, m ?? 1, 1) - DUBAI_OFFSET;
  return { start, end };
}

/** The Dubai day that contains `t`, as [start, end) in UTC milliseconds. */
export function dayRange(t: number): { readonly start: number; readonly end: number } {
  const start = Math.floor((t + DUBAI_OFFSET) / DAY) * DAY - DUBAI_OFFSET;
  return { start, end: start + DAY };
}

/** Share as a percentage with one decimal; null when there is nothing to measure (never "0 %" for no data). */
export function percent(part: number, total: number): number | null {
  return total <= 0 ? null : Math.round((part / total) * 1000) / 10;
}

/** An average with one decimal, or null with no values. */
export function average(sum: number, count: number): number | null {
  return count <= 0 ? null : Math.round((sum / count) * 10) / 10;
}

/**
 * One CSV cell (RFC 4180): quoted when needed, quotes doubled. A cell that a spreadsheet would run as a formula
 * (starting with = + - @ or a tab/return) gets a leading apostrophe (CSV injection).
 */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows to CSV text, lines ending in CRLF. */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** ADR 0011: the desk moves a request on; Completed and Cancelled are final. */
export function deskChangeAllowed(from: DeskStatus, to: DeskStatus): boolean {
  if (from === 'Completed' || from === 'Cancelled') return false;
  return to !== 'New';
}

export interface Due {
  readonly at: number;
  readonly kind: string;
}

/** E6/S6: the new partner's clock after JAD+ Admin moves a job: acknowledge an emergency, or answer in 4 working hours. */
export function reassignedDue(isEmergency: boolean, now: number): Due {
  return isEmergency
    ? { at: now + EMERGENCY_ACK_MINUTES * MIN, kind: 'emergency_ack' }
    : {
        at: addWorkingMinutes(now, MAINTENANCE_SLA.routineResponse.minutes, DEFAULT_CALENDAR),
        kind: 'routine_response',
      };
}

/**
 * E13: an emergency reclassified as routine. Not yet answered: the routine 4-working-hour clock from now.
 * Later steps keep their clock, except an emergency deadline, which no longer applies.
 */
export function reclassifiedDue(status: Status, current: Due | null, now: number): Due | null {
  if (status === 'submitted' || status === 'assigned') return reassignedDue(false, now);
  return current?.kind.startsWith('emergency_') === true ? null : current;
}

/** Why a staff member cannot be removed, or null when they can. */
export function staffRemovalProblem(o: {
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly targetIsAdmin: boolean;
  readonly liveAdmins: number;
}): 'self' | 'last_admin' | null {
  if (o.actorUserId === o.targetUserId) return 'self';
  if (o.targetIsAdmin && o.liveAdmins <= 1) return 'last_admin';
  return null;
}

/** How a people search is read: an email, a mobile number (both by exact blind index), or a unit name. */
export type PeopleSearch =
  | { readonly kind: 'email'; readonly value: string }
  | { readonly kind: 'phone'; readonly value: string }
  | { readonly kind: 'unit'; readonly value: string };

export function peopleSearch(q: string): PeopleSearch {
  const text = q.trim();
  if (text.includes('@')) {
    const email = emailSchema.safeParse(text);
    return email.success ? { kind: 'email', value: email.data } : { kind: 'unit', value: text };
  }
  const phone = normalisePhone(text);
  return phone === null ? { kind: 'unit', value: text } : { kind: 'phone', value: phone };
}

// Payloads (C-VAL-1, strict: unknown keys refused) and answers.

const int = z.number().int();
const text = z.string();
const maybeText = z.string().nullable();
const maybeNumber = z.number().nullable();
const status = z.enum(STATUSES);
const accountStatus = z.enum(['active', 'frozen', 'closed']);
const tenancyStatus = z.enum(['invited', 'active', 'ended', 'revoked']);
const reason = z.string().trim().min(3).max(500);
const detailRecord = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .nullable();

/** POST /api/admin/requests/:id/notes. ownerCalled marks the A1 call to the owner. */
export const adminNoteBody = z.strictObject({
  text: z.string().trim().min(1).max(2000),
  ownerCalled: z.boolean().default(false),
});
/** POST /api/admin/requests/:id/reassign (E6, S6). */
export const adminReassignBody = z.strictObject({ partnerId: idSchema, reason });
/** Reclassify (E13), cancel, freeze / unfreeze (U9), tenancy end, staff removal: the reason is kept. */
export const adminReasonBody = z.strictObject({ reason });

/** POST /api/admin/requests: raised for an owner (U8, V3). */
export const adminRaiseBody = z.strictObject({
  ownerUserId: idSchema,
  sfUnitId: sfIdSchema,
  serviceCode: z.enum(SERVICE_CODES),
  description: z.string().trim().min(1).max(2000),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredSlot: z.enum(VISIT_SLOT_KEYS),
});
export const adminRaiseResponse = z.object({ requestId: text, ref: text, sentTo: text });

/** Answer to reassign, reclassify and cancel. */
export const adminRequestActionResponse = z.object({
  id: text,
  status,
  partnerId: maybeText,
  emergency: z.boolean(),
});

/** GET /api/admin/requests/:id/timeline: what happened, in order; roles and partner names only, no people. */
export const adminTimelineResponse = z.object({
  events: z.array(
    z.object({
      at: int,
      kind: text,
      actorRole: text,
      fromStatus: status.nullable(),
      toStatus: status.nullable(),
      partnerName: maybeText,
      data: detailRecord,
    }),
  ),
});

export const NOTE_KINDS = ['note', 'owner_called', 'reassigned', 'reclassified', 'cancelled'] as const;

/** GET /api/admin/requests/:id/notes (staff only). */
export const adminNotesResponse = z.object({
  notes: z.array(z.object({ id: text, kind: z.enum(NOTE_KINDS), text, authorName: maybeText, at: int })),
});

const monthStats = z.object({ month: text, raised: int, closed: int, slaMetPct: maybeNumber });

/** GET /api/admin/overview */
export const adminOverviewResponse = z.object({
  live: z.object({
    activeEmergencies: int,
    openByStatus: z.array(z.object({ status, count: int })),
    visitsToday: int,
    overdue: int,
    waitingForOwners: int,
    openDeskRequests: int,
    partnersSuspended: int,
  }),
  thisMonth: monthStats,
  lastMonth: monthStats,
});

/** GET /api/admin/people?q= : exact email or mobile, or a unit name. */
export const adminPeopleQuery = z.strictObject({ q: z.string().trim().min(2).max(120) });

const personSummary = z.object({
  id: text,
  name: maybeText,
  email: maybeText,
  phone: maybeText,
  status: accountStatus,
  roles: z.array(z.object({ role: z.enum(ROLES).exclude(['system']), partnerId: maybeText })),
});
export const adminPeopleResponse = z.object({ people: z.array(personSummary) });

/** GET /api/admin/people/:id */
export const adminPersonResponse = personSummary.extend({
  ownerUnits: z.array(z.object({ sfUnitId: text, unitName: text, project: maybeText })),
  tenancies: z.array(
    z.object({
      id: text,
      side: z.enum(['owner', 'tenant']),
      sfUnitId: text,
      unitName: maybeText,
      status: tenancyStatus,
      startsOn: text,
      endsOn: text,
    }),
  ),
  requests: z.array(
    z.object({ id: text, ref: text, status, emergency: z.boolean(), serviceName: maybeText, createdAt: int }),
  ),
  deskRequests: z.array(
    z.object({ id: text, type: z.enum(DESK_REQUEST_TYPES), status: z.enum(DESK_STATUSES), createdAt: int }),
  ),
  consents: z.array(
    z.object({
      kind: z.enum(['terms', 'make_safe_cap', 'marketing']),
      version: text,
      accepted: z.boolean(),
      at: int,
    }),
  ),
  activeSessions: int,
});

/** Answer to freeze, unfreeze and sign out everywhere. */
export const adminPersonActionResponse = z.object({ id: text, status: accountStatus, sessionsEnded: int });
/** Answer to the tenancy extend / end done for the owner. */
export const adminTenancyResponse = z.object({ id: text, status: tenancyStatus, endsOn: text });

export const adminDeskQuery = z.strictObject({ status: z.enum(DESK_STATUSES).optional() });

const deskRow = z.object({
  id: text,
  type: z.enum(DESK_REQUEST_TYPES),
  status: z.enum(DESK_STATUSES),
  dealId: maybeText,
  unitName: maybeText,
  userId: text,
  hasDetails: z.boolean(),
  replied: z.boolean(),
  /** Production: worked in Salesforce, not here. */
  inSalesforce: z.boolean(),
  createdAt: int,
  updatedAt: int.nullable(),
});
/** GET /api/admin/desk-requests?status= (no personal data; open one to see who and what). */
export const adminDeskQueueResponse = z.object({ requests: z.array(deskRow) });
/** GET /api/admin/desk-requests/:id: the owner and what they wrote (viewing is audited). */
export const adminDeskDetailResponse = deskRow.extend({
  ownerName: maybeText,
  ownerEmail: maybeText,
  ownerPhone: maybeText,
  details: maybeText,
  reply: maybeText,
});
/** POST /api/admin/desk-requests/:id */
export const adminDeskUpdateBody = z.strictObject({
  status: z.enum(['In progress', 'Completed', 'Cancelled']),
  reply: z.string().trim().min(1).max(1000).optional(),
});
export const adminDeskUpdateResponse = z.object({ id: text, status: z.enum(DESK_STATUSES) });

export const STAFF_ROLES = ['jad_admin', 'jad_viewer'] as const;

/** GET /api/admin/staff */
export const adminStaffResponse = z.object({
  staff: z.array(
    z.object({
      userId: text,
      name: maybeText,
      email: maybeText,
      role: z.enum(STAFF_ROLES),
      grantedAt: int,
      status: accountStatus,
    }),
  ),
});
/** POST /api/admin/staff */
export const adminAddStaffBody = z.strictObject({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  role: z.enum(STAFF_ROLES),
});
export const adminAddStaffResponse = z.object({ userId: text, role: z.enum(STAFF_ROLES) });
export const adminRemoveStaffResponse = z.object({ userId: text, sessionsEnded: int });

const instant = z.coerce.number().int().nonnegative();

/** GET /api/admin/audit?action=&actor=&target=&from=&to=&before= (newest first, AUDIT_PAGE_SIZE per page). */
export const adminAuditQuery = z.strictObject({
  action: z
    .string()
    .regex(/^[a-z_]{1,64}$/)
    .optional(),
  actor: idSchema.optional(),
  target: idSchema.optional(),
  from: instant.optional(),
  to: instant.optional(),
  /** The `seq` of the last entry already shown (the next page starts below it). */
  before: instant.optional(),
});
export const adminAuditResponse = z.object({
  entries: z.array(
    z.object({
      seq: int,
      at: int,
      actorUserId: maybeText,
      actorRole: text,
      action: text,
      targetType: maybeText,
      targetId: maybeText,
      detail: detailRecord,
    }),
  ),
  /** Pass as `before` for the next page; null on the last page. */
  nextBefore: int.nullable(),
});

export const adminMonthlyQuery = z.strictObject({ month: monthSchema });

/** GET /api/admin/reports/monthly?month=YYYY-MM (no personal data). */
export const adminMonthlyReportResponse = z.object({
  month: text,
  totals: z.object({
    raised: int,
    emergencies: int,
    closed: int,
    slaMetPct: maybeNumber,
    averageRating: maybeNumber,
    ratings: int,
    repeatVisits: int,
  }),
  byService: z.array(z.object({ code: text, name: text, raised: int, closed: int })),
  byProject: z.array(z.object({ project: text, raised: int })),
  byPartner: z.array(
    z.object({
      partnerId: text,
      name: text,
      jobs: int,
      closed: int,
      slaMetPct: maybeNumber,
      averageRating: maybeNumber,
      repeatVisits: int,
    }),
  ),
});
export type AdminMonthlyReport = z.infer<typeof adminMonthlyReportResponse>;

/** The monthly report as CSV (the same numbers as the JSON answer). */
export function monthlyReportCsv(r: AdminMonthlyReport): string {
  const t = r.totals;
  return toCsv([
    ['section', 'name', 'requests', 'closed', 'sla_met_pct', 'average_rating', 'repeat_visits'],
    ['total', `All requests ${r.month}`, t.raised, t.closed, t.slaMetPct, t.averageRating, t.repeatVisits],
    ['total', 'Emergencies', t.emergencies, null, null, null, null],
    ...r.byService.map((s) => ['service', s.name, s.raised, s.closed, null, null, null]),
    ...r.byProject.map((p) => ['project', p.project, p.raised, null, null, null, null]),
    ...r.byPartner.map((p) => [
      'partner',
      p.name,
      p.jobs,
      p.closed,
      p.slaMetPct,
      p.averageRating,
      p.repeatVisits,
    ]),
  ]);
}
