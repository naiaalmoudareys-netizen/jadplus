/**
 * Reading snags (ADR 0032; O3): a snag's photo or the photo of its fix, after the access check, and the open
 * snags waiting for this company's fix (the JAD Global handover team: every snagging request with a report;
 * a snagging provider: its own jobs).
 *
 * - GET /api/requests/:id/snags/:snagId/photo/:which
 * - GET /api/partner/snags
 */
import { OPEN_STATUSES, snagPhotoParam } from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseParams } from '../validate.js';
import { NOT_FOUND, SNAG_COLUMNS, handoverTeams, snagFlow, toSnag, type SnagRow } from './snag-access.js';
import { LOCATION_JOIN } from './views.js';

export function snagViewRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const provider = requireRole('partner', 'partner_admin');

  r.get(
    '/requests/:id/snags/:snagId/photo/:which',
    requireRole('owner', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer'),
    async (c) => {
      const { id, snagId, which } = parseParams(c, snagPhotoParam);
      const f = await snagFlow(c, id);
      if (f.access === 'owner' && !f.state.reported) throw new ApiError(404, NOT_FOUND);
      const snag = await c.env.DB.prepare(
        `SELECT photo_r2_key, photo_type, fix_photo_r2_key, fix_photo_type FROM snags
         WHERE id = ? AND request_id = ? AND removed_at IS NULL`,
      )
        .bind(snagId, id)
        .first<{
          photo_r2_key: string | null;
          photo_type: string | null;
          fix_photo_r2_key: string | null;
          fix_photo_type: string | null;
        }>();
      const key = which === 'snag' ? snag?.photo_r2_key : snag?.fix_photo_r2_key;
      const type = which === 'snag' ? snag?.photo_type : snag?.fix_photo_type;
      const object = key === undefined || key === null ? null : await c.env.MEDIA.get(key);
      if (object === null || type === undefined || type === null) throw new ApiError(404, NOT_FOUND);
      return new Response(object.body, {
        headers: {
          'content-type': type,
          'content-disposition': 'inline',
          'cache-control': 'private, no-store',
        },
      });
    },
  );

  r.get('/partner/snags', provider, async (c) => {
    const db = c.env.DB;
    const partnerId = c.get('auth').partnerId;
    if (partnerId === null) return c.json({ snags: [] });
    const handover = (await handoverTeams(db)).includes(partnerId);
    const open = [...OPEN_STATUSES];
    const { results } = await db
      .prepare(
        `SELECT ${SNAG_COLUMNS}, r.id AS request_id, r.ref, ou.unit_name, ou.project
         FROM snags s JOIN requests r ON r.id = s.request_id ${LOCATION_JOIN}
         WHERE s.status = 'open' AND s.removed_at IS NULL AND r.service_code = 'snagging'
           AND r.status IN (${open.map(() => '?').join(', ')})
           AND EXISTS (SELECT 1 FROM request_reports rp WHERE rp.request_id = r.id AND rp.kind = 'snagging')
           AND (r.partner_id = ? OR ? = 1)
         ORDER BY s.created_at, s.rowid LIMIT 500`,
      )
      .bind(...open, partnerId, handover ? 1 : 0)
      .all<SnagRow & { request_id: string; ref: string; unit_name: string | null; project: string | null }>();
    return c.json({
      snags: results.map((s) => ({
        ...toSnag(s),
        requestId: s.request_id,
        ref: s.ref,
        unit: s.unit_name,
        project: s.project,
      })),
    });
  });

  return r;
}
