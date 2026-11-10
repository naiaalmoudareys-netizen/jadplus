/** The app's API client and session (C-SES-1, C-VAL-1, T3), against a fake API. No phone needed. */
import { meResponse, partnerJobsResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { ApiError, OFFLINE_MESSAGE, createApiClient } from '../src/api/client.js';
import { identifierBody } from '../src/api/endpoints.js';
import { apiBaseUrl } from '../src/config.js';
import { fileName } from '../src/portal/filename.js';
import { SessionController, type TokenStore } from '../src/session/session.js';

const TOKEN = 'a'.repeat(43);
const ROTATED = 'b'.repeat(43);
const ME = { userId: 'u-1', role: 'partner', partnerId: 'p-1', client: 'mobile', contexts: [], csrf: null };

interface Call {
  url: string;
  method: string;
  auth: string | null;
  body: unknown;
}

type Route = (call: Call) => Response;

function fakeApi(routes: Record<string, Route>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fake = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const call = {
      url,
      method,
      auth: headers.get('authorization'),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
    };
    calls.push(call);
    const route = routes[`${method} ${new URL(url).pathname}`];
    if (route === undefined) return Promise.reject(new TypeError('Network request failed'));
    return Promise.resolve(route(call));
  };
  return { fetch: fake, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function memoryStore(initial: string | null = null): TokenStore & { value: string | null } {
  const store = {
    value: initial,
    read: () => Promise.resolve(store.value),
    write: (t: string) => {
      store.value = t;
      return Promise.resolve();
    },
    clear: () => {
      store.value = null;
      return Promise.resolve();
    },
  };
  return store;
}

function controller(routes: Record<string, Route>, store = memoryStore()) {
  const api = fakeApi(routes);
  const c = new SessionController(store, (token, onUnauthorized) =>
    createApiClient({ baseUrl: 'https://api.example.test', fetch: api.fetch, token, onUnauthorized }),
  );
  return { c, store, calls: api.calls };
}

const session = (token: string) => ({
  token,
  expiresAt: 1,
  context: { role: 'partner', partnerId: 'p-1' },
  contexts: [],
});

describe('API client', () => {
  it('C-SES-1: sends the token as a Bearer header and validates the answer', async () => {
    const api = fakeApi({ 'GET /api/auth/me': () => json(ME) });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: api.fetch,
      token: () => TOKEN,
      onUnauthorized: () => undefined,
    });
    expect(await client.get('/api/auth/me', meResponse)).toMatchObject({ role: 'partner' });
    expect(api.calls[0]?.auth).toBe(`Bearer ${TOKEN}`);
  });

  it('C-VAL-1: an answer that does not match the contract is an error, never guessed at', async () => {
    const api = fakeApi({ 'GET /api/partner/jobs': () => json({ jobs: [{ id: 1 }] }) });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: api.fetch,
      token: () => TOKEN,
      onUnauthorized: () => undefined,
    });
    await expect(client.get('/api/partner/jobs', partnerJobsResponse)).rejects.toBeInstanceOf(ApiError);
  });

  it('shows the API’s own message on errors, and a plain one when offline', async () => {
    const api = fakeApi({
      'POST /api/x': () => json({ error: 'Too many attempts. Please wait and try again.' }, 429),
    });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: api.fetch,
      token: () => null,
      onUnauthorized: () => undefined,
    });
    await expect(client.postNoContent('/api/x')).rejects.toMatchObject({
      status: 429,
      message: 'Too many attempts. Please wait and try again.',
    });
    await expect(client.postNoContent('/api/offline')).rejects.toMatchObject({
      status: 0,
      message: OFFLINE_MESSAGE,
    });
  });

  it('C-SES-1: only https outside development', () => {
    expect(apiBaseUrl('https://api.jadplus.ae/', false)).toBe('https://api.jadplus.ae');
    expect(() => apiBaseUrl('http://api.jadplus.ae', false)).toThrow(/https/);
    expect(apiBaseUrl('http://192.168.1.20:8787', true)).toBe('http://192.168.1.20:8787');
    expect(() => apiBaseUrl(undefined, true)).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it('C-AUTH-3: one box takes an email or a mobile number', () => {
    expect(identifierBody(' demo@jadplus.ae ')).toEqual({ email: 'demo@jadplus.ae' });
    expect(identifierBody('050 000 0000')).toEqual({ phone: '050 000 0000' });
  });
});

describe('session', () => {
  it('C-SES-1: signing in keeps the token only in the secure store, then loads who is signed in', async () => {
    const { c, store, calls } = controller({
      'POST /api/auth/verify': () => json(session(TOKEN)),
      'GET /api/auth/me': () => json(ME),
    });
    await c.verify('demo@jadplus.ae', '123456');
    expect(store.value).toBe(TOKEN);
    expect(c.state).toMatchObject({ status: 'signed_in', me: { role: 'partner' } });
    expect(calls[0]?.body).toEqual({ email: 'demo@jadplus.ae', code: '123456', client: 'mobile' });
  });

  it('C-SES-1: a stored token the API rejects is wiped and the person is signed out', async () => {
    const { c, store } = controller(
      { 'GET /api/auth/me': () => json({ error: 'Sign in again.' }, 401) },
      memoryStore(TOKEN),
    );
    await c.restore();
    expect(c.state.status).toBe('signed_out');
    expect(store.value).toBeNull();
  });

  it('T2: offline at start keeps the token and offers to try again', async () => {
    const { c, store } = controller({}, memoryStore(TOKEN));
    await c.restore();
    expect(c.state.status).toBe('offline');
    expect(store.value).toBe(TOKEN);
  });

  it('R5: switching view stores the new (rotated) token', async () => {
    const { c, store } = controller(
      { 'GET /api/auth/me': () => json(ME), 'POST /api/auth/switch': () => json(session(ROTATED)) },
      memoryStore(TOKEN),
    );
    await c.restore();
    await c.switchTo({ role: 'owner', partnerId: null });
    expect(store.value).toBe(ROTATED);
  });

  it('T3: "sign out everywhere" asks the API, and the phone forgets the token even if the call fails', async () => {
    const ok = controller(
      {
        'GET /api/auth/me': () => json(ME),
        'POST /api/auth/sign-out-everywhere': () => new Response(null, { status: 204 }),
      },
      memoryStore(TOKEN),
    );
    await ok.c.restore();
    await ok.c.signOut(true);
    expect(ok.calls.at(-1)?.url).toContain('/api/auth/sign-out-everywhere');
    expect(ok.store.value).toBeNull();

    const offline = controller({ 'GET /api/auth/me': () => json(ME) }, memoryStore(TOKEN));
    await offline.c.restore();
    await expect(offline.c.signOut()).rejects.toBeInstanceOf(ApiError);
    expect(offline.store.value).toBeNull();
    expect(offline.c.state.status).toBe('signed_out');
  });
});

describe('documents (ADR 0010)', () => {
  it('C-SES-1: a document is fetched with the session, and only PDFs and images are accepted', async () => {
    const api = fakeApi({
      'GET /api/owner/files/demo-doc-passport': () =>
        new Response('%PDF-1.4', { headers: { 'content-type': 'application/pdf' } }),
      'GET /api/owner/files/evil': () =>
        new Response('<script>', { headers: { 'content-type': 'text/html' } }),
    });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: api.fetch,
      token: () => TOKEN,
      onUnauthorized: () => undefined,
    });
    const file = await client.download('/api/owner/files/demo-doc-passport');
    expect(file.type).toBe('application/pdf');
    expect(new TextDecoder().decode(file.bytes)).toBe('%PDF-1.4');
    expect(api.calls[0]?.auth).toBe(`Bearer ${TOKEN}`);
    await expect(client.download('/api/owner/files/evil')).rejects.toBeInstanceOf(ApiError);
  });

  it('saved documents get a safe name, never one taken from the server', () => {
    expect(fileName('Receipt DEMO-R-1001', 'application/pdf')).toBe('Receipt-DEMO-R-1001.pdf');
    expect(fileName('../../etc/passwd', 'image/jpeg')).toBe('etc-passwd.jpg');
    expect(fileName('', 'text/html')).toBe('document.bin');
  });
});
