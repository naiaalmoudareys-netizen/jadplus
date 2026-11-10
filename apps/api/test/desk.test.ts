/** Requests to the JAD+ desk (ADR 0011): C-AZ-1, C-AZ-2, C-VAL-1, C-PD-2, C-AUD-1. */
import { DESK_REQUEST_TYPES, DESK_STATUSES, ownerPortalResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import type { Bindings } from '../src/env.js';
import { DESK_URL, salesforceDeskRequest } from '../src/portal/desk.js';
import { insert, migratedDb, NOW, seedWorld } from './db.js';
import { EMAILS, world, type World } from './emergency-world.js';

const DEAL = 'DEMODEAL0000000001';

const ask = (w: World, json: object, token = w.ownerToken) =>
  w.h.request('/api/owner/desk-requests', { method: 'POST', token, json });

const portal = async (w: World) =>
  ownerPortalResponse.parse(await (await w.h.request('/api/owner/portal', { token: w.ownerToken })).json());

describe('desk requests', () => {
  it('ADR 0011: an owner requests their SPA; asking again while it is open returns the same request', async () => {
    const w = await world();
    const first = await ask(w, { type: 'SPA', dealId: DEAL });
    expect(first.status).toBe(201);
    const again = await ask(w, { type: 'SPA', dealId: DEAL });
    expect(await again.json()).toMatchObject({ existing: true });
    const { deskRequests } = await portal(w);
    expect(deskRequests.map((r) => [r.type, r.status, r.unitName])).toEqual([['SPA', 'New', '1204-J188']]);
    expect(
      w.h.sqlite.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'desk_request_created'").all(),
    ).toEqual([{ n: 1 }]);
  });

  it('C-VAL-1: a document needs a residence; contact changes need details; unknown types refused', async () => {
    const w = await world();
    expect((await ask(w, { type: 'SPA', dealId: null })).status).toBe(400);
    expect((await ask(w, { type: 'Update my contact details', dealId: null })).status).toBe(400);
    expect((await ask(w, { type: 'Free villa', dealId: null })).status).toBe(400);
  });

  it('C-AZ-2: only the owner’s own residence; tenants and partners cannot ask', async () => {
    const w = await world();
    expect((await ask(w, { type: 'NOC', dealId: '006OTHER000000001A' })).status).toBe(404);
    expect((await ask(w, { type: 'NOC', dealId: DEAL }, w.tenantToken)).status).toBe(403);
    expect((await ask(w, { type: 'NOC', dealId: DEAL }, w.primaryToken)).status).toBe(403);
  });

  it('C-PD-2: what the owner writes (e.g. a new mobile number) is stored encrypted', async () => {
    const w = await world();
    const res = await ask(w, {
      type: 'Update my contact details',
      dealId: null,
      details: 'New mobile +971 50 000 0000',
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(w.h.sqlite.prepare('SELECT * FROM desk_requests').all())).not.toContain('000 0000');
  });
});

describe('desk requests in production (Salesforce)', () => {
  it('ADR 0011: sends one request for this owner to the finance worker and reads the answer', async () => {
    const sent: { url: string; body: unknown }[] = [];
    const fin = {
      fetch: (url: string, init: RequestInit) => {
        sent.push({ url, body: JSON.parse(typeof init.body === 'string' ? init.body : '{}') as unknown });
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: 'a0Y000000000001AAA', name: 'JR-00041', status: 'New', existing: false }),
          ),
        );
      },
    } as unknown as Fetcher;
    const env: Bindings = {
      DB: {} as D1Database,
      MEDIA: {} as R2Bucket,
      ENVIRONMENT: 'production',
      INDEX_KEY: '',
      DATA_KEY: '',
      FIN: fin,
      PORTAL_KEY: 'test-portal-key',
    };
    const answer = await salesforceDeskRequest(env, EMAILS.owner, {
      type: 'SPA',
      dealId: DEAL,
      details: null,
    });
    expect(answer).toEqual({ id: 'a0Y000000000001AAA', name: 'JR-00041', status: 'New', existing: false });
    expect(sent).toEqual([
      { url: DESK_URL, body: { email: EMAILS.owner, deal: DEAL, type: 'SPA', details: null, source: 'App' } },
    ]);
  });
});

describe('desk_requests mirrors desk.ts (no drift)', () => {
  it('every type and status in desk.ts is accepted, and nothing else', () => {
    const db = migratedDb();
    seedWorld(db);
    const row = { user_id: 'u-owner', created_at: NOW };
    DESK_REQUEST_TYPES.forEach((type, i) => {
      insert(db, 'desk_requests', { id: `t-${String(i)}`, ...row, type });
    });
    DESK_STATUSES.forEach((status, i) => {
      insert(db, 'desk_requests', { id: `s-${String(i)}`, ...row, type: 'Other', status });
    });
    expect(() => {
      insert(db, 'desk_requests', { id: 'bad', ...row, type: 'Villa' });
    }).toThrow(/CHECK/);
  });
});
