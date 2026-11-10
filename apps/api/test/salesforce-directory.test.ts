/** The Salesforce link through the finance worker: C-AUTH-3, C-VAL-1, and the preview never touches it. */
import { describe, expect, it } from 'vitest';
import { IDENTITY_URL, financeWorkerDirectory } from '../src/salesforce/directory.js';
import type { Bindings } from '../src/env.js';
import { ownerRecord } from './harness.js';

interface Seen {
  url: string;
  headers: Headers;
}

function env(answer: Response, overrides: Partial<Bindings> = {}): { env: Bindings; seen: Seen[] } {
  const seen: Seen[] = [];
  const fin = {
    fetch: (input: string, init?: RequestInit) => {
      seen.push({ url: input, headers: new Headers(init?.headers) });
      return Promise.resolve(answer);
    },
  } as unknown as Fetcher;
  return {
    seen,
    env: {
      DB: {} as D1Database,
      MEDIA: {} as R2Bucket,
      ENVIRONMENT: 'production',
      INDEX_KEY: '',
      DATA_KEY: '',
      FIN: fin,
      PORTAL_KEY: 'test-portal-key',
      ...overrides,
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('financeWorkerDirectory', () => {
  it('C-AUTH-3: asks the finance worker about one email or number, with the shared secret', async () => {
    const answer = ownerRecord('layla.haddad@example.com');
    const t = env(json(answer));
    expect(await financeWorkerDirectory(t.env, { kind: 'phone', value: '+971500000000' })).toEqual(answer);
    expect(t.seen).toHaveLength(1);
    expect(t.seen[0]?.url).toBe(`${IDENTITY_URL}?phone=%2B971500000000`);
    expect(t.seen[0]?.headers.get('x-portal-key')).toBe('test-portal-key');
  });

  it('C-VAL-1: a malformed answer from Salesforce is refused, not trusted', async () => {
    const t = env(json({ found: true, shared: false, person: null, units: [{ unitId: 'bad' }] }));
    await expect(financeWorkerDirectory(t.env, { kind: 'email', value: 'a@example.com' })).rejects.toThrow();
  });

  it('a failed call is an error (never read as "not an owner")', async () => {
    const t = env(json({ error: 'down' }, 502));
    await expect(financeWorkerDirectory(t.env, { kind: 'email', value: 'a@example.com' })).rejects.toThrow(
      /502/,
    );
  });

  it('the private preview (demo data only) never calls Salesforce; nor does an unconfigured Worker', async () => {
    const preview = env(json(ownerRecord(null)), { ENVIRONMENT: 'preview' });
    await expect(
      financeWorkerDirectory(preview.env, { kind: 'email', value: 'a@example.com' }),
    ).rejects.toThrow(/preview/);
    expect(preview.seen).toEqual([]);
    const unset = env(json(ownerRecord(null)), { PORTAL_KEY: '' });
    await expect(
      financeWorkerDirectory(unset.env, { kind: 'email', value: 'a@example.com' }),
    ).rejects.toThrow(/not configured/);
  });
});
