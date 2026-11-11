/**
 * What residents see about their building (V1; ADR 0025). Owners and tenants only.
 * - GET /api/me/notices   current notices, and those starting within NOTICE_LEAD_DAYS, for the buildings of the
 *                         signed-in owner's units or the tenant's current tenancy (building and project-wide)
 * - GET /api/me/guide     the home guide per place, a building's own section overriding the project-wide one
 * - GET /api/me/building-lines  per place, the building's security and management numbers residents may call
 *                         (E12; ADR 0029), a building's own line overriding the project-wide one
 * The places come from the session's role only (C-AZ-2): an owner's units, or a tenant's current tenancy.
 */
import {
  dubaiDate,
  guideFor,
  linesFor,
  noticesFor,
  placesOf,
  type Place,
  type ResidentBuildingLines,
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
import { LINE_COLUMNS, lineView, type LineRow } from '../admin/platform/lines.js';
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

  r.get('/me/building-lines', requireRole('owner', 'tenant'), async (c) => {
    const places = await myPlaces(c);
    const projects = projectsOf(places);
    if (projects.length === 0) return c.json({ places: [] } satisfies ResidentBuildingLines);
    const { results } = await c.env.DB.prepare(
      `SELECT ${LINE_COLUMNS} FROM building_lines WHERE project IN (${marks(projects.length)})`,
    )
      .bind(...projects)
      .all<LineRow>();
    const keys = c.get('keys');
    const lines = await Promise.all(results.map((row) => lineView(keys, row)));
    const shown = (line: (typeof lines)[number] | null) =>
      line === null ? null : { phone: line.phone, hours: line.hours };
    const out: ResidentBuildingLines['places'] = places.map((place) => {
      const chosen = linesFor(lines, place);
      return { ...place, security: shown(chosen.security), management: shown(chosen.management) };
    });
    return c.json({ places: out });
  });

  return r;
}
