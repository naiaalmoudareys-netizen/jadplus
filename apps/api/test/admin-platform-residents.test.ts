/**
 * JAD+ Admin platform (ADR 0025): building notices and home guide with the residents' read side (V1), owners
 * interested in offers (N2), on-call weeks (E6, E7), settings (E14, E20). C-AZ-1, C-AZ-2, C-AUD-1.
 */
import {
  adminGuideResponse,
  adminNoticesResponse,
  offerInterestsResponse,
  onCallWeeksResponse,
  platformSettings,
  platformSettingsResponse,
  residentGuideResponse,
  residentNoticesResponse,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { describe, expect, it } from 'vitest';
import { authenticate } from '../src/auth/middleware.js';
import { requestContext } from '../src/context.js';
import { encryptField, importKeys } from '../src/crypto.js';
import type { AppEnv } from '../src/env.js';
import { ApiError } from '../src/errors.js';
import { residentBuildingRoutes } from '../src/me/building.js';
import { demoPortal } from '../src/portal/source.js';
import { NOW } from './db.js';
import { rows, world, type World } from './emergency-world.js';
import { TEST_DATA_KEY, TEST_INDEX_KEY } from './harness.js';

const DAY = 86_400_000;
const B = { project: 'JAD 288', building: 'Building B' };

type Setup = World & { admin: string; viewer: string; adminId: string; viewerId: string };

/**
 * The residents' building routes behind the same request context and sign-in check as app.ts, mounted at /api
 * as app.ts will mount them (the harness app is already built, so they get their own small app here).
 */
function residents(w: World) {
  const app = new Hono<AppEnv>();
  app.use('*', requestId());
  app.use(
    '/api/*',
    requestContext({
      now: () => w.h.clock,
      sendSignInCode: () => Promise.reject(new Error('not used')),
      ownerDirectory: () => Promise.reject(new Error('not used')),
      ownerPortal: demoPortal,
      logSink: (line) => w.h.logs.push(line),
    }),
  );
  app.use('/api/*', authenticate());
  app.route('/api', residentBuildingRoutes());
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.message }, err.status);
    throw err;
  });
  return (path: string, token: string) =>
    Promise.resolve(app.request(path, { headers: { authorization: `Bearer ${token}` } }, w.h.env));
}

async function setup(): Promise<Setup & { me: (path: string, token: string) => Promise<Response> }> {
  const w = await world();
  // Another building in the same project (a unit of someone else), so notices can target it.
  w.h.sqlite
    .prepare(
      `INSERT INTO owner_units (user_id, sf_unit_id, sf_deal_id, unit_name, project, building, deal_role, synced_at)
       VALUES (?, 'a0X000000000009AAA', '006000000000009AAA', 'JAD288-C01', 'JAD 288', 'Building C', 'Buyer', ?)`,
    )
    .run(w.tenant, NOW);
  const adminId = await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  const viewerId = await w.h.addUser({ email: 'viewer@jadplus.ae', roles: ['jad_viewer'] });
  return {
    ...w,
    me: residents(w),
    adminId,
    viewerId,
    admin: await w.h.signIn('demo@jadplus.ae', 'console'),
    viewer: await w.h.signIn('viewer@jadplus.ae', 'console'),
  };
}

const send = (w: World, method: string, path: string, token: string, json?: object) =>
  w.h.request(path, { method, token, ...(json === undefined ? {} : { json }) });

const notice = (over: object = {}) => ({
  ...B,
  kind: 'water',
  title: 'Water shut-off',
  body: 'Tank cleaning on Tuesday morning.',
  startsAt: NOW - DAY,
  endsAt: NOW + DAY,
  ...over,
});

const myNotices = async (w: Awaited<ReturnType<typeof setup>>, token: string) =>
  residentNoticesResponse.parse(await (await w.me('/api/me/notices', token)).json()).notices;

describe('building notices (V1)', () => {
  it('V1: owners and tenants see current and soon notices for their building and project, nothing else', async () => {
    const w = await setup();
    const publish = async (over: object) => {
      const res = await send(w, 'POST', '/api/admin/notices', w.admin, notice(over));
      expect(res.status).toBe(201);
      return (await res.json<{ id: string }>()).id;
    };
    const now = await publish({});
    const project = await publish({
      building: null,
      kind: 'lift',
      title: 'Lift service',
      startsAt: NOW + 2 * DAY,
      endsAt: null,
    });
    await publish({ building: 'Building C', title: 'Other building' });
    await publish({ title: 'Far ahead', startsAt: NOW + 30 * DAY, endsAt: null });
    const gone = await publish({ title: 'Withdrawn' });
    expect((await send(w, 'POST', `/api/admin/notices/${gone}/withdraw`, w.admin)).status).toBe(200);
    expect((await send(w, 'POST', `/api/admin/notices/${gone}/withdraw`, w.admin)).status).toBe(404);

    for (const token of [w.ownerToken, w.tenantToken]) {
      const seen = await myNotices(w, token);
      expect(seen.map((n) => [n.id, n.state])).toEqual([
        [now, 'current'],
        [project, 'upcoming'],
      ]);
      expect(Object.keys(seen[0] ?? {})).not.toContain('createdAt');
    }
    expect((await w.me('/api/me/notices', w.primaryToken)).status).toBe(403);
    expect((await w.me('/api/me/notices', w.admin)).status).toBe(403);

    const all = adminNoticesResponse.parse(
      await (await w.h.request('/api/admin/notices?state=all&project=JAD%20288', { token: w.viewer })).json(),
    ).notices;
    expect(all).toHaveLength(5);
    expect(all.find((n) => n.id === gone)?.state).toBe('withdrawn');
    const live = adminNoticesResponse.parse(
      await (await w.h.request('/api/admin/notices', { token: w.viewer })).json(),
    );
    expect(live.notices).toHaveLength(4);
    expect(
      rows(w, "SELECT detail FROM audit_log WHERE action = 'building_notice_published' LIMIT 1"),
    ).toEqual([
      // ADR 0027: how many residents got the in-app item (the owner and the tenant of the unit in Building B).
      {
        detail: JSON.stringify({
          project: 'JAD 288',
          building: 'Building B',
          kind: 'water',
          residentsTold: 2,
        }),
      },
    ]);
  });

  it('V1/C-AZ-1: only JAD+ Admin publishes, for a known building, ending in the future, as plain text', async () => {
    const w = await setup();
    expect((await send(w, 'POST', '/api/admin/notices', w.viewer, notice())).status).toBe(403);
    expect((await send(w, 'POST', '/api/admin/notices', w.ownerToken, notice())).status).toBe(403);
    expect(
      (await send(w, 'POST', '/api/admin/notices', w.admin, notice({ project: 'Unknown' }))).status,
    ).toBe(422);
    const past = notice({ startsAt: NOW - 3 * DAY, endsAt: NOW - DAY });
    expect((await send(w, 'POST', '/api/admin/notices', w.admin, past)).status).toBe(422);
    expect((await send(w, 'POST', '/api/admin/notices', w.admin, notice({ body: '<b>x</b>' }))).status).toBe(
      400,
    );
    expect(rows(w, 'SELECT id FROM building_notices')).toEqual([]);
  });
});

describe('home guide', () => {
  it("V1: the building's own section overrides the project-wide one; upsert keeps one row; delete is audited", async () => {
    const w = await setup();
    const put = (over: object) =>
      send(w, 'PUT', '/api/admin/guide', w.admin, {
        ...B,
        section: 'ac',
        title: 'AC',
        body: 'Project text.',
        ...over,
      });
    expect((await put({ building: null })).status).toBe(201);
    expect(
      (await put({ building: null, section: 'waste', title: 'Waste', body: 'Chute on each floor.' })).status,
    ).toBe(201);
    const own = await put({ body: 'Building B text.' });
    expect(own.status).toBe(201);
    const again = await put({ body: 'Building B text, updated.' });
    expect(again.status).toBe(200);
    expect(rows(w, 'SELECT id FROM home_guide_sections')).toHaveLength(3);

    const guide = residentGuideResponse.parse(
      await (await w.me('/api/me/guide', w.tenantToken)).json(),
    ).places;
    expect(guide.map((p) => [p.building, p.sections.map((s) => s.body)])).toEqual([
      ['Building B', ['Building B text, updated.', 'Chute on each floor.']],
    ]);

    const admin = adminGuideResponse.parse(
      await (await w.h.request('/api/admin/guide?project=JAD%20288', { token: w.viewer })).json(),
    ).sections;
    const { id } = await own.json<{ id: string }>();
    expect(admin.map((s) => s.id)).toContain(id);
    expect((await send(w, 'DELETE', `/api/admin/guide/${id}`, w.viewer)).status).toBe(403);
    expect((await send(w, 'DELETE', `/api/admin/guide/${id}`, w.admin)).status).toBe(200);
    const after = residentGuideResponse.parse(await (await w.me('/api/me/guide', w.ownerToken)).json());
    expect(after.places[0]?.sections.map((s) => s.body)).toEqual(['Project text.', 'Chute on each floor.']);
    expect(rows(w, "SELECT target_id FROM audit_log WHERE action = 'home_guide_section_removed'")).toEqual([
      { target_id: id },
    ]);
  });
});

describe('offer interests (N2)', () => {
  it('N2: sales see who tapped "I\'m interested" with the owner\'s name; viewing is audited; handled once', async () => {
    const w = await setup();
    w.h.sqlite
      .prepare("INSERT INTO offer_interests (id, post_id, user_id, at) VALUES ('oi-1', 'post-1', ?, ?)")
      .run(w.owner, NOW);
    const read = async (query = '') =>
      offerInterestsResponse.parse(
        await (await w.h.request(`/api/admin/offer-interests${query}`, { token: w.viewer })).json(),
      ).interests;
    const open = await read();
    expect(open).toMatchObject([
      { id: 'oi-1', postId: 'post-1', owner: { userId: w.owner, name: 'Layla Haddad' }, handledAt: null },
    ]);
    expect(rows(w, "SELECT detail FROM audit_log WHERE action = 'offer_interests_viewed'")).toEqual([
      { detail: JSON.stringify({ count: 1 }) },
    ]);
    expect((await send(w, 'POST', '/api/admin/offer-interests/oi-1/handled', w.viewer)).status).toBe(403);
    expect((await send(w, 'POST', '/api/admin/offer-interests/oi-1/handled', w.admin)).status).toBe(200);
    expect((await send(w, 'POST', '/api/admin/offer-interests/oi-1/handled', w.admin)).status).toBe(404);
    expect(await read()).toEqual([]);
    expect((await read('?state=all'))[0]?.handledAt).toBe(NOW);
    expect((await w.h.request('/api/admin/offer-interests', { token: w.ownerToken })).status).toBe(403);
  });
});

describe('on-call weeks and settings', () => {
  it('E6/E7: 8 weeks with names, this week marked, and who may be first or second on call', async () => {
    const w = await setup();
    const keys = await importKeys(TEST_INDEX_KEY, TEST_DATA_KEY);
    w.h.sqlite
      .prepare('UPDATE users SET name_enc = ? WHERE id = ?')
      .run(await encryptField(keys, 'Sami Admin', `users.name:${w.adminId}`), w.adminId);
    const put = await send(w, 'PUT', '/api/admin/on-call/2026-11-16', w.admin, {
      first: w.adminId,
      second: w.viewerId,
    });
    expect(put.status).toBe(200);
    const res = await w.h.request('/api/admin/on-call/weeks', { token: w.viewer });
    const { weeks, candidates } = onCallWeeksResponse.parse(await res.json());
    expect(weeks).toHaveLength(8);
    expect(weeks[0]).toEqual({ weekStarting: '2026-11-09', current: true, first: null, second: null });
    expect(weeks[1]).toEqual({
      weekStarting: '2026-11-16',
      current: false,
      first: { userId: w.adminId, name: 'Sami Admin' },
      second: { userId: w.viewerId, name: null },
    });
    expect(candidates).toEqual(
      expect.arrayContaining([
        { userId: w.adminId, name: 'Sami Admin', canBeFirst: true, canBeSecond: true },
        { userId: w.viewerId, name: null, canBeFirst: false, canBeSecond: true },
      ]),
    );
    expect(candidates).toHaveLength(2);
    const later = await w.h.request('/api/admin/on-call/weeks?from=2026-11-16', { token: w.viewer });
    expect(onCallWeeksResponse.parse(await later.json()).weeks[0]?.current).toBe(false);
    expect((await w.h.request('/api/admin/on-call/weeks?from=2026-11-17', { token: w.viewer })).status).toBe(
      400,
    );
  });

  it('E14/E20: settings are read-only facts from the shared rules', async () => {
    const w = await setup();
    const res = await w.h.request('/api/admin/settings', { token: w.viewer });
    expect(platformSettingsResponse.parse(await res.json())).toEqual(platformSettings());
    expect((await w.h.request('/api/admin/settings', { token: w.tenantToken })).status).toBe(403);
  });
});
