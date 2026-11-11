/**
 * JAD+ Admin platform (ADR 0025): services and their partners, buildings, notices, home guide, news, on-call,
 * settings. Reading: jad_admin and jad_viewer; changing: jad_admin only. Every change is audited (C-AUD-1),
 * and so is every read that shows personal data.
 *
 * Here:
 * - GET  /api/admin/offer-interests?state=open|all   owners who tapped "I'm interested" (N2), for sales, with
 *                                                    the offer's title
 * - POST /api/admin/offer-interests/:id/handled      sales picked it up
 * - GET  /api/admin/on-call/weeks?from=              8 weeks of the rota with names, and who may be on call
 * - GET  /api/admin/settings                         versions, limits, calendar, SLA targets (read-only; the
 *                                                    holidays come from the table JAD+ Admin keeps, ADR 0028)
 * Holidays: platform/holidays.ts. Services: platform/services.ts. Buildings and contacts: platform/buildings.ts.
 * Notices, guide: platform/notices.ts. Building help lines (E12, ADR 0029): platform/lines.ts. Adding a provider
 * company (ADR 0030): platform/providers.ts.
 */
import {
  canBeOnCall,
  dubaiDate,
  offerInterestsQuery,
  onCallQuery,
  platformIdParam,
  platformSettings,
  weekStarting,
  type OfferInterests,
  type OnCallWeeks,
  type UserRole,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { decryptField, toBytes, type Keys } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { demoOwnerPortal } from '../portal/demo.js';
import { loadHolidays } from '../calendar.js';
import { parseParams, parseQuery } from '../validate.js';
import { platformBuildingRoutes } from './platform/buildings.js';
import { CHANGERS, READERS, audit } from './platform/common.js';
import { platformHolidayRoutes } from './platform/holidays.js';
import { platformLineRoutes } from './platform/lines.js';
import { platformNoticeRoutes } from './platform/notices.js';
import { platformProviderRoutes } from './platform/providers.js';
import { platformServiceRoutes } from './platform/services.js';

/** How many weeks the on-call calendar shows. */
const CALENDAR_WEEKS = 8;
const WEEK_MS = 7 * 86_400_000;

const nameOf = (keys: Keys, userId: string, nameEnc: Uint8Array | null): Promise<string | null> =>
  nameEnc === null ? Promise.resolve(null) : decryptField(keys, toBytes(nameEnc), `users.name:${userId}`);

export function adminPlatformRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.route('/', platformServiceRoutes());
  r.route('/', platformProviderRoutes());
  r.route('/', platformBuildingRoutes());
  r.route('/', platformNoticeRoutes());
  r.route('/', platformHolidayRoutes());
  r.route('/', platformLineRoutes());

  r.get('/offer-interests', requireRole(...READERS), async (c) => {
    const { state } = parseQuery(c, offerInterestsQuery);
    const keys = c.get('keys');
    // Offers are Salesforce posts; JAD+ keeps the title each owner saw with their interest (migration 0024).
    // Outside production, interests recorded before that are named from the demo posts.
    const demoTitles = new Map<string, string>(
      c.env.ENVIRONMENT === 'production'
        ? []
        : demoOwnerPortal(c.get('now')).posts.map((p) => [p.id, p.title] as const),
    );
    const { results } = await c.env.DB.prepare(
      `SELECT i.id, i.post_id, i.user_id, u.name_enc, u.sf_contact_id, i.at, i.handled_at, i.withdrawn_at, i.title
       FROM offer_interests i JOIN users u ON u.id = i.user_id
       WHERE ? = 'all' OR (i.handled_at IS NULL AND i.withdrawn_at IS NULL)
       ORDER BY i.at DESC LIMIT 500`,
    )
      .bind(state ?? 'open')
      .all<{
        id: string;
        post_id: string;
        title: string | null;
        user_id: string;
        name_enc: Uint8Array | null;
        sf_contact_id: string | null;
        at: number;
        handled_at: number | null;
        withdrawn_at: number | null;
      }>();
    const interests: OfferInterests['interests'] = await Promise.all(
      results.map(async (i) => ({
        id: i.id,
        postId: i.post_id,
        title: i.title ?? demoTitles.get(i.post_id) ?? null,
        owner: {
          userId: i.user_id,
          name: await nameOf(keys, i.user_id, i.name_enc),
          sfContactId: i.sf_contact_id,
        },
        at: i.at,
        handledAt: i.handled_at,
        withdrawnAt: i.withdrawn_at,
      })),
    );
    // ADR 0025: viewing owners' names in the console is audited.
    await audit(c, 'offer_interests_viewed', 'offer_interests', state ?? 'open', {
      count: interests.length,
    }).run();
    return c.json({ interests });
  });

  r.post('/offer-interests/:id/handled', requireRole(...CHANGERS), async (c) => {
    const { id } = parseParams(c, platformIdParam);
    const db = c.env.DB;
    const now = c.get('now');
    const row = await db
      .prepare('SELECT handled_at, withdrawn_at FROM offer_interests WHERE id = ?')
      .bind(id)
      .first<{ handled_at: number | null; withdrawn_at: number | null }>();
    if (row?.handled_at !== null || row.withdrawn_at !== null) {
      throw new ApiError(404, 'Not found, withdrawn or already handled.');
    }
    await db.batch([
      db
        .prepare('UPDATE offer_interests SET handled_at = ? WHERE id = ? AND handled_at IS NULL')
        .bind(now, id),
      audit(c, 'offer_interest_handled', 'offer_interest', id),
    ]);
    return c.json({ id, handledAt: now });
  });

  // E6, E7: the existing GET /on-call gives user ids only; the calendar also needs names, "this week" and the
  // people who may fill each position (changes still go through PUT /on-call/:week).
  r.get('/on-call/weeks', requireRole(...READERS), async (c) => {
    const { from } = parseQuery(c, onCallQuery);
    const db = c.env.DB;
    const keys = c.get('keys');
    const thisWeek = weekStarting(dubaiDate(c.get('now')));
    const start = from ?? thisWeek;
    const weeks = Array.from({ length: CALENDAR_WEEKS }, (_, i) =>
      new Date(Date.parse(`${start}T00:00:00Z`) + i * WEEK_MS).toISOString().slice(0, 10),
    );
    const [rota, staff] = await Promise.all([
      db
        .prepare(
          `SELECT week_starting, position, user_id FROM on_call_rota
           WHERE week_starting >= ? AND week_starting <= ? ORDER BY week_starting, position`,
        )
        .bind(weeks[0] ?? start, weeks.at(-1) ?? start)
        .all<{ week_starting: string; position: 'first' | 'second'; user_id: string }>(),
      db
        .prepare(
          `SELECT u.id, u.name_enc, group_concat(g.role) AS roles FROM users u
           JOIN user_roles g ON g.user_id = u.id AND g.revoked_at IS NULL AND g.role IN ('jad_admin', 'jad_viewer')
           WHERE u.status = 'active' GROUP BY u.id`,
        )
        .all<{ id: string; name_enc: Uint8Array | null; roles: string }>(),
    ]);
    const names = new Map<string, string | null>();
    const candidates: OnCallWeeks['candidates'] = [];
    for (const s of staff.results) {
      const name = await nameOf(keys, s.id, s.name_enc);
      const roles = s.roles.split(',') as UserRole[];
      names.set(s.id, name);
      candidates.push({
        userId: s.id,
        name,
        canBeFirst: canBeOnCall('first', roles),
        canBeSecond: canBeOnCall('second', roles),
      });
    }
    // Someone on the rota who has since left JAD+ staff still shows, without a name.
    const person = (week: string, position: 'first' | 'second') => {
      const userId = rota.results.find((x) => x.week_starting === week && x.position === position)?.user_id;
      return userId === undefined ? null : { userId, name: names.get(userId) ?? null };
    };
    return c.json({
      weeks: weeks.map((week) => ({
        weekStarting: week,
        current: week === thisWeek,
        first: person(week, 'first'),
        second: person(week, 'second'),
      })),
      candidates,
    } satisfies OnCallWeeks);
  });

  r.get('/settings', requireRole(...READERS), async (c) =>
    c.json(platformSettings(await loadHolidays(c.env.DB))),
  );

  return r;
}
