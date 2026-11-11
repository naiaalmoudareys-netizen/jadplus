/**
 * Building notices (V1) and the home guide (ADR 0025). Information only, plain text (L3: never instructions).
 * - GET    /api/admin/notices?project=&state=live|all   notices, newest first (live: not ended or withdrawn)
 * - POST   /api/admin/notices                           publish a notice for a project or one building; every
 *                                                       owner and current tenant there gets an in-app item (ADR 0027)
 * - POST   /api/admin/notices/:id/withdraw              take a notice down (kept as evidence)
 * - GET    /api/admin/guide?project=                    the guide sections of a project and its buildings
 * - PUT    /api/admin/guide                             create or replace one section for a project or building
 * - DELETE /api/admin/guide/:id                         remove one section
 */
import {
  adminNoticesQuery,
  dubaiDate,
  guideSectionBody,
  noticeAudience,
  noticeBody,
  noticeState,
  platformIdParam,
  projectQuery,
  type AdminGuide,
  type AdminNotices,
  type GuideSection,
  type Home,
  type NoticeKind,
  type Place,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { newId } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { noticeInboxStatement } from '../../requests/inbox.js';
import { parseJsonBody, parseParams, parseQuery } from '../../validate.js';
import { CHANGERS, READERS, audit, placeBuilding, requireKnownPlace, storedBuilding } from './common.js';

export interface NoticeRow {
  id: string;
  project: string;
  building: string;
  kind: NoticeKind;
  title: string;
  body: string;
  starts_at: number;
  ends_at: number | null;
  created_at: number;
  withdrawn_at: number | null;
}

export interface GuideRow {
  id: string;
  project: string;
  building: string;
  section: GuideSection;
  title: string;
  body: string;
  updated_at: number;
}

export const NOTICE_COLUMNS =
  'id, project, building, kind, title, body, starts_at, ends_at, created_at, withdrawn_at';
export const GUIDE_COLUMNS = 'id, project, building, section, title, body, updated_at';

/** A stored notice as the API shows it (state computed at `now`). */
export function noticeView(n: NoticeRow, now: number): AdminNotices['notices'][number] {
  const times = { startsAt: n.starts_at, endsAt: n.ends_at, withdrawnAt: n.withdrawn_at };
  return {
    id: n.id,
    project: n.project,
    building: placeBuilding(n.building),
    kind: n.kind,
    title: n.title,
    body: n.body,
    ...times,
    state: noticeState(times, now),
    createdAt: n.created_at,
  };
}

export function guideView(g: GuideRow): AdminGuide['sections'][number] {
  return {
    id: g.id,
    project: g.project,
    building: placeBuilding(g.building),
    section: g.section,
    title: g.title,
    body: g.body,
    updatedAt: g.updated_at,
  };
}

/**
 * V1: everyone with a home in the project (owners of its units, tenants of a current tenancy there), with the
 * building Salesforce last named for the unit. noticeAudience (shared) keeps those the notice covers.
 */
async function noticeRecipients(db: D1Database, place: Place, today: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT ou.user_id AS userId, ou.project, ou.building FROM owner_units ou JOIN users u ON u.id = ou.user_id
       WHERE ou.project = ?1 AND u.status = 'active'
       UNION ALL
       SELECT t.tenant_user_id, ou.project, ou.building FROM tenancies t
       JOIN owner_units ou ON ou.rowid =
         (SELECT x.rowid FROM owner_units x WHERE x.sf_unit_id = t.sf_unit_id ORDER BY x.synced_at DESC LIMIT 1)
       JOIN users u ON u.id = t.tenant_user_id
       WHERE ou.project = ?1 AND t.status = 'active' AND t.starts_on <= ?2 AND t.ends_on >= ?2
         AND u.status = 'active'`,
    )
    .bind(place.project, today)
    .all<Home>();
  return noticeAudience(place, results);
}

export function platformNoticeRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/notices', requireRole(...READERS), async (c) => {
    const { project, state } = parseQuery(c, adminNoticesQuery);
    const now = c.get('now');
    const live = state !== 'all';
    const { results } = await c.env.DB.prepare(
      `SELECT ${NOTICE_COLUMNS} FROM building_notices
       WHERE (?1 IS NULL OR project = ?1) AND (?2 = 0 OR (withdrawn_at IS NULL AND (ends_at IS NULL OR ends_at > ?3)))
       ORDER BY starts_at DESC LIMIT 200`,
    )
      .bind(project ?? null, live ? 1 : 0, now)
      .all<NoticeRow>();
    return c.json({ notices: results.map((n) => noticeView(n, now)) });
  });

  r.post('/notices', requireRole(...CHANGERS), async (c) => {
    const body = await parseJsonBody(c, noticeBody);
    const db = c.env.DB;
    const now = c.get('now');
    if (body.endsAt !== null && body.endsAt <= now) throw new ApiError(422, 'The end must be in the future.');
    await requireKnownPlace(db, body);
    const id = newId();
    const building = storedBuilding(body.building);
    const people = await noticeRecipients(db, body, dubaiDate(now));
    await db.batch([
      db
        .prepare(
          `INSERT INTO building_notices (id, project, building, kind, title, body, starts_at, ends_at, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          body.project,
          building,
          body.kind,
          body.title,
          body.body,
          body.startsAt,
          body.endsAt,
          now,
          c.get('auth').userId,
        ),
      noticeInboxStatement(db, { id, kind: body.kind }, people, now),
      audit(c, 'building_notice_published', 'building_notice', id, {
        project: body.project,
        building,
        kind: body.kind,
        residentsTold: people.length,
      }),
    ]);
    return c.json({ id }, 201);
  });

  r.post('/notices/:id/withdraw', requireRole(...CHANGERS), async (c) => {
    const { id } = parseParams(c, platformIdParam);
    const db = c.env.DB;
    const now = c.get('now');
    const row = await db
      .prepare('SELECT withdrawn_at FROM building_notices WHERE id = ?')
      .bind(id)
      .first<{ withdrawn_at: number | null }>();
    if (row?.withdrawn_at !== null) throw new ApiError(404, 'Not found or already withdrawn.');
    await db.batch([
      db
        .prepare(
          'UPDATE building_notices SET withdrawn_at = ?, withdrawn_by = ? WHERE id = ? AND withdrawn_at IS NULL',
        )
        .bind(now, c.get('auth').userId, id),
      audit(c, 'building_notice_withdrawn', 'building_notice', id),
    ]);
    return c.json({ id, withdrawnAt: now });
  });

  r.get('/guide', requireRole(...READERS), async (c) => {
    const { project } = parseQuery(c, projectQuery);
    const { results } = await c.env.DB.prepare(
      `SELECT ${GUIDE_COLUMNS} FROM home_guide_sections WHERE project = ? ORDER BY building, section`,
    )
      .bind(project)
      .all<GuideRow>();
    return c.json({ sections: results.map(guideView) });
  });

  r.put('/guide', requireRole(...CHANGERS), async (c) => {
    const body = await parseJsonBody(c, guideSectionBody);
    const db = c.env.DB;
    const now = c.get('now');
    await requireKnownPlace(db, body);
    const building = storedBuilding(body.building);
    const existing = await db
      .prepare('SELECT id FROM home_guide_sections WHERE project = ? AND building = ? AND section = ?')
      .bind(body.project, building, body.section)
      .first<{ id: string }>();
    const id = existing?.id ?? newId();
    await db.batch([
      db
        .prepare(
          `INSERT INTO home_guide_sections (id, project, building, section, title, body, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (project, building, section) DO UPDATE SET
             title = excluded.title, body = excluded.body, updated_at = excluded.updated_at,
             updated_by = excluded.updated_by`,
        )
        .bind(id, body.project, building, body.section, body.title, body.body, now, c.get('auth').userId),
      audit(c, 'home_guide_section_saved', 'home_guide_section', id, {
        project: body.project,
        building,
        section: body.section,
      }),
    ]);
    return c.json({ id }, existing === null ? 201 : 200);
  });

  r.delete('/guide/:id', requireRole(...CHANGERS), async (c) => {
    const { id } = parseParams(c, platformIdParam);
    const db = c.env.DB;
    const found = await db.prepare('SELECT id FROM home_guide_sections WHERE id = ?').bind(id).first();
    if (found === null) throw new ApiError(404, 'Not found.');
    await db.batch([
      db.prepare('DELETE FROM home_guide_sections WHERE id = ?').bind(id),
      audit(c, 'home_guide_section_removed', 'home_guide_section', id),
    ]);
    return c.json({ id, removed: true });
  });

  return r;
}
