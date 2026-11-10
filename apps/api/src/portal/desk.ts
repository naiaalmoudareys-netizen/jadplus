/**
 * Requests to the JAD+ desk (ADR 0011). Production: the request becomes a JAD+ Request record in Salesforce
 * (JADPortalApi `request`, through the finance worker's `jadplus-desk` route), where the desk works it; JAD+
 * keeps its own log row. Local and preview: the log row is the request, so the demo can be tried end to end.
 * Asking again while the same request is open returns the existing one (as Salesforce does).
 */
import {
  deskRequestBody,
  type DeskRequestType,
  type DeskStatus,
  type OwnerPortalAnswer,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import type { Deps } from '../context.js';
import { encryptField, newId } from '../crypto.js';
import type { AppEnv, Bindings } from '../env.js';
import { ApiError } from '../errors.js';
import { DIRECTORY_TIMEOUT_MS } from '../salesforce/directory.js';
import { parseJsonBody } from '../validate.js';
import { loadPortal, ownerEmail } from './owner.js';

type Ctx = Context<AppEnv>;

export const DESK_URL = 'https://portal.internal/jadplus-desk';

const salesforceAnswer = z.object({
  id: z.string().regex(/^[A-Za-z0-9]{15,18}$/),
  name: z.string().max(40).nullable().catch(null),
  status: z.enum(['New', 'In progress', 'Completed', 'Cancelled']).catch('New'),
  existing: z.boolean().catch(false),
});

/** Production: create (or find the open) JAD+ Request in Salesforce for this owner. */
export async function salesforceDeskRequest(
  env: Bindings,
  email: string,
  request: { type: DeskRequestType; dealId: string | null; details: string | null },
): Promise<z.infer<typeof salesforceAnswer>> {
  if (env.FIN === undefined || env.PORTAL_KEY === undefined || env.PORTAL_KEY === '') {
    throw new Error('The Salesforce link (FIN, PORTAL_KEY) is not configured');
  }
  const res = await env.FIN.fetch(DESK_URL, {
    method: 'POST',
    headers: { 'x-portal-key': env.PORTAL_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      deal: request.dealId,
      type: request.type,
      details: request.details,
      source: 'App',
    }),
    signal: AbortSignal.timeout(DIRECTORY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Salesforce desk request answered ${res.status}`);
  return salesforceAnswer.parse(await res.json());
}

interface DeskRow {
  id: string;
  type: DeskRequestType;
  deal_id: string | null;
  status: DeskStatus;
  sf_request_ref: string | null;
  created_at: number;
}

/** Demo (local, preview): the owner's desk requests as JAD+ logged them. */
export async function demoDeskRequests(
  db: D1Database,
  userId: string,
  portal: Pick<OwnerPortalAnswer, 'deals'>,
): Promise<OwnerPortalAnswer['deskRequests']> {
  const { results } = await db
    .prepare(
      `SELECT id, type, deal_id, status, sf_request_ref, created_at FROM desk_requests
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
    .bind(userId)
    .all<DeskRow>();
  return results.map((r, i) => ({
    id: r.id,
    ref: r.sf_request_ref ?? `DEMO-JR-${String(results.length - i).padStart(3, '0')}`,
    type: r.type,
    status: r.status,
    dealId: r.deal_id,
    unitName: portal.deals.find((d) => d.id === r.deal_id)?.unit?.name ?? null,
    reply: null,
    createdAt: new Date(r.created_at).toISOString(),
    fileIds: [],
  }));
}

export function deskRoutes(deps: Deps): Hono<AppEnv> {
  const desk = new Hono<AppEnv>();
  desk.use('*', requireRole('owner'));

  desk.post('/desk-requests', async (c: Ctx) => {
    const body = await parseJsonBody(c, deskRequestBody);
    const portal = await loadPortal(c, deps);
    // C-AZ-2: a document request must name one of this owner's own residences.
    if (body.dealId !== null && !portal.deals.some((d) => d.id === body.dealId)) {
      throw new ApiError(404, 'Not found.');
    }
    const actor = c.get('auth');
    const db = c.env.DB;
    const now = c.get('now');
    const details = body.details === undefined || body.details === '' ? null : body.details;

    if (portal.source === 'demo') {
      const open = await db
        .prepare(
          `SELECT id, status FROM desk_requests WHERE user_id = ? AND type = ? AND deal_id IS ?
           AND status IN ('New', 'In progress') LIMIT 1`,
        )
        .bind(actor.userId, body.type, body.dealId)
        .first<{ id: string; status: DeskStatus }>();
      if (open !== null) return c.json({ id: open.id, status: open.status, existing: true });
    }

    let sf: z.infer<typeof salesforceAnswer> | null = null;
    if (portal.source === 'salesforce') {
      try {
        sf = await salesforceDeskRequest(c.env, await ownerEmail(c), { ...body, details });
      } catch (err) {
        c.get('log').log('warn', 'Desk request could not be sent to Salesforce', { err });
        throw new ApiError(503, 'We could not send your request right now. Please try again shortly.');
      }
    }
    const id = newId();
    await db.batch([
      db
        .prepare(
          `INSERT INTO desk_requests (id, user_id, type, deal_id, details_enc, status, sf_request_id, sf_request_ref, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          actor.userId,
          body.type,
          body.dealId,
          details === null ? null : await encryptField(c.get('keys'), details, `desk_requests.details:${id}`),
          sf?.status ?? 'New',
          sf?.id ?? null,
          sf?.name ?? null,
          now,
        ),
      auditStatement(db, {
        at: now,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'desk_request_created',
        targetType: 'desk_request',
        targetId: id,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
        detail: { type: body.type, existing: sf?.existing ?? false },
      }),
    ]);
    return c.json(
      { id: sf?.id ?? id, status: sf?.status ?? 'New', existing: sf?.existing ?? false },
      sf?.existing === true ? 200 : 201,
    );
  });

  return desk;
}
