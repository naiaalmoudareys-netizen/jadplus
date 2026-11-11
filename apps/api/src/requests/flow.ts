/**
 * The request journey's shared pieces (ADR 0018): read a request with what the rules need (jobflow.ts), check
 * the person may take an action now, and the extra details the request page shows (visit, quote, finished-work
 * photos, rating, the person's actions).
 */
import {
  canActOnRequest,
  dubaiDate,
  jobActions,
  requestClock,
  type CloseReason,
  type JobAction,
  type JobState,
  type RequestDetail,
  type ServiceFlow,
  type Status,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { decryptField, toBytes } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { consultationOutcome } from '../consultations/store.js';
import { managedNow } from '../managed/store.js';
import { requestFacts } from './store.js';

type Ctx = Context<AppEnv>;

export interface FlowRow {
  id: string;
  status: Status;
  is_emergency: number;
  acknowledged_at: number | null;
  partner_id: string | null;
  owner_user_id: string;
  tenancy_id: string | null;
  raised_by_user_id: string;
  /** The unit, for the managed-unit rules (ADR 0034). */
  sf_unit_id: string;
  close_reason: CloseReason | null;
  next_due_at: number | null;
  next_due_kind: string | null;
  version: number;
  /** How the request's service runs (ADR 0030); the report flow has its own steps (ADR 0032). */
  flow?: ServiceFlow | null;
}

export interface Flow {
  readonly row: FlowRow;
  readonly state: JobState;
}

export function readFlowRow(db: D1Database, id: string): Promise<FlowRow | null> {
  return db
    .prepare(
      `SELECT id, status, is_emergency, acknowledged_at, partner_id, owner_user_id, tenancy_id, raised_by_user_id,
              sf_unit_id, close_reason, next_due_at, next_due_kind, version,
              (SELECT s.flow FROM services s WHERE s.code = requests.service_code) AS flow
       FROM requests WHERE id = ?`,
    )
    .bind(id)
    .first<FlowRow>();
}

/** The request's journey state as the rules see it. */
export async function stateOf(db: D1Database, row: FlowRow, viewer: string): Promise<JobState> {
  const counts = await db
    .prepare(
      `SELECT
         (SELECT count(*) FROM quotes WHERE request_id = ?1 AND status = 'pending') AS pending,
         (SELECT count(*) FROM quotes WHERE request_id = ?1 AND partner_id = ?2) AS sent,
         (SELECT count(*) FROM ratings WHERE request_id = ?1) AS rated,
         (SELECT count(*) FROM make_safe_works WHERE request_id = ?1) AS make_safe,
         (SELECT status FROM visits WHERE request_id = ?1 AND status IN ('booked', 'on_the_way', 'arrived')
           ORDER BY created_at DESC LIMIT 1) AS visit`,
    )
    .bind(row.id, row.partner_id)
    .first<{
      pending: number;
      sent: number;
      rated: number;
      make_safe: number;
      visit: 'booked' | 'on_the_way' | 'arrived' | null;
    }>();
  // ADR 0031: how a consultation ended, for the owner's close and rating steps.
  const outcome = row.flow === 'consultation' ? await consultationOutcome(db, row.id) : null;
  return {
    status: row.status,
    isEmergency: row.is_emergency === 1,
    acknowledged: row.acknowledged_at !== null,
    pendingQuote: (counts?.pending ?? 0) > 0,
    quotesSent: counts?.sent ?? 0,
    hasPartner: row.partner_id !== null,
    rated: (counts?.rated ?? 0) > 0,
    closeReason: row.close_reason,
    visit: counts?.visit ?? 'none',
    makeSafeRecorded: (counts?.make_safe ?? 0) > 0,
    raisedByMe: row.raised_by_user_id === viewer,
    ...(row.flow === undefined || row.flow === null ? {} : { flow: row.flow }),
    ...(row.flow === 'consultation' ? { consultationOutcome: outcome } : {}),
  };
}

/**
 * The request if the signed-in person may act on it AND take `action` now. Not theirs: 404 (unknown and
 * not-yours look alike, C-AZ-2). Theirs but not possible now: 409.
 */
export async function loadForAction(c: Ctx, id: string, action: JobAction): Promise<Flow> {
  const db = c.env.DB;
  const row = await readFlowRow(db, id);
  const actor = c.get('auth');
  if (row === null || !canActOnRequest(actor, await requestFacts(db, row), dubaiDate(c.get('now')))) {
    throw new ApiError(404, 'Not found.');
  }
  const state = await stateOf(db, row, actor.userId);
  if (!jobActions(actor.role, state).includes(action)) {
    throw new ApiError(409, 'This step is not possible for this request now. Refresh and try again.');
  }
  return { row, state };
}

/**
 * The signed-in person's steps on the request page. ADR 0034: on a managed unit the managing team decides a
 * tenant's request (A1), so the owner is not offered approve / decline.
 */
async function viewerActions(c: Ctx, row: FlowRow): Promise<JobAction[]> {
  const { role, userId } = c.get('auth');
  const actions = jobActions(role, await stateOf(c.env.DB, row, userId));
  if (role !== 'owner' || row.status !== 'awaiting_owner') return actions;
  if ((await managedNow(c.env.DB, row.sf_unit_id, c.get('now'))) === null) return actions;
  return actions.filter((a) => a !== 'approve_request' && a !== 'decline_request');
}

interface ExtrasRow {
  window_start: number;
  window_end: number;
  status: 'booked' | 'on_the_way' | 'arrived' | 'done';
  tech_user_id: string | null;
  tech_name_enc: unknown;
}

interface QuoteRow {
  id: string;
  revision: number;
  amount_fils: number;
  scope: string;
  status: 'pending' | 'approved' | 'declined' | 'expired' | 'withdrawn';
  sent_at: number;
  expires_at: number;
}

type Extras = Pick<
  RequestDetail,
  'visit' | 'quote' | 'makeSafe' | 'completionPhotos' | 'rating' | 'actions' | 'clock'
>;

/** Who sees the SLA clock on a request: the partner and JAD+ staff, never residents (S8). */
const CLOCK_ROLES: ReadonlySet<string> = new Set(['partner', 'partner_admin', 'jad_admin', 'jad_viewer']);

/** What the request page shows beyond the summary and messages (the caller has checked the person may see it). */
export async function detailExtras(c: Ctx, id: string, canAct: boolean): Promise<Extras> {
  const db = c.env.DB;
  const row = await readFlowRow(db, id);
  if (row === null) throw new ApiError(404, 'Not found.');
  const [visit, quote, photos, rating, makeSafe, booked] = await Promise.all([
    db
      .prepare(
        `SELECT v.window_start, v.window_end, v.status, t.user_id AS tech_user_id, u.name_enc AS tech_name_enc
         FROM visits v LEFT JOIN technicians t ON t.id = v.technician_id LEFT JOIN users u ON u.id = t.user_id
         WHERE v.request_id = ? AND v.status NOT IN ('cancelled', 'no_access') ORDER BY v.created_at DESC LIMIT 1`,
      )
      .bind(row.id)
      .first<ExtrasRow>(),
    db
      .prepare(
        `SELECT id, revision, amount_fils, scope, status, sent_at, expires_at FROM quotes
         WHERE request_id = ? ORDER BY sent_at DESC, revision DESC LIMIT 1`,
      )
      .bind(row.id)
      .first<QuoteRow>(),
    db
      .prepare(
        "SELECT id FROM attachments WHERE request_id = ? AND purpose = 'completion_photo' ORDER BY uploaded_at",
      )
      .bind(row.id)
      .all<{ id: string }>(),
    db
      .prepare('SELECT stars, comment FROM ratings WHERE request_id = ?')
      .bind(row.id)
      .first<{ stars: number; comment: string | null }>(),
    db
      .prepare('SELECT amount_fils, scope, at FROM make_safe_works WHERE request_id = ?')
      .bind(row.id)
      .first<{ amount_fils: number; scope: string; at: number }>(),
    db
      .prepare("SELECT MIN(at) AS at FROM request_events WHERE request_id = ? AND kind = 'visit_booked'")
      .bind(row.id)
      .first<{ at: number | null }>(),
  ]);
  // E4: the resident sees the technician's name (only the name, never contact details).
  const techUser = visit?.tech_user_id ?? null;
  const nameEnc: unknown = visit?.tech_name_enc ?? null;
  const technician =
    techUser === null || nameEnc === null
      ? null
      : await decryptField(c.get('keys'), toBytes(nameEnc), `users.name:${techUser}`);
  return {
    visit:
      visit === null
        ? null
        : { start: visit.window_start, end: visit.window_end, technician, status: visit.status },
    makeSafe:
      makeSafe === null
        ? null
        : { amountAed: makeSafe.amount_fils / 100, scope: makeSafe.scope, at: makeSafe.at },
    quote:
      quote === null
        ? null
        : {
            id: quote.id,
            revision: quote.revision,
            amountAed: quote.amount_fils / 100,
            scope: quote.scope,
            status: quote.status,
            sentAt: quote.sent_at,
            expiresAt: quote.expires_at,
          },
    completionPhotos: photos.results,
    rating,
    actions: canAct ? await viewerActions(c, row) : [],
    clock: CLOCK_ROLES.has(c.get('auth').role)
      ? requestClock(
          {
            status: row.status,
            isEmergency: row.is_emergency === 1,
            acknowledgedAt: row.acknowledged_at,
            firstVisitBookedAt: booked?.at ?? null,
            nextDueAt: row.next_due_at,
            nextDueKind: row.next_due_kind,
          },
          c.get('now'),
        )
      : null,
  };
}
