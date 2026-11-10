/**
 * JAD+ Admin console data (ADR 0023; R4, E4-E7, A1, A3, A7, S6, S7). Reading: jad_admin and jad_viewer;
 * changing: jad_admin only, audited (C-AUD-1).
 *
 * - GET  /api/admin/attention           everything late or waiting for JAD+, most urgent first
 * - GET  /api/admin/requests?q=&status= search by reference, unit or partner (the request page itself is
 *                                       GET /api/requests/:id, which JAD+ staff may read)
 * - GET  /api/admin/partners            partners with status, documents, team size and open jobs
 * - POST /api/admin/partners/:id/status suspend or reinstate a partner, with the reason
 */
import {
  EMERGENCY_TYPE_LABELS,
  OPEN_STATUSES,
  OWNER_CALL_AFTER,
  QUOTE_STUCK_AFTER,
  adminRequestsQuery,
  attentionOrder,
  partnerStatusBody,
  type AdminAttention,
  type AttentionKind,
  type EmergencyType,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { LOCATION_JOIN } from '../requests/views.js';
import { parseJsonBody, parseParams, parseQuery } from '../validate.js';

type Item = AdminAttention['items'][number];

interface Row {
  id: string;
  ref: string;
  is_emergency: number;
  emergency_type: EmergencyType | null;
  service_name: string | null;
  unit_name: string | null;
  partner_name: string | null;
  since: number;
}

const BASE = `SELECT r.id, r.ref, r.is_emergency, r.emergency_type, ou.unit_name, p.name AS partner_name,
  (SELECT name FROM services WHERE code = r.service_code) AS service_name`;
const FROM = `FROM requests r LEFT JOIN partners p ON p.id = r.partner_id ${LOCATION_JOIN}`;

function what(r: {
  is_emergency: number;
  emergency_type: EmergencyType | null;
  service_name: string | null;
}) {
  return r.is_emergency === 1 && r.emergency_type !== null
    ? `${EMERGENCY_TYPE_LABELS[r.emergency_type]} (emergency)`
    : (r.service_name ?? 'Request');
}

const toItem =
  (kind: AttentionKind) =>
  (r: Row): Item => ({
    kind,
    requestId: r.id,
    deskId: null,
    ref: r.ref,
    what: what(r),
    unit: r.unit_name,
    partnerName: r.partner_name,
    since: r.since,
  });

const partnerParam = z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

export function adminConsoleRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/attention', requireRole('jad_admin', 'jad_viewer'), async (c) => {
    const db = c.env.DB;
    const now = c.get('now');
    const open = [...OPEN_STATUSES].filter((s) => s !== 'awaiting_owner' && s !== 'quote_sent');
    const marks = open.map(() => '?').join(', ');
    const [emergencies, overdue, rebook, approvals, stuck, desk] = await Promise.all([
      db
        .prepare(
          `${BASE}, r.created_at AS since ${FROM}
           WHERE r.is_emergency = 1 AND r.acknowledged_at IS NULL AND r.status IN ('submitted', 'assigned')`,
        )
        .all<Row>(),
      db
        .prepare(
          `${BASE}, r.next_due_at AS since ${FROM}
           WHERE r.status IN (${marks}) AND r.next_due_at < ? AND r.next_due_kind <> 'rebook_after_no_access'
             AND NOT (r.is_emergency = 1 AND r.acknowledged_at IS NULL)`,
        )
        .bind(...open, now)
        .all<Row>(),
      db
        .prepare(
          `${BASE}, r.next_due_at AS since ${FROM}
           WHERE r.status = 'scheduled' AND r.next_due_kind = 'rebook_after_no_access' AND r.next_due_at < ?`,
        )
        .bind(now)
        .all<Row>(),
      db
        .prepare(
          `${BASE}, r.created_at + ? AS since ${FROM} WHERE r.status = 'awaiting_owner' AND r.created_at + ? <= ?`,
        )
        .bind(OWNER_CALL_AFTER, OWNER_CALL_AFTER, now)
        .all<Row>(),
      db
        .prepare(
          `${BASE}, q.decided_at + ? AS since ${FROM}
           JOIN quotes q ON q.request_id = r.id AND q.status = 'declined' AND q.revision = 1
           WHERE r.status = 'assigned' AND q.decided_at + ? <= ?
             AND NOT EXISTS (SELECT 1 FROM quotes n WHERE n.request_id = r.id AND n.revision = 2)`,
        )
        .bind(QUOTE_STUCK_AFTER, QUOTE_STUCK_AFTER, now)
        .all<Row>(),
      db
        .prepare(
          "SELECT id, type, created_at FROM desk_requests WHERE status IN ('New', 'In progress') ORDER BY created_at",
        )
        .all<{ id: string; type: string; created_at: number }>(),
    ]);
    const items: Item[] = [
      ...emergencies.results.map(toItem('emergency_unacknowledged')),
      ...overdue.results.map(toItem('overdue')),
      ...rebook.results.map(toItem('no_access_rebook')),
      ...approvals.results.map(toItem('owner_approval_call')),
      ...stuck.results.map(toItem('quote_stuck')),
      ...desk.results.map((d) => ({
        kind: 'desk_request' as const,
        requestId: null,
        deskId: d.id,
        ref: null,
        what: d.type,
        unit: null,
        partnerName: null,
        since: d.created_at,
      })),
    ];
    return c.json({ items: items.sort(attentionOrder) });
  });

  r.get('/requests', requireRole('jad_admin', 'jad_viewer'), async (c) => {
    const { q, status } = parseQuery(c, adminRequestsQuery);
    const like = q === undefined || q === '' ? null : `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const { results } = await c.env.DB.prepare(
      `${BASE}, r.status, r.next_due_at, r.created_at AS since, ou.project ${FROM}
       WHERE (?1 IS NULL OR r.status = ?1)
         AND (?2 IS NULL OR r.ref LIKE ?2 ESCAPE '\\' OR ou.unit_name LIKE ?2 ESCAPE '\\' OR p.name LIKE ?2 ESCAPE '\\')
       ORDER BY r.created_at DESC LIMIT 100`,
    )
      .bind(status ?? null, like)
      .all<Row & { status: string; next_due_at: number | null; project: string | null }>();
    return c.json({
      requests: results.map((row) => ({
        id: row.id,
        ref: row.ref,
        status: row.status,
        emergency: row.is_emergency === 1,
        what: what(row),
        unit: row.unit_name,
        project: row.project,
        partnerName: row.partner_name,
        nextDueAt: row.next_due_at,
        createdAt: row.since,
      })),
    });
  });

  r.get('/partners', requireRole('jad_admin', 'jad_viewer'), async (c) => {
    const db = c.env.DB;
    const open = [...OPEN_STATUSES];
    const { results } = await db
      .prepare(
        `SELECT p.id, p.name, p.status, p.status_reason,
           (SELECT count(*) FROM technicians t WHERE t.partner_id = p.id AND t.status = 'active') AS technicians,
           (SELECT count(*) FROM requests r WHERE r.partner_id = p.id AND r.status IN (${open.map(() => '?').join(', ')}))
             AS open_jobs
         FROM partners p ORDER BY p.name`,
      )
      .bind(...open)
      .all<{
        id: string;
        name: string;
        status: 'active' | 'suspended' | 'ended';
        status_reason: string | null;
        technicians: number;
        open_jobs: number;
      }>();
    const docs = await db
      .prepare(
        'SELECT partner_id, kind, MAX(expires_on) AS expires_on FROM partner_documents GROUP BY partner_id, kind',
      )
      .all<{ partner_id: string; kind: string; expires_on: string | null }>();
    return c.json({
      partners: results.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        statusReason: p.status_reason,
        technicians: p.technicians,
        openJobs: p.open_jobs,
        documents: docs.results
          .filter((d) => d.partner_id === p.id)
          .map((d) => ({ kind: d.kind, expiresOn: d.expires_on })),
      })),
    });
  });

  r.post('/partners/:id/status', requireRole('jad_admin'), async (c) => {
    const { id } = parseParams(c, partnerParam);
    const body = await parseJsonBody(c, partnerStatusBody);
    const db = c.env.DB;
    const now = c.get('now');
    const actor = c.get('auth');
    const partner = await db
      .prepare('SELECT status FROM partners WHERE id = ?')
      .bind(id)
      .first<{ status: string }>();
    if (partner === null) throw new ApiError(404, 'Not found.');
    if (partner.status === 'ended') throw new ApiError(409, 'This partner’s contract has ended.');
    await db.batch([
      db
        .prepare('UPDATE partners SET status = ?, status_reason = ?, updated_at = ? WHERE id = ?')
        .bind(body.status, body.status === 'active' ? null : body.reason, now, id),
      auditStatement(db, {
        at: now,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: body.status === 'active' ? 'partner_reinstated' : 'partner_suspended',
        targetType: 'partner',
        targetId: id,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
        detail: { manual: true },
      }),
    ]);
    return c.json({ id, status: body.status });
  });

  return r;
}
