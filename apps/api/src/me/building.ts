/**
 * What residents see about their building (V1; ADR 0025). Owners and tenants only.
 * - GET /api/me/notices   current notices, and those starting within NOTICE_LEAD_DAYS, for the buildings of the
 *                         signed-in owner's units or the tenant's current tenancy (building and project-wide)
 * - GET /api/me/guide     the home guide per place, a building's own section overriding the project-wide one
 * The places come from the session's role only (C-AZ-2): an owner's units, or a tenant's current tenancy.
 */
import {
  dubaiDate,
  guideFor,
  noticesFor,
  placesOf,
  type Place,
  type ResidentGuide,
  type ResidentNotices,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  GUIDE_COLUMNS,
  NOTICE_COLUMNS,
  guideView,
  noticeView,
  type GuideRow,
  type NoticeRow,
} from '../admin/platform/notices.js';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';

/** The places of the signed-in resident's homes. */
async function myPlaces(c: Context<AppEnv>): Promise<Place[]> {
  const { userId, role } = c.get('auth');
  const db = c.env.DB;
  if (role === 'owner') {
    const { results } = await db
      .prepare('SELECT project, building FROM owner_units WHERE user_id = ?')
      .bind(userId)
      .all<{ project: string | null; building: string | null }>();
    return placesOf(results);
  }
  const today = dubaiDate(c.get('now'));
  const { results } = await db
    .prepare(
      `SELECT ou.project, ou.building FROM tenancies t
       JOIN owner_units ou ON ou.rowid =
         (SELECT x.rowid FROM owner_units x WHERE x.sf_unit_id = t.sf_unit_id ORDER BY x.synced_at DESC LIMIT 1)
       WHERE t.tenant_user_id = ? AND t.status = 'active' AND t.starts_on <= ? AND t.ends_on >= ?`,
    )
    .bind(userId, today, today)
    .all<{ project: string | null; building: string | null }>();
  return placesOf(results);
}

const projectsOf = (places: readonly Place[]): string[] => [...new Set(places.map((p) => p.project))];
const marks = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

export function residentBuildingRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/me/notices', requireRole('owner', 'tenant'), async (c) => {
    const now = c.get('now');
    const places = await myPlaces(c);
    const projects = projectsOf(places);
    if (projects.length === 0) return c.json({ notices: [] } satisfies ResidentNotices);
    const { results } = await c.env.DB.prepare(
      `SELECT ${NOTICE_COLUMNS} FROM building_notices
       WHERE project IN (${marks(projects.length)}) AND withdrawn_at IS NULL AND (ends_at IS NULL OR ends_at > ?)`,
    )
      .bind(...projects, now)
      .all<NoticeRow>();
    const shown = noticesFor(
      results.map((n) => noticeView(n, now)),
      places,
      now,
    );
    const notices: ResidentNotices['notices'] = shown.map((n) => ({
      id: n.id,
      project: n.project,
      building: n.building,
      kind: n.kind,
      title: n.title,
      body: n.body,
      startsAt: n.startsAt,
      endsAt: n.endsAt,
      state: n.state,
    }));
    return c.json({ notices });
  });

  r.get('/me/guide', requireRole('owner', 'tenant'), async (c) => {
    const places = await myPlaces(c);
    const projects = projectsOf(places);
    if (projects.length === 0) return c.json({ places: [] } satisfies ResidentGuide);
    const { results } = await c.env.DB.prepare(
      `SELECT ${GUIDE_COLUMNS} FROM home_guide_sections WHERE project IN (${marks(projects.length)})`,
    )
      .bind(...projects)
      .all<GuideRow>();
    const sections = results.map(guideView);
    const guide: ResidentGuide['places'] = places
      .map((place) => ({ ...place, sections: guideFor(sections, place) }))
      .filter((p) => p.sections.length > 0);
    return c.json({ places: guide });
  });

  return r;
}
