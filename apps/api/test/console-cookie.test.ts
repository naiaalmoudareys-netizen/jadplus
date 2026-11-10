/** Console sessions in an HttpOnly cookie with anti-forgery checks (ADR 0022): C-SES-1, C-WEB-2, C-AZ-1. */
import { consoleSessionResponse, meResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { harness, type Harness } from './harness.js';

const ADMIN = 'demo@jadplus.ae';
const CONSOLE = 'http://localhost:5173';

async function consoleSignIn(h: Harness): Promise<{ cookie: string; csrf: string; setCookie: string }> {
  await h.request('/api/auth/code', { method: 'POST', json: { email: ADMIN } });
  const code = h.outbox.at(-1)?.code ?? '';
  const res = await h.request('/api/auth/verify', {
    method: 'POST',
    json: { email: ADMIN, code, client: 'console' },
  });
  expect(res.status).toBe(200);
  const body = await res.json<Record<string, unknown>>();
  expect(body).not.toHaveProperty('token');
  const { csrf } = consoleSessionResponse.parse(body);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const token = /__Host-jadplus=([A-Za-z0-9_-]{43})/.exec(setCookie)?.[1] ?? '';
  return { cookie: `__Host-jadplus=${token}`, csrf, setCookie };
}

const change = (h: Harness, cookie: string, headers: Record<string, string>) =>
  h.request('/api/me/preferences', {
    method: 'POST',
    headers: { cookie, ...headers },
    json: { language: 'fr' },
  });

describe('console session cookie (ADR 0022)', () => {
  it('C-SES-1: the token is only in a __Host- cookie that is HttpOnly, Secure and SameSite=Strict', async () => {
    const h = harness();
    await h.addUser({ email: ADMIN, roles: ['jad_admin'] });
    const { setCookie, cookie, csrf } = await consoleSignIn(h);
    expect(setCookie).toMatch(/^__Host-jadplus=/);
    for (const part of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) expect(setCookie).toContain(part);
    expect(setCookie).not.toContain('Domain=');
    // After a page reload the console gets its anti-forgery token back from /me.
    const me = meResponse.parse(await (await h.request('/api/auth/me', { headers: { cookie } })).json());
    expect(me).toMatchObject({ role: 'jad_admin', client: 'console', csrf });
  });

  it('C-WEB-2: a change made with the cookie needs the console origin AND the anti-forgery token', async () => {
    const h = harness();
    await h.addUser({ email: ADMIN, roles: ['jad_admin'] });
    const { cookie, csrf } = await consoleSignIn(h);
    expect((await change(h, cookie, {})).status).toBe(403);
    expect((await change(h, cookie, { origin: 'https://evil.example', 'x-jadplus-csrf': csrf })).status).toBe(
      403,
    );
    expect((await change(h, cookie, { origin: CONSOLE })).status).toBe(403);
    expect((await change(h, cookie, { origin: CONSOLE, 'x-jadplus-csrf': `${csrf}x` })).status).toBe(403);
    expect((await change(h, cookie, { origin: CONSOLE, 'x-jadplus-csrf': csrf })).status).toBe(200);
  });

  it('C-AZ-1: a phone token placed in the cookie is refused; signing out clears the cookie', async () => {
    const h = harness();
    await h.addUser({ email: 'owner@example.com', roles: ['owner'] });
    const phone = await h.signIn('owner@example.com');
    const asCookie = await h.request('/api/auth/me', { headers: { cookie: `__Host-jadplus=${phone}` } });
    expect(asCookie.status).toBe(401);

    await h.addUser({ email: ADMIN, roles: ['jad_admin'] });
    const { cookie, csrf } = await consoleSignIn(h);
    const out = await h.request('/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie, origin: CONSOLE, 'x-jadplus-csrf': csrf },
    });
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toMatch(/__Host-jadplus=;.*Max-Age=0/);
    expect((await h.request('/api/auth/me', { headers: { cookie } })).status).toBe(401);
  });
});
