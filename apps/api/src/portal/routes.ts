/**
 * Owner app residence data (R1, O1, N1-N3) and "I'm interested" on an exclusive offer (N2). ADR 0010.
 *
 * - GET  /api/owner/portal                       the owner's units, payment plan, receipts, progress, news
 * - POST /api/owner/offers/:postId/interest      record interest in an offer the owner can see
 *
 * The data is looked up by the owner's own verified email, never by anything the app sends (C-AZ-2).
 */
import { dubaiDate, isFileId, isOffer, postVisible } from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import type { Deps } from '../context.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseParams } from '../validate.js';
import { demoDeskRequests } from './desk.js';
import { UNAVAILABLE, loadPortal, ownerEmail } from './owner.js';
import { samplePdf } from './sample-pdf.js';
import { ownerFile } from './source.js';

type Ctx = Context<AppEnv>;

const postParam = z.strictObject({ postId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });
/** Salesforce file version ids only (068…, 15 or 18 characters). */
/** Salesforce file version ids (068…), or demo file ids outside production. */
const fileParam = z.strictObject({ fileId: z.string().refine(isFileId) });

/** Demo documents (receipts, passport copy) are a generated "SAMPLE" PDF, outside production only. */
function demoDocument(c: Ctx, fileId: string): Response {
  if (c.env.ENVIRONMENT === 'production' || !fileId.startsWith('demo-doc-'))
    throw new ApiError(404, 'Not found.');
  const title = fileId.slice('demo-doc-'.length).replace(/-/g, ' ').toUpperCase();
  return new Response(samplePdf(title), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline',
      'cache-control': 'private, no-store',
    },
  });
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
    // Desk requests: Salesforce's own list in production; JAD+'s log until it is connected (ADR 0011).
    const deskRequests =
      portal.source === 'demo'
        ? await demoDeskRequests(c.env.DB, c.get('auth').userId, portal, c.get('keys'))
        : portal.deskRequests;
    return c.json({ ...portal, deskRequests, interestedOfferIds: results.map((r) => r.post_id) });
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

  // Photos (and later PDFs) of the owner's updates and offers, only if Salesforce says this owner may see them.
  owner.get('/files/:fileId', async (c) => {
    const { fileId } = parseParams(c, fileParam);
    if (fileId.startsWith('demo-')) return demoDocument(c, fileId);
    const email = await ownerEmail(c);
    let file;
    try {
      file = await ownerFile(c.env, email, fileId);
    } catch (err) {
      c.get('log').log('warn', 'Owner file could not be loaded', { err });
      throw new ApiError(503, UNAVAILABLE);
    }
    if (file === null) throw new ApiError(404, 'Not found.');
    return new Response(file.body, {
      headers: {
        'content-type': file.type,
        'content-disposition': 'inline',
        // Personal to this owner: never kept by caches (the security headers enforce no-store too).
        'cache-control': 'private, no-store',
      },
    });
  });

  return owner;
}
