/**
 * Owner app residence data (R1, O1, N1-N3) and "I'm interested" on an exclusive offer (N2). ADR 0010.
 *
 * - GET  /api/owner/portal                       the owner's units, payment plan, receipts, progress, news
 * - POST /api/owner/offers/:postId/interest      record interest in an offer the owner can see
 *
 * The data is looked up by the owner's own verified email, never by anything the app sends (C-AZ-2).
 */
import { dubaiDate, isOffer, postVisible, type OwnerPortal } from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import type { Deps } from '../context.js';
import { decryptField, newId, toBytes } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseParams } from '../validate.js';

type Ctx = Context<AppEnv>;

const postParam = z.strictObject({ postId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

const UNAVAILABLE = 'We could not load your details right now. Please try again shortly.';

async function ownerEmail(c: Ctx): Promise<string> {
  const { userId } = c.get('auth');
  const row = await c.env.DB.prepare('SELECT email_enc FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email_enc: unknown }>();
  if (row === null || row.email_enc === null) {
    throw new ApiError(409, 'Your email is not on file yet. Please contact the JAD+ desk.');
  }
  return decryptField(c.get('keys'), toBytes(row.email_enc), `users.email:${userId}`);
}

async function loadPortal(c: Ctx, deps: Deps): Promise<OwnerPortal> {
  const email = await ownerEmail(c);
  try {
    return await deps.ownerPortal(c.env, email, c.get('now'));
  } catch (err) {
    c.get('log').log('warn', 'Owner data could not be loaded', { err });
    throw new ApiError(503, UNAVAILABLE);
  }
}

export function portalRoutes(deps: Deps): Hono<AppEnv> {
  const owner = new Hono<AppEnv>();
  owner.use('*', requireRole('owner'));

  owner.get('/portal', async (c) => {
    const portal = await loadPortal(c, deps);
    const { results } = await c.env.DB.prepare(
      'SELECT post_id FROM offer_interests WHERE user_id = ? AND withdrawn_at IS NULL',
    )
      .bind(c.get('auth').userId)
      .all<{ post_id: string }>();
    return c.json({ ...portal, interestedOfferIds: results.map((r) => r.post_id) });
  });

  owner.post('/offers/:postId/interest', async (c) => {
    const { postId } = parseParams(c, postParam);
    const portal = await loadPortal(c, deps);
    const today = dubaiDate(c.get('now'));
    // N2/N3: only an offer this owner can see today (dates, project, unit still available).
    const offer = portal.posts.find((p) => p.id === postId && isOffer(p) && postVisible(p, today));
    if (offer === undefined) throw new ApiError(404, 'This offer is no longer available.');
    const actor = c.get('auth');
    const db = c.env.DB;
    const existing = await db
      .prepare('SELECT id FROM offer_interests WHERE post_id = ? AND user_id = ? AND withdrawn_at IS NULL')
      .bind(postId, actor.userId)
      .first<{ id: string }>();
    if (existing !== null) return c.json({ id: existing.id, alreadyInterested: true });
    const id = newId();
    const now = c.get('now');
    await db.batch([
      db
        .prepare('INSERT INTO offer_interests (id, post_id, user_id, at) VALUES (?, ?, ?, ?)')
        .bind(id, postId, actor.userId, now),
      auditStatement(db, {
        at: now,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'offer_interest',
        targetType: 'offer',
        targetId: postId,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
      }),
    ]);
    return c.json({ id, alreadyInterested: false }, 201);
  });

  return owner;
}
