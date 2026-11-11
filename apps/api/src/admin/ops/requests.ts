/**
 * JAD+ Admin on one request (ADR 0025; A1, E6, E13, S6, C-AUD-1). Reading: jad_admin and jad_viewer; changing:
 * jad_admin only, within lifecycle.ts, version-guarded, with history, audit and the reason as a staff note.
 *
 * - GET  /requests/:id/timeline    what happened, in order (roles and partner names, no people)
 * - GET  /requests/:id/notes       staff-only notes (encrypted at rest)
 * - POST /requests/:id/notes       { text, ownerCalled } (A1: "owner called")
 * - POST /requests/:id/reassign    { partnerId, reason } to another active partner (E6, S6)
 * - POST /requests/:id/reclassify  { reason } emergency -> routine (E13)
 * - POST /requests/:id/cancel      { reason } cancelled by JAD+
 * The owner and the person who raised the request are told in the app when JAD+ moves, reclassifies or cancels
 * it (ADR 0027); the reason stays a staff note.
 */
import {
  OPEN_STATUSES,
  STATUSES,
  adminNoteBody,
  adminReasonBody,
  adminReassignBody,
  reassignedDue,
  reclassifiedDue,
  type Status,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { z } from 'zod';
import { requireRole } from '../../auth/middleware.js';
import { newId } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { withConflictCheck } from '../../requests/concurrency.js';
import { inboxStatements, partnerInboxStatement } from '../../requests/inbox.js';
import { eventStatement, notificationStatement } from '../../requests/store.js';
import { loadCalendar } from '../../calendar.js';
import { changeStatements } from '../../requests/transition.js';
import { parseJsonBody, parseParams } from '../../validate.js';
import {
  READ,
  callOffStatements,
  decrypted,
  idParam,
  parseDetail,
  noteStatement,
  requestForAction,
  requireRequest,
  staffAudit,
  type Ctx,
  type NoteKind,
} from './common.js';

const statusSchema = z.enum(STATUSES).nullable().catch(null);
const statusOrNull = (s: string | null): Status | null => statusSchema.parse(s);
const NOT_FOUND_PARTNER = 'Partner not found.';

async function timeline(c: Ctx) {
  const { id } = parseParams(c, idParam);
  await requireRequest(c, id);
  const { results } = await c.env.DB.prepare(
    `SELECT e.at, e.kind, e.actor_role, e.from_status, e.to_status, e.data, p.name AS partner_name
     FROM request_events e LEFT JOIN partners p ON p.id = e.partner_id
     WHERE e.request_id = ? ORDER BY e.at, e.rowid`,
  )
    .bind(id)
    .all<{
      at: number;
      kind: string;
      actor_role: string;
      from_status: string | null;
      to_status: string | null;
      data: string | null;
      partner_name: string | null;
    }>();
  return c.json({
    events: results.map((e) => ({
      at: e.at,
      kind: e.kind,
      actorRole: e.actor_role,
      fromStatus: statusOrNull(e.from_status),
      toStatus: statusOrNull(e.to_status),
      partnerName: e.partner_name,
      data: parseDetail(e.data),
    })),
  });
}

async function notes(c: Ctx) {
  const { id } = parseParams(c, idParam);
  await requireRequest(c, id);
  const { results } = await c.env.DB.prepare(
    `SELECT n.id, n.kind, n.body_enc, n.at, n.author_user_id, u.name_enc
     FROM request_notes n JOIN users u ON u.id = n.author_user_id
     WHERE n.request_id = ? ORDER BY n.at, n.rowid`,
  )
    .bind(id)
    .all<{
      id: string;
      kind: NoteKind;
      body_enc: unknown;
      at: number;
      author_user_id: string;
      name_enc: unknown;
    }>();
  return c.json({
    notes: await Promise.all(
      results.map(async (n) => ({
        id: n.id,
        kind: n.kind,
        text: (await decrypted(c, n.body_enc, `request_notes.body:${n.id}`)) ?? '',
        authorName: await decrypted(c, n.name_enc, `users.name:${n.author_user_id}`),
        at: n.at,
      })),
    ),
  });
}

async function addNote(c: Ctx) {
  const { id } = parseParams(c, idParam);
  const body = await parseJsonBody(c, adminNoteBody);
  await requireRequest(c, id);
  const note = await noteStatement(c, id, body.ownerCalled ? 'owner_called' : 'note', body.text);
  await c.env.DB.batch([
    note.statement,
    staffAudit(c, 'request_note_added', { type: 'request', id }, { ownerCalled: body.ownerCalled }),
  ]);
  return c.json({ id: note.id }, 201);
}

async function reassign(c: Ctx) {
  const { id } = parseParams(c, idParam);
  const body = await parseJsonBody(c, adminReassignBody);
  const row = await requestForAction(c, id, 'assigned');
  const db = c.env.DB;
  const now = c.get('now');
  const partner = await db
    .prepare('SELECT id, status FROM partners WHERE id = ?')
    .bind(body.partnerId)
    .first<{ id: string; status: string }>();
  if (partner === null) throw new ApiError(404, NOT_FOUND_PARTNER);
  if (partner.status !== 'active') throw new ApiError(409, 'This partner is not active.');
  if (partner.id === row.partner_id) throw new ApiError(409, 'The job is already with this partner.');
  const emergency = row.is_emergency === 1;
  const note = await noteStatement(c, id, 'reassigned', body.reason);
  const cal = await loadCalendar(db);
  await withConflictCheck(() =>
    db.batch([
      // Told before the job moves, so the old partner's assigned technician is the one told (E6).
      ...(row.partner_id === null
        ? []
        : [partnerInboxStatement(db, { requestId: id, partnerId: row.partner_id }, 'job_moved_away', now)]),
      ...changeStatements(c, row, {
        to: 'assigned',
        nextDue: reassignedDue(emergency, now, cal),
        audit: 'request_reassigned_by_jad',
        detail: { from: row.partner_id, to: partner.id, emergency },
      }),
      // The new partner starts afresh: no technician, no acknowledgement. A moved emergency counts as moved to
      // the backup, so the escalation sweep goes on to on-call if the new partner does not acknowledge (E7).
      db
        .prepare(
          `UPDATE requests SET partner_id = ?, technician_id = NULL, acknowledged_at = NULL,
             arrival_window_start = NULL, arrival_window_end = NULL,
             escalation = CASE WHEN is_emergency = 1 AND escalation <> 'on_call' THEN 'moved_to_backup'
                               ELSE escalation END
           WHERE id = ?`,
        )
        .bind(partner.id, id),
      ...callOffStatements(c, id),
      eventStatement(db, {
        requestId: id,
        at: now,
        actorUserId: c.get('auth').userId,
        actorRole: c.get('auth').role,
        kind: 'assigned',
        partnerId: partner.id,
      }),
      partnerInboxStatement(db, { requestId: id, partnerId: partner.id }, 'job_new', now, {
        ...(emergency ? { urgent: true } : {}),
      }),
      ...(emergency
        ? [
            notificationStatement(db, {
              requestId: id,
              at: now,
              to: { kind: 'partner', partnerId: partner.id },
              template: 'emergency_new_job',
              urgent: true,
            }),
          ]
        : []),
      ...inboxStatements(db, row, 'request_moved_by_jad', now),
      note.statement,
    ]),
  );
  return c.json({ id, status: 'assigned', partnerId: partner.id, emergency });
}

async function reclassify(c: Ctx) {
  const { id } = parseParams(c, idParam);
  const body = await parseJsonBody(c, adminReasonBody);
  const row = await requestForAction(c, id, null);
  if (row.is_emergency !== 1 || !OPEN_STATUSES.has(row.status)) {
    throw new ApiError(409, 'Only an open emergency can be reclassified as routine.');
  }
  const db = c.env.DB;
  const now = c.get('now');
  const current =
    row.next_due_at === null || row.next_due_kind === null
      ? null
      : { at: row.next_due_at, kind: row.next_due_kind };
  const note = await noteStatement(c, id, 'reclassified', body.reason);
  const cal = await loadCalendar(db);
  await withConflictCheck(() =>
    db.batch([
      ...changeStatements(c, row, {
        to: row.status,
        nextDue: reclassifiedDue(row.status, current, now, cal),
        audit: 'request_reclassified',
        detail: { from: row.emergency_type },
      }),
      db
        .prepare(
          "UPDATE requests SET is_emergency = 0, emergency_type = NULL, escalation = 'none' WHERE id = ?",
        )
        .bind(id),
      // request_events allows 'reclassified' (0005); store.ts's eventStatement does not list it yet.
      db
        .prepare(
          `INSERT INTO request_events (id, request_id, at, actor_user_id, actor_role, kind, data)
           VALUES (?, ?, ?, ?, ?, 'reclassified', ?)`,
        )
        .bind(
          newId(),
          id,
          now,
          c.get('auth').userId,
          c.get('auth').role,
          JSON.stringify({ from: row.emergency_type, to: 'routine' }),
        ),
      ...inboxStatements(db, row, 'request_reclassified', now),
      note.statement,
    ]),
  );
  return c.json({ id, status: row.status, partnerId: row.partner_id, emergency: false });
}

async function cancel(c: Ctx) {
  const { id } = parseParams(c, idParam);
  const body = await parseJsonBody(c, adminReasonBody);
  const row = await requestForAction(c, id, 'cancelled');
  const db = c.env.DB;
  const now = c.get('now');
  const note = await noteStatement(c, id, 'cancelled', body.reason);
  await withConflictCheck(() =>
    db.batch([
      ...changeStatements(c, row, {
        to: 'cancelled',
        closeReason: 'cancelled_by_jad',
        nextDue: null,
        audit: 'request_cancelled_by_jad',
      }),
      ...callOffStatements(c, id),
      ...(row.partner_id === null
        ? []
        : [partnerInboxStatement(db, { requestId: id, partnerId: row.partner_id }, 'job_cancelled', now)]),
      ...inboxStatements(db, row, 'request_cancelled_by_jad', now),
      note.statement,
    ]),
  );
  return c.json({ id, status: 'cancelled', partnerId: row.partner_id, emergency: row.is_emergency === 1 });
}

export function requestActionRoutes(r: Hono<AppEnv>): void {
  r.get('/requests/:id/timeline', requireRole(...READ), timeline);
  r.get('/requests/:id/notes', requireRole(...READ), notes);
  r.post('/requests/:id/notes', requireRole('jad_admin'), addNote);
  r.post('/requests/:id/reassign', requireRole('jad_admin'), reassign);
  r.post('/requests/:id/reclassify', requireRole('jad_admin'), reclassify);
  r.post('/requests/:id/cancel', requireRole('jad_admin'), cancel);
}
