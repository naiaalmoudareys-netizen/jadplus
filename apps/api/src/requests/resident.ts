/**
 * Owner and tenant views (R1, R2, U6) and messages on a request (ADR 0009, "all contact must be done on JAD+").
 *
 * - GET  /api/me/places            where the person can raise an emergency (owner: their units; tenant: their
 *                                  current tenancy)
 * - GET  /api/requests             their requests, newest first
 * - GET  /api/requests/:id         one request with its messages (anyone allowed to see it, C-AZ-2)
 * - POST /api/requests/:id/messages  a message; contact details are removed before saving
 */
import {
  OPEN_STATUSES,
  canActOnRequest,
  canViewRequest,
  dubaiDate,
  maskContactDetails,
  messageAuthorLabel,
  postMessageBody,
  requestIdParam,
  type RequestMessage,
  type UserRole,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { detailExtras } from './flow.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseJsonBody, parseParams } from '../validate.js';
import { requestFacts } from './store.js';
import {
  LOCATION_COLUMNS,
  LOCATION_JOIN,
  SUMMARY_COLUMNS,
  toLocation,
  toSummary,
  type LocationRow,
  type SummaryRow,
} from './views.js';

type Ctx = Context<AppEnv>;

/** Stored message bodies may grow a little when contact details are replaced by the notice. */
const STORED_BODY_MAX = 1200;

const NOT_FOUND = 'Not found.';

export interface DetailRow extends SummaryRow {
  description: string;
  owner_user_id: string;
  tenancy_id: string | null;
  partner_id: string | null;
}

/** The request if the signed-in person may see it; otherwise "not found" (unknown and not-yours look alike). */
export async function visibleRequest(c: Ctx, id: string): Promise<DetailRow> {
  const db = c.env.DB;
  const row = await db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}, r.description, r.owner_user_id, r.tenancy_id, r.partner_id
       FROM requests r LEFT JOIN partners p ON p.id = r.partner_id ${LOCATION_JOIN} WHERE r.id = ?`,
    )
    .bind(id)
    .first<DetailRow>();
  if (row === null || !canViewRequest(c.get('auth'), await requestFacts(db, row), dubaiDate(c.get('now')))) {
    throw new ApiError(404, NOT_FOUND);
  }
  return row;
}

/** Whether the person may act on this request at all (which action is jobflow.ts). */
async function canActNow(c: Ctx, row: DetailRow): Promise<boolean> {
  return canActOnRequest(c.get('auth'), await requestFacts(c.env.DB, row), dubaiDate(c.get('now')));
}

export async function canMessage(c: Ctx, row: DetailRow): Promise<boolean> {
  return (
    OPEN_STATUSES.has(row.status) &&
    canActOnRequest(c.get('auth'), await requestFacts(c.env.DB, row), dubaiDate(c.get('now')))
  );
}

interface MessageRow {
  id: string;
  author_user_id: string;
  author_role: UserRole;
  partner_name: string | null;
  body: string;
  at: number;
}

function toMessage(m: MessageRow, viewer: string): RequestMessage {
  return {
    id: m.id,
    author: messageAuthorLabel(m.author_role, m.partner_name),
    mine: m.author_user_id === viewer,
    body: m.body,
    at: m.at,
  };
}

export function residentRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/me/places', requireRole('owner', 'tenant'), async (c) => {
    const { userId, role } = c.get('auth');
    const db = c.env.DB;
    const today = dubaiDate(c.get('now'));
    if (role === 'owner') {
      const { results } = await db
        .prepare(
          `SELECT ou.sf_unit_id, ${LOCATION_COLUMNS} FROM owner_units ou
           WHERE ou.user_id = ? ORDER BY ou.project, ou.unit_name`,
        )
        .bind(userId)
        .all<LocationRow & { sf_unit_id: string }>();
      return c.json({
        places: results.map((u) => ({ sfUnitId: u.sf_unit_id, tenancyId: null, location: toLocation(u) })),
      });
    }
    const { results } = await db
      .prepare(
        `SELECT t.id AS tenancy_id, ${LOCATION_COLUMNS} FROM tenancies t
         LEFT JOIN owner_units ou ON ou.rowid =
           (SELECT x.rowid FROM owner_units x WHERE x.sf_unit_id = t.sf_unit_id ORDER BY x.synced_at DESC LIMIT 1)
         WHERE t.tenant_user_id = ? AND t.status = 'active' AND t.starts_on <= ? AND t.ends_on >= ?`,
      )
      .bind(userId, today, today)
      .all<LocationRow & { tenancy_id: string }>();
    return c.json({
      places: results.map((t) => ({
        sfUnitId: null,
        tenancyId: t.tenancy_id,
        location: toLocation(t) ?? { unitName: 'Your home', project: null, building: null, address: null },
      })),
    });
  });

  r.get('/requests', requireRole('owner', 'tenant'), async (c) => {
    const { userId, role } = c.get('auth');
    const today = dubaiDate(c.get('now'));
    const mine =
      role === 'owner'
        ? { where: 'r.owner_user_id = ?', binds: [userId] }
        : {
            where: `r.tenancy_id IN (SELECT id FROM tenancies WHERE tenant_user_id = ? AND status = 'active'
                      AND starts_on <= ? AND ends_on >= ?)`,
            binds: [userId, today, today],
          };
    const { results } = await c.env.DB.prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM requests r LEFT JOIN partners p ON p.id = r.partner_id ${LOCATION_JOIN}
       WHERE ${mine.where} ORDER BY r.created_at DESC LIMIT 100`,
    )
      .bind(...mine.binds)
      .all<SummaryRow>();
    return c.json({ requests: results.map(toSummary) });
  });

  r.get(
    '/requests/:id',
    requireRole('owner', 'tenant', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer'),
    async (c) => {
      const { id } = parseParams(c, requestIdParam);
      const row = await visibleRequest(c, id);
      const { results } = await c.env.DB.prepare(
        `SELECT m.id, m.author_user_id, m.author_role, p.name AS partner_name, m.body, m.at
         FROM request_messages m LEFT JOIN partners p ON p.id = m.author_partner_id
         WHERE m.request_id = ? ORDER BY m.at, m.rowid`,
      )
        .bind(id)
        .all<MessageRow>();
      const viewer = c.get('auth').userId;
      const photos = await c.env.DB.prepare(
        "SELECT id FROM attachments WHERE request_id = ? AND purpose = 'request_photo' ORDER BY uploaded_at",
      )
        .bind(id)
        .all<{ id: string }>();
      return c.json({
        request: { ...toSummary(row), description: row.description },
        photos: photos.results,
        messages: results.map((m) => toMessage(m, viewer)),
        canMessage: await canMessage(c, row),
        ...(await detailExtras(c, id, await canActNow(c, row))),
      });
    },
  );

  r.post(
    '/requests/:id/messages',
    requireRole('owner', 'tenant', 'partner', 'partner_admin', 'jad_admin'),
    async (c) => {
      const { id } = parseParams(c, requestIdParam);
      const { body } = await parseJsonBody(c, postMessageBody);
      const row = await visibleRequest(c, id);
      if (!(await canMessage(c, row))) throw new ApiError(409, 'This request is closed for messages.');
      const actor = c.get('auth');
      const now = c.get('now');
      const clean = maskContactDetails(body);
      const text = clean.text.slice(0, STORED_BODY_MAX);
      const messageId = newId();
      const partnerId = actor.role === 'partner' || actor.role === 'partner_admin' ? actor.partnerId : null;
      await c.env.DB.prepare(
        `INSERT INTO request_messages (id, request_id, author_user_id, author_role, author_partner_id, body, masked, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(messageId, id, actor.userId, actor.role, partnerId, text, clean.masked ? 1 : 0, now)
        .run();
      const partnerName =
        partnerId === null
          ? null
          : ((
              await c.env.DB.prepare('SELECT name FROM partners WHERE id = ?')
                .bind(partnerId)
                .first<{ name: string }>()
            )?.name ?? null);
      return c.json(
        {
          message: {
            id: messageId,
            author: messageAuthorLabel(actor.role, partnerName),
            mine: true,
            body: text,
            at: now,
          },
          masked: clean.masked,
        },
        201,
      );
    },
  );

  return r;
}
