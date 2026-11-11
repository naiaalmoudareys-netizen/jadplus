/**
 * The handover checklist for the handover team and JAD+ Admin (O2; ADR 0033). Mounted twice:
 * under /api/partner for the partner office (partner_admin) of the JAD Global team that has the owner's
 * handover request, and under /api/admin for JAD+ Admin (jad_viewer reads only).
 *
 * - GET  /handovers                     checklists in reach, and open handover requests still without one
 * - POST /handovers                     open the checklist for a handover request's unit ({ requestId })
 * - POST /handovers/:id/steps           tick a step or put it back, with an optional note for the owner
 * - PUT  /handovers/:id/appointment     book or move the key collection (working day + time window)
 *
 * The unit always comes from the request, never from the client (C-AZ-2). An office reaches only checklists of
 * requests its company has; reassigning the request moves the checklist with it. Every change is audited in the
 * same batch (C-AUD-1), without the note's text.
 */
import {
  APPOINTMENT_MESSAGES,
  HANDOVER_STEPS,
  OPEN_STATUSES,
  STEP_CHANGE_MESSAGES,
  appointmentRefusal,
  dubaiDate,
  handoverStepBody,
  keyAppointmentBody,
  platformIdParam,
  startHandoverBody,
  stepChange,
  type StaffHandovers,
} from '@jadplus/shared';
import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { loadCalendar } from '../calendar.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { audit } from '../partner/company/common.js';
import { parseJsonBody, parseParams } from '../validate.js';
import {
  encryptNote,
  isChecklistConflict,
  loadChecklists,
  ownerView,
  touchChecklist,
  unitJoin,
  type StaffChecklist,
  type Viewer,
} from './store.js';

type Ctx = Context<AppEnv>;
export type StaffScope = 'admin' | 'office';

const OPEN_SQL = [...OPEN_STATUSES].map((s) => `'${s}'`).join(', ');
const CONFLICT = 'This handover was just changed by someone else. Refresh and try again.';

function viewerOf(c: Ctx, scope: StaffScope): Viewer {
  if (scope === 'admin') return { kind: 'admin' };
  const partnerId = c.get('auth').partnerId;
  if (partnerId === null) throw new ApiError(403, 'Not allowed.');
  return { kind: 'office', partnerId };
}

/** The checklist in this viewer's reach, or 404 (never "exists but not yours"). */
async function reachable(c: Ctx, scope: StaffScope, id: string): Promise<StaffChecklist> {
  const [found] = await loadChecklists(c.env.DB, c.get('keys'), viewerOf(c, scope), id);
  if (found === undefined) throw new ApiError(404, 'Not found.');
  return found;
}

async function saveWithGuard(c: Ctx, statements: D1PreparedStatement[]): Promise<void> {
  try {
    await c.env.DB.batch(statements);
  } catch (err) {
    if (isChecklistConflict(err)) throw new ApiError(409, CONFLICT);
    throw err;
  }
}

export function handoverStaffRoutes(scope: StaffScope): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  // Per route, not r.use('*'): these sub-apps are mounted at /api/partner and /api/admin beside other routes.
  const read: MiddlewareHandler<AppEnv> =
    scope === 'admin' ? requireRole('jad_admin', 'jad_viewer') : requireRole('partner_admin');
  const change: MiddlewareHandler<AppEnv> =
    scope === 'admin' ? requireRole('jad_admin') : requireRole('partner_admin');

  r.get('/handovers', read, async (c) => {
    const viewer = viewerOf(c, scope);
    const partner = viewer.kind === 'office' ? viewer.partnerId : null;
    const [lists, waiting] = await Promise.all([
      loadChecklists(c.env.DB, c.get('keys'), viewer),
      c.env.DB.prepare(
        `SELECT r.id, r.ref, r.created_at, p.name AS partner_name, ou.unit_name, ou.project, ou.building
         FROM requests r
         LEFT JOIN partners p ON p.id = r.partner_id
         ${unitJoin('r.sf_unit_id')}
         WHERE r.service_code = 'handover' AND r.status IN (${OPEN_SQL})
           AND (? IS NULL OR r.partner_id = ?)
           AND NOT EXISTS (SELECT 1 FROM handover_checklists hc WHERE hc.request_id = r.id OR hc.sf_unit_id = r.sf_unit_id)
         ORDER BY r.created_at LIMIT 200`,
      )
        .bind(partner, partner)
        .all<{
          id: string;
          ref: string;
          created_at: number;
          partner_name: string | null;
          unit_name: string | null;
          project: string | null;
          building: string | null;
        }>(),
    ]);
    return c.json({
      handovers: lists.map((l) => ({ ...ownerView(l), partnerName: l.partnerName })),
      waiting: waiting.results.map((w) => ({
        requestId: w.id,
        requestRef: w.ref,
        unitName: w.unit_name,
        project: w.project,
        building: w.building,
        createdAt: w.created_at,
        partnerName: w.partner_name,
      })),
    } satisfies StaffHandovers);
  });

  r.post('/handovers', change, async (c) => {
    const { requestId } = await parseJsonBody(c, startHandoverBody);
    const db = c.env.DB;
    const now = c.get('now');
    const viewer = viewerOf(c, scope);
    const request = await db
      .prepare('SELECT id, service_code, sf_unit_id, status, partner_id FROM requests WHERE id = ?')
      .bind(requestId)
      .first<{
        id: string;
        service_code: string;
        sf_unit_id: string;
        status: string;
        partner_id: string | null;
      }>();
    if (request === null || (viewer.kind === 'office' && request.partner_id !== viewer.partnerId)) {
      throw new ApiError(404, 'Not found.');
    }
    if (request.service_code !== 'handover') throw new ApiError(422, 'This is not a handover request.');
    if (!(OPEN_STATUSES as ReadonlySet<string>).has(request.status)) {
      throw new ApiError(409, 'This request is closed.');
    }
    const existing = await db
      .prepare('SELECT id FROM handover_checklists WHERE request_id = ? OR sf_unit_id = ?')
      .bind(request.id, request.sf_unit_id)
      .first<{ id: string }>();
    if (existing !== null) throw new ApiError(409, 'This unit already has a handover checklist.');
    const id = newId();
    const userId = c.get('auth').userId;
    await db.batch([
      db
        .prepare(
          `INSERT INTO handover_checklists (id, request_id, sf_unit_id, started_at, started_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, request.id, request.sf_unit_id, now, userId, now),
      ...HANDOVER_STEPS.map((step) =>
        db
          .prepare('INSERT INTO handover_steps (checklist_id, step, updated_at) VALUES (?, ?, ?)')
          .bind(id, step, now),
      ),
      audit(c, 'handover_started', 'handover', id, { requestId: request.id }),
    ]);
    return c.json({ id }, 201);
  });

  r.post('/handovers/:id/steps', change, async (c) => {
    const { id } = parseParams(c, platformIdParam);
    const body = await parseJsonBody(c, handoverStepBody);
    const db = c.env.DB;
    const now = c.get('now');
    const list = await reachable(c, scope, id);
    const refusal = stepChange(list, body.step, body.done);
    if (refusal !== null) throw new ApiError(409, STEP_CHANGE_MESSAGES[refusal]);
    const completedAt = body.done && body.step === 'keys_collected' ? now : null;
    const note = body.note === null ? null : await encryptNote(c.get('keys'), id, body.step, body.note);
    await saveWithGuard(c, [
      touchChecklist(db, id, list.updatedAt, now, completedAt),
      db
        .prepare(
          `UPDATE handover_steps SET done_at = ?, done_by = ?, note_enc = ?, updated_at = ?
           WHERE checklist_id = ? AND step = ?`,
        )
        .bind(body.done ? now : null, body.done ? c.get('auth').userId : null, note, now, id, body.step),
      // The note may name people or numbers: only whether there is one is recorded.
      audit(c, 'handover_step_changed', 'handover', id, {
        step: body.step,
        done: body.done,
        note: body.note !== null,
      }),
    ]);
    return c.json({ id, completedAt });
  });

  r.put('/handovers/:id/appointment', change, async (c) => {
    const { id } = parseParams(c, platformIdParam);
    const body = await parseJsonBody(c, keyAppointmentBody);
    const db = c.env.DB;
    const now = c.get('now');
    const list = await reachable(c, scope, id);
    const refusal = appointmentRefusal(list, body.date, dubaiDate(now), await loadCalendar(db));
    if (refusal !== null) throw new ApiError(422, APPOINTMENT_MESSAGES[refusal]);
    const userId = c.get('auth').userId;
    await saveWithGuard(c, [
      touchChecklist(db, id, list.updatedAt, now, null),
      db
        .prepare('UPDATE handover_checklists SET key_date = ?, key_slot = ? WHERE id = ?')
        .bind(body.date, body.slot, id),
      // Booking the appointment is what completes the "Key collection appointment" step (it stays done if moved).
      db
        .prepare(
          `UPDATE handover_steps SET done_at = coalesce(done_at, ?), done_by = coalesce(done_by, ?), updated_at = ?
           WHERE checklist_id = ? AND step = 'key_appointment'`,
        )
        .bind(now, userId, now, id),
      audit(c, 'handover_appointment_set', 'handover', id, {
        date: body.date,
        slot: body.slot,
        moved: list.appointment !== null,
      }),
    ]);
    return c.json({ id, completedAt: null });
  });

  return r;
}
