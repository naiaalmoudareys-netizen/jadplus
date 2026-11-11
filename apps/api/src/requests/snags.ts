/**
 * The snag list of a snagging inspection (ADR 0032; O3):
 *
 * - GET  /api/requests/:id/snags                          the list, with what the person may do on it
 * - POST /api/requests/:id/snags                          the inspector lists a snag (before the report)
 * - POST /api/requests/:id/snags/:snagId/remove           ...or removes one listed by mistake (before the report)
 * - POST /api/requests/:id/snags/:snagId/photo            ...adds its photo (raw JPEG/PNG, once, before the report)
 * - POST /api/requests/:id/snags/:snagId/fix              the fix, with its photo as the raw body: the snagging
 *                                                         provider or a JAD Global handover team (the developer side)
 * - POST /api/requests/:id/snags/:snagId/decision         the owner confirms the fix or reopens the snag
 *
 * Reading photos and the list of snags to fix: snag-views.ts. Who may do what: snag-access.ts.
 *
 * Access (C-AZ-2): the owner (once the report is on file), the provider the request is assigned to, JAD+ staff
 * (read only), and a JAD Global team assigned to the handover service, which sees only the snag list and its
 * photos of an open snagging request with a report, never the report, the messages or the owner. Tenants never.
 * Photos are sniffed, stripped of location and camera data, and kept in private R2 (C-UPL-1).
 */
import {
  MAX_SNAGS,
  PHOTO_MAX_BYTES,
  addSnagBody,
  maskContactDetails,
  reportActions,
  requestIdParam,
  snagDecisionBody,
  snagParam,
  snagStep,
  sniffPhotoType,
  stripPhotoMetadata,
  type PhotoType,
  type SnagEventKind,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { auditStatement, type AuditAction } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseJsonBody, parseParams } from '../validate.js';
import { stillOpen } from './report-store.js';
import {
  EXTENSION,
  NOT_NOW,
  SNAG_COLUMNS,
  canFix,
  handoverTeams,
  loadSnag,
  snagFlow,
  toSnag,
  type SnagRow,
} from './snag-access.js';

type Ctx = Context<AppEnv>;

/** Matches the two photo uploads, which get a 10 MB body limit instead of the API's 64 KB (app.ts). */
export const SNAG_PHOTO_UPLOAD_PATH =
  /^\/api\/requests\/[A-Za-z0-9_-]{1,64}\/snags\/[A-Za-z0-9_-]{1,64}\/(photo|fix)$/;

/** The photo in the body: sniffed (never trusted from its name), metadata removed. */
async function readPhoto(c: Ctx): Promise<{ bytes: Uint8Array; type: PhotoType }> {
  const declared = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > PHOTO_MAX_BYTES)
    throw new ApiError(413, 'Photos can be up to 10 MB.');
  const type = sniffPhotoType(bytes);
  if (type === null || type !== declared) throw new ApiError(415, 'Please add a JPEG or PNG photo.');
  const clean = stripPhotoMetadata(bytes, type);
  if (clean === null) throw new ApiError(415, 'This photo could not be read. Please try another.');
  return { bytes: clean, type };
}

/**
 * Moves a snag only from the status it was read in: otherwise the status becomes 'stale', which the table's
 * CHECK refuses, so the whole batch (history and audit included) is rolled back and the answer is 409.
 */
const guardedStatus = "status = CASE WHEN status = ? THEN ? ELSE 'stale' END";

async function withSnagConflictCheck(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    if (
      err instanceof Error &&
      /CHECK constraint failed/i.test(err.message) &&
      err.message.includes('status')
    ) {
      throw new ApiError(409, 'This snag was just changed by someone else. Refresh and try again.');
    }
    throw err;
  }
}

/** The history entry and the audit entry of one snag change. */
function evidence(
  c: Ctx,
  e: { snagId: string; requestId: string; kind: SnagEventKind; audit: AuditAction; photoKey?: string },
): D1PreparedStatement[] {
  const db = c.env.DB;
  const actor = c.get('auth');
  const now = c.get('now');
  return [
    db
      .prepare(
        `INSERT INTO snag_events (id, snag_id, request_id, at, actor_user_id, actor_role, partner_id, kind, photo_r2_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId(),
        e.snagId,
        e.requestId,
        now,
        actor.userId,
        actor.role,
        actor.partnerId,
        e.kind,
        e.photoKey ?? null,
      ),
    auditStatement(db, {
      at: now,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: e.audit,
      targetType: 'snag',
      targetId: e.snagId,
      ipHash: c.get('ipHash'),
      httpRequestId: c.get('requestId'),
      detail: { request: e.requestId },
    }),
  ];
}

export function snagRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const provider = requireRole('partner', 'partner_admin');

  r.get(
    '/requests/:id/snags',
    requireRole('owner', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer'),
    async (c) => {
      const { id } = parseParams(c, requestIdParam);
      const f = await snagFlow(c, id);
      const db = c.env.DB;
      // The owner sees the list once the inspector has delivered the report with it.
      const shown = f.access !== 'owner' || f.state.reported;
      const { results } = shown
        ? await db
            .prepare(
              `SELECT ${SNAG_COLUMNS} FROM snags s WHERE s.request_id = ? AND s.removed_at IS NULL
               ORDER BY s.created_at, s.rowid`,
            )
            .bind(id)
            .all<SnagRow>()
        : { results: [] };
      return c.json({
        snags: results.map(toSnag),
        canAdd: f.access === 'provider' && reportActions(c.get('auth').role, f.state).includes('add_snag'),
        canFix: canFix(c, f, await handoverTeams(db)),
        canDecide: f.access === 'owner' && f.state.reported && stillOpen(f.row),
      });
    },
  );

  r.post('/requests/:id/snags', provider, async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, addSnagBody);
    const f = await snagFlow(c, id);
    if (f.access !== 'provider' || !reportActions(c.get('auth').role, f.state).includes('add_snag')) {
      throw new ApiError(409, 'Snags are listed during the inspection, before the report is uploaded.');
    }
    if (f.state.snags.length >= MAX_SNAGS) {
      throw new ApiError(409, `An inspection can list up to ${String(MAX_SNAGS)} snags.`);
    }
    const db = c.env.DB;
    const now = c.get('now');
    const snagId = newId();
    // What the owner reads: contact details are removed, as in every message (ADR 0009).
    const title = maskContactDetails(body.title).text.slice(0, 200);
    const room = maskContactDetails(body.room).text.slice(0, 100);
    await db.batch([
      db
        .prepare(
          `INSERT INTO snags (id, request_id, title, room, status, created_by_user_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
        )
        .bind(snagId, id, title, room, c.get('auth').userId, now, now),
      ...evidence(c, { snagId, requestId: id, kind: 'added', audit: 'snag_added' }),
    ]);
    return c.json({ id: snagId, status: 'open' }, 201);
  });

  r.post('/requests/:id/snags/:snagId/remove', provider, async (c) => {
    const { id, snagId } = parseParams(c, snagParam);
    const f = await snagFlow(c, id);
    if (f.access !== 'provider' || !reportActions(c.get('auth').role, f.state).includes('add_snag')) {
      throw new ApiError(409, 'Snags can be removed only before the report is uploaded.');
    }
    await loadSnag(c.env.DB, id, snagId);
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE snags SET removed_at = ?, updated_at = ? WHERE id = ?').bind(
        c.get('now'),
        c.get('now'),
        snagId,
      ),
      ...evidence(c, { snagId, requestId: id, kind: 'removed', audit: 'snag_removed' }),
    ]);
    return c.json({ id: snagId, status: 'open' });
  });

  r.post('/requests/:id/snags/:snagId/photo', provider, async (c) => {
    const { id, snagId } = parseParams(c, snagParam);
    const f = await snagFlow(c, id);
    if (f.access !== 'provider' || !reportActions(c.get('auth').role, f.state).includes('add_snag')) {
      throw new ApiError(409, 'A snag photo is added during the inspection, before the report is uploaded.');
    }
    const snag = await loadSnag(c.env.DB, id, snagId);
    if (snag.photo_r2_key !== null) throw new ApiError(409, 'This snag already has its photo.');
    const photo = await readPhoto(c);
    const key = `requests/${id}/snags/${snagId}-${newId()}.${EXTENSION[photo.type]}`;
    await c.env.MEDIA.put(key, photo.bytes, { httpMetadata: { contentType: photo.type } });
    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE snags SET photo_r2_key = ?, photo_type = ?, updated_at = ? WHERE id = ? AND photo_r2_key IS NULL',
      ).bind(key, photo.type, c.get('now'), snagId),
      ...evidence(c, {
        snagId,
        requestId: id,
        kind: 'photo_added',
        audit: 'snag_photo_added',
        photoKey: key,
      }),
    ]);
    return c.json({ id: snagId, status: snag.status }, 201);
  });

  r.post('/requests/:id/snags/:snagId/fix', provider, async (c) => {
    const { id, snagId } = parseParams(c, snagParam);
    const f = await snagFlow(c, id);
    if (!canFix(c, f, await handoverTeams(c.env.DB))) throw new ApiError(409, NOT_NOW);
    const snag = await loadSnag(c.env.DB, id, snagId);
    const to = snagStep(snag.status, 'fix');
    if (to === null) throw new ApiError(409, NOT_NOW);
    const photo = await readPhoto(c);
    const now = c.get('now');
    const key = `requests/${id}/snags/${snagId}-fix-${newId()}.${EXTENSION[photo.type]}`;
    await c.env.MEDIA.put(key, photo.bytes, { httpMetadata: { contentType: photo.type } });
    await withSnagConflictCheck(() =>
      c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE snags SET ${guardedStatus}, fix_photo_r2_key = ?, fix_photo_type = ?, fixed_at = ?,
             fixed_by_partner_id = ?, updated_at = ? WHERE id = ?`,
        ).bind(snag.status, to, key, photo.type, now, c.get('auth').partnerId, now, snagId),
        ...evidence(c, { snagId, requestId: id, kind: 'fixed', audit: 'snag_fixed', photoKey: key }),
      ]),
    );
    return c.json({ id: snagId, status: to });
  });

  r.post('/requests/:id/snags/:snagId/decision', requireRole('owner'), async (c) => {
    const { id, snagId } = parseParams(c, snagParam);
    const { confirm } = await parseJsonBody(c, snagDecisionBody);
    const f = await snagFlow(c, id);
    if (f.access !== 'owner' || !f.state.reported || !stillOpen(f.row)) throw new ApiError(409, NOT_NOW);
    const snag = await loadSnag(c.env.DB, id, snagId);
    const to = snagStep(snag.status, confirm ? 'confirm' : 'reopen');
    if (to === null) throw new ApiError(409, NOT_NOW);
    const now = c.get('now');
    // Reopened: back to open; the fix photo stays in the snag's history (snag_events).
    const change = confirm
      ? c.env.DB.prepare(`UPDATE snags SET ${guardedStatus}, updated_at = ? WHERE id = ?`).bind(
          snag.status,
          to,
          now,
          snagId,
        )
      : c.env.DB.prepare(
          `UPDATE snags SET ${guardedStatus}, fix_photo_r2_key = NULL, fix_photo_type = NULL, fixed_at = NULL,
             fixed_by_partner_id = NULL, reopen_count = reopen_count + 1, updated_at = ? WHERE id = ?`,
        ).bind(snag.status, to, now, snagId);
    await withSnagConflictCheck(() =>
      c.env.DB.batch([
        change,
        ...evidence(c, {
          snagId,
          requestId: id,
          kind: confirm ? 'confirmed' : 'reopened',
          audit: confirm ? 'snag_confirmed' : 'snag_reopened',
        }),
      ]),
    );
    return c.json({ id: snagId, status: to });
  });

  return r;
}
