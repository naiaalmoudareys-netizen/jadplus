/** Owner app data and offers: R1, O1, N1-N3, C-AZ-1, C-AZ-2, C-AUD-1, ADR 0010. */
import { ownerPortalResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import type { Bindings } from '../src/env.js';
import {
  FILE_URL,
  OWNER_URL,
  demoPortal,
  ownerFile,
  ownerPortalSource,
  salesforcePortal,
} from '../src/portal/source.js';
import { NOW } from './db.js';
import { EMAILS, world } from './emergency-world.js';

describe('owner portal (R1, O1)', () => {
  it('R1: an owner gets their units, payment plan, progress and news, labelled as demo data', async () => {
    const w = await world();
    const res = await w.h.request('/api/owner/portal', { token: w.ownerToken });
    expect(res.status).toBe(200);
    const portal = ownerPortalResponse.parse(await res.json());
    expect(portal.source).toBe('demo');
    expect(portal.deals.map((d) => d.unit?.name)).toEqual(['1204-J188', '506-JAD288-C']);
    expect(portal.payUrl).toBe('https://pay.jadglobal.ae/');
    expect(portal.interestedOfferIds).toEqual([]);
  });

  it('C-AZ-2: the data is looked up by the owner’s own verified email, not by anything the app sends', async () => {
    const w = await world();
    const asked: string[] = [];
    w.h.portal = (env, email, now) => {
      asked.push(email);
      return demoPortal(env, email, now);
    };
    await w.h.request('/api/owner/portal?email=someone@example.com', { token: w.ownerToken });
    expect(asked).toEqual([EMAILS.owner]);
  });

  it('C-AZ-1: tenants and partners cannot open the owner portal', async () => {
    const w = await world();
    expect((await w.h.request('/api/owner/portal', { token: w.tenantToken })).status).toBe(403);
    expect((await w.h.request('/api/owner/portal', { token: w.primaryToken })).status).toBe(403);
  });

  it('T2: when the owner data cannot be loaded, the owner is told to try again (nothing leaks)', async () => {
    const w = await world();
    w.h.portal = () => Promise.reject(new Error('Salesforce down (test)'));
    const res = await w.h.request('/api/owner/portal', { token: w.ownerToken });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('Salesforce down');
  });
});

describe('exclusive offers (N2, N3)', () => {
  const interest = (w: Awaited<ReturnType<typeof world>>, id: string) =>
    w.h.request(`/api/owner/offers/${id}/interest`, { method: 'POST', token: w.ownerToken });

  it('N2: "I\'m interested" is recorded once, audited, and shown back to the owner', async () => {
    const w = await world();
    expect((await interest(w, 'demo-p1')).status).toBe(201);
    expect(await (await interest(w, 'demo-p1')).json()).toMatchObject({ alreadyInterested: true });
    const portal = ownerPortalResponse.parse(
      await (await w.h.request('/api/owner/portal', { token: w.ownerToken })).json(),
    );
    expect(portal.interestedOfferIds).toEqual(['demo-p1']);
    expect(
      w.h.sqlite.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'offer_interest'").all(),
    ).toEqual([{ n: 1 }]);
  });

  it('N3: only an offer the owner can see today; news posts and unknown ids are refused', async () => {
    const w = await world();
    expect((await interest(w, 'demo-p2')).status).toBe(404);
    expect((await interest(w, 'nope')).status).toBe(404);
    expect((await interest(w, 'bad id!')).status).toBe(404);
    w.h.portal = async (env, email, now) => {
      const portal = await demoPortal(env, email, now);
      return {
        ...portal,
        posts: portal.posts.map((p) => (p.id === 'demo-p1' ? { ...p, expires: '2026-11-08' } : p)),
      };
    };
    expect((await interest(w, 'demo-p1')).status).toBe(404); // expired yesterday
  });
});

describe('where owner data comes from (ADR 0010)', () => {
  const env = (overrides: Partial<Bindings>, answer?: unknown) => {
    const calls: string[] = [];
    const fin = {
      fetch: (input: string) => {
        calls.push(input);
        return Promise.resolve(
          new Response(JSON.stringify(answer ?? {}), { headers: { 'content-type': 'application/json' } }),
        );
      },
    } as unknown as Fetcher;
    return {
      calls,
      env: {
        DB: {} as D1Database,
        MEDIA: {} as R2Bucket,
        ENVIRONMENT: 'production',
        INDEX_KEY: '',
        DATA_KEY: '',
        FIN: fin,
        PORTAL_KEY: 'test-portal-key',
        ...overrides,
      } satisfies Bindings,
    };
  };

  it('local and preview always show demo data; real Salesforce data is read only in production', async () => {
    for (const ENVIRONMENT of ['local', 'preview'] as const) {
      const t = env({ ENVIRONMENT });
      expect((await ownerPortalSource(t.env, EMAILS.owner, NOW)).source).toBe('demo');
      expect(t.calls).toEqual([]);
      await expect(salesforcePortal(t.env, EMAILS.owner, NOW)).rejects.toThrow(/production/);
    }
  });

  it('C-PD-1: production asks for one email and passes on only what the app shows', async () => {
    const t = env(
      {},
      {
        person: { name: 'Layla Haddad', nationality: 'Sample' },
        documents: [{ name: 'Passport' }],
        deals: [],
        updates: [],
        posts: [],
      },
    );
    const portal = await ownerPortalSource(t.env, EMAILS.owner, NOW);
    expect(t.calls).toEqual([`${OWNER_URL}?email=${encodeURIComponent(EMAILS.owner)}`]);
    expect(portal.source).toBe('salesforce');
    expect(JSON.stringify(portal)).not.toMatch(/Passport|nationality|Sample/);
  });
});

describe('owner photos and files (ADR 0010)', () => {
  const FILE = '068000000000001AAA';

  it('C-AZ-1/C-VAL-1: owners only, Salesforce file ids only; no real files outside production', async () => {
    const w = await world();
    expect((await w.h.request(`/api/owner/files/${FILE}`, { token: w.ownerToken })).status).toBe(404);
    expect((await w.h.request('/api/owner/files/..%2Fsecret', { token: w.ownerToken })).status).toBe(404);
    expect((await w.h.request(`/api/owner/files/${FILE}`, { token: w.tenantToken })).status).toBe(403);
  });

  const production = (status: number, type: string) => {
    const calls: string[] = [];
    const fin = {
      fetch: (input: string) => {
        calls.push(input);
        return Promise.resolve(new Response('bytes', { status, headers: { 'content-type': type } }));
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
    return { env, calls };
  };

  it('C-PD-1: production asks Salesforce for this owner and file, and passes on images and PDFs only', async () => {
    const ok = production(200, 'image/jpeg');
    expect((await ownerFile(ok.env, EMAILS.owner, FILE))?.type).toBe('image/jpeg');
    expect(ok.calls).toEqual([`${FILE_URL}?email=${encodeURIComponent(EMAILS.owner)}&id=${FILE}`]);
    expect(await ownerFile(production(200, 'text/html').env, EMAILS.owner, FILE)).toBeNull();
    expect(await ownerFile(production(404, 'application/json').env, EMAILS.owner, FILE)).toBeNull();
    await expect(ownerFile(production(500, 'text/plain').env, EMAILS.owner, FILE)).rejects.toThrow(/500/);
  });
});
