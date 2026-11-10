/**
 * Photos on a request (ADR 0013; CLAUDE.md "Uploads").
 *
 * - POST /api/requests/:id/photos             a resident adds a photo (raw JPEG or PNG body, at most 10 MB,
 *                                             at most 3 per request, open requests only)
 * - GET  /api/requests/:id/photos/:photoId    anyone who may see the request views it
 *
 * The type is taken from the file's own bytes, never from its name, and must match what the phone declared;
 * location and camera metadata are removed before the photo is stored privately in R2. Nobody else can reach
 * a photo: R2 is never public, and every read checks the request's access rules (C-AZ-2).
 */
import {
  MAX_REQUEST_PHOTOS,
  PHOTO_MAX_BYTES,
  requestIdParam,
  sniffPhotoType,
  stripPhotoMetadata,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseParams } from '../validate.js';
import { canMessage, visibleRequest } from './resident.js';
import { eventStatement } from './store.js';

const photoParam = requestIdParam.extend({ photoId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

/** Matches the upload route, which gets a 10 MB body limit instead of the API's 64 KB (app.ts). */
export const PHOTO_UPLOAD_PATH = /^\/api\/requests\/[A-Za-z0-9_-]{1,64}\/photos$/;

const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png' } as const;

/** SHA-256 of the stored photo (evidence that it was not changed later). */
async function digest(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export function photoRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/requests/:id/photos', requireRole('owner', 'tenant'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const row = await visibleRequest(c, id);
    if (!(await canMessage(c, row))) throw new ApiError(409, 'Photos can only be added to an open request.');
    const declared = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0 || bytes.length > PHOTO_MAX_BYTES) {
      throw new ApiError(413, 'Photos can be up to 10 MB.');
    }
    const type = sniffPhotoType(bytes);
    if (type === null || type !== declared) throw new ApiError(415, 'Please add a JPEG or PNG photo.');
    const clean = stripPhotoMetadata(bytes, type);
    if (clean === null) throw new ApiError(415, 'This photo could not be read. Please try another.');

    const db = c.env.DB;
    const count = await db
      .prepare("SELECT count(*) AS n FROM attachments WHERE request_id = ? AND purpose = 'request_photo'")
      .bind(id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_REQUEST_PHOTOS) {
      throw new ApiError(409, `A request can have up to ${String(MAX_REQUEST_PHOTOS)} photos.`);
    }
    const actor = c.get('auth');
    const now = c.get('now');
    const photoId = newId();
    const key = `requests/${id}/${photoId}.${EXTENSION[type]}`;
    await c.env.MEDIA.put(key, clean, { httpMetadata: { contentType: type } });
    await db.batch([
      db
        .prepare(
          `INSERT INTO attachments (id, request_id, purpose, r2_key, content_type, byte_size, sha256, uploaded_by_user_id, uploaded_at)
           VALUES (?, ?, 'request_photo', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(photoId, id, key, type, clean.length, await digest(clean), actor.userId, now),
      eventStatement(db, {
        requestId: id,
        at: now,
        actorUserId: actor.userId,
        actorRole: actor.role,
        kind: 'attachment_added',
        data: { photo: photoId },
      }),
      auditStatement(db, {
        at: now,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'photo_added',
        targetType: 'request',
        targetId: id,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
        detail: { bytes: clean.length },
      }),
    ]);
    return c.json({ id: photoId }, 201);
  });

  r.get(
    '/requests/:id/photos/:photoId',
    requireRole('owner', 'tenant', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer'),
    async (c) => {
      const { id, photoId } = parseParams(c, photoParam);
      await visibleRequest(c, id);
      const photo = await c.env.DB.prepare(
        'SELECT r2_key, content_type FROM attachments WHERE id = ? AND request_id = ?',
      )
        .bind(photoId, id)
        .first<{ r2_key: string; content_type: string }>();
      const object = photo === null ? null : await c.env.MEDIA.get(photo.r2_key);
      if (photo === null || object === null) throw new ApiError(404, 'Not found.');
      return new Response(object.body, {
        headers: {
          'content-type': photo.content_type,
          'content-disposition': 'inline',
          'cache-control': 'private, no-store',
        },
      });
    },
  );

  return r;
}
