/**
 * The JAD+ desk queue (ADR 0011, 0025). In production the desk works its requests in Salesforce; until Salesforce
 * is connected (local, preview) JAD+ Admin works them here and the reply is shown to the owner in the app.
 *
 * - GET  /desk-requests?status=  the queue, oldest first, without personal data (jad_admin, jad_viewer)
 * - GET  /desk-requests/:id      who asked and what they wrote; viewing is audited (jad_admin, jad_viewer)
 * - POST /desk-requests/:id      { status: 'In progress' | 'Completed' | 'Cancelled', reply? } (jad_admin)
 */
import {
  adminDeskQuery,
  adminDeskUpdateBody,
  deskChangeAllowed,
  type DeskRequestType,
  type DeskStatus,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { encryptField } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { parseJsonBody, parseParams, parseQuery } from '../../validate.js';
import { NOT_FOUND, READ, decrypted, idParam, personFields, staffAudit, type Ctx } from './common.js';

interface DeskRow {
  id: string;
  user_id: string;
  type: DeskRequestType;
  deal_id: string | null;
  status: DeskStatus;
  has_details: number;
  replied: number;
  sf_request_id: string | null;
  created_at: number;
  updated_at: number | null;
  unit_name: string | null;
}

const COLUMNS = `d.id, d.user_id, d.type, d.deal_id, d.status, d.details_enc IS NOT NULL AS has_details,
  d.reply_enc IS NOT NULL AS replied, d.sf_request_id, d.created_at, d.updated_at,
  (SELECT ou.unit_name FROM owner_units ou WHERE ou.sf_deal_id = d.deal_id LIMIT 1) AS unit_name`;

const toView = (d: DeskRow) => ({
  id: d.id,
  type: d.type,
  status: d.status,
  dealId: d.deal_id,
  unitName: d.unit_name,
  userId: d.user_id,
  hasDetails: d.has_details === 1,
  replied: d.replied === 1,
  inSalesforce: d.sf_request_id !== null,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
});

async function queue(c: Ctx) {
  const { status } = parseQuery(c, adminDeskQuery);
  const { results } = await c.env.DB.prepare(
    `SELECT ${COLUMNS} FROM desk_requests d WHERE (?1 IS NULL OR d.status = ?1) ORDER BY d.created_at LIMIT 200`,
  )
    .bind(status ?? null)
    .all<DeskRow>();
  return c.json({ requests: results.map(toView) });
}

async function load(c: Ctx, id: string) {
  const row = await c.env.DB.prepare(
    `SELECT ${COLUMNS}, d.details_enc, d.reply_enc, u.name_enc, u.email_enc, u.phone_enc
     FROM desk_requests d JOIN users u ON u.id = d.user_id WHERE d.id = ?`,
  )
    .bind(id)
    .first<
      DeskRow & {
        details_enc: unknown;
        reply_enc: unknown;
        name_enc: unknown;
        email_enc: unknown;
        phone_enc: unknown;
      }
    >();
  if (row === null) throw new ApiError(404, NOT_FOUND);
  return row;
}

async function detail(c: Ctx) {
  const { id } = parseParams(c, idParam);
  const d = await load(c, id);
  const owner = await personFields(c, { ...d, id: d.user_id });
  await c.env.DB.batch([staffAudit(c, 'desk_request_viewed', { type: 'desk_request', id })]);
  return c.json({
    ...toView(d),
    ownerName: owner.name,
    ownerEmail: owner.email,
    ownerPhone: owner.phone,
    details: await decrypted(c, d.details_enc, `desk_requests.details:${id}`),
    reply: await decrypted(c, d.reply_enc, `desk_requests.reply:${id}`),
  });
}

async function update(c: Ctx) {
  const { id } = parseParams(c, idParam);
  const body = await parseJsonBody(c, adminDeskUpdateBody);
  const d = await load(c, id);
  if (d.sf_request_id !== null) {
    throw new ApiError(409, 'This request is handled in Salesforce. Update it there.');
  }
  if (!deskChangeAllowed(d.status, body.status)) {
    throw new ApiError(409, 'This request is already closed.');
  }
  const now = c.get('now');
  const reply =
    body.reply === undefined
      ? null
      : await encryptField(c.get('keys'), body.reply, `desk_requests.reply:${id}`);
  await c.env.DB.batch([
    // The status the reader saw must still be there (two staff members at once: the second one is refused).
    c.env.DB.prepare(
      `UPDATE desk_requests SET status = ?, reply_enc = COALESCE(?, reply_enc), handled_by = ?, updated_at = ?
       WHERE id = ? AND status = ?`,
    ).bind(body.status, reply, c.get('auth').userId, now, id, d.status),
    staffAudit(
      c,
      'desk_request_updated',
      { type: 'desk_request', id },
      { from: d.status, to: body.status, replied: reply !== null },
    ),
  ]);
  return c.json({ id, status: body.status });
}

export function deskQueueRoutes(r: Hono<AppEnv>): void {
  r.get('/desk-requests', requireRole(...READ), queue);
  r.get('/desk-requests/:id', requireRole(...READ), detail);
  r.post('/desk-requests/:id', requireRole('jad_admin'), update);
}
