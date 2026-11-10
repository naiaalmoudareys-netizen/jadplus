/** Sessions and role checks: C-SES-1, C-AZ-1, T3 (lost phone), R5/U7 (switch view), U9 (frozen). */
import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTES, requireRole } from '../src/auth/middleware.js';
import { constantTimeEqual, sha256 } from '../src/crypto.js';
import { harness } from './harness.js';

const EMAIL = 'layla.haddad@example.com';
const DAY = 86_400_000;

describe('sessions (C-SES-1)', () => {
  it('C-SES-1: the database holds only the SHA-256 of the session token', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    const token = await h.signIn(EMAIL);
    const row = h.sqlite.prepare('SELECT token_hash FROM sessions').get() as { token_hash: Uint8Array };
    expect(constantTimeEqual(row.token_hash, await sha256(token))).toBe(true);
  });

  it('a valid session reaches protected routes; a missing, malformed or unknown token does not', async () => {
    const h = harness();
    const id = await h.addUser({ email: EMAIL, roles: ['owner'] });
    const token = await h.signIn(EMAIL);
    const me = await h.request('/api/auth/me', { token });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ userId: id, role: 'owner', partnerId: null, client: 'mobile' });
    expect((await h.request('/api/auth/me')).status).toBe(401);
    expect((await h.request('/api/auth/me', { token: 'short' })).status).toBe(401);
    expect((await h.request('/api/auth/me', { token: 'A'.repeat(43) })).status).toBe(401);
  });

  it('C-SES-1: a phone session ends after 30 idle days, even if the token is kept', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    const token = await h.signIn(EMAIL);
    h.clock += 29 * DAY;
    expect((await h.request('/api/auth/me', { token })).status).toBe(200);
    h.clock += 29 * DAY; // activity above extended the idle limit
    expect((await h.request('/api/auth/me', { token })).status).toBe(200);
    h.clock += 31 * DAY;
    expect((await h.request('/api/auth/me', { token })).status).toBe(401);
  });

  it('C-SES-1: a session ends at its absolute limit (90 days on the phone) however active it is', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    const token = await h.signIn(EMAIL);
    for (let day = 20; day < 90; day += 20) {
      h.clock += 20 * DAY;
      expect((await h.request('/api/auth/me', { token })).status).toBe(200);
    }
    h.clock += 20 * DAY;
    expect((await h.request('/api/auth/me', { token })).status).toBe(401);
  });

  it('T3: signing in on a new phone ends the session on the old phone', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    const oldPhone = await h.signIn(EMAIL);
    const newPhone = await h.signIn(EMAIL);
    expect((await h.request('/api/auth/me', { token: oldPhone })).status).toBe(401);
    expect((await h.request('/api/auth/me', { token: newPhone })).status).toBe(200);
  });

  it('sign out ends this session only; sign out everywhere ends all of them (T3)', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner', ['partner_admin', 'p-1']] });
    const phone = await h.signIn(EMAIL, 'mobile');
    const web = await h.signIn(EMAIL, 'console');
    expect((await h.request('/api/auth/sign-out', { method: 'POST', token: web })).status).toBe(204);
    expect((await h.request('/api/auth/me', { token: web })).status).toBe(401);
    expect((await h.request('/api/auth/me', { token: phone })).status).toBe(200);
    const web2 = await h.signIn(EMAIL, 'console');
    expect((await h.request('/api/auth/sign-out-everywhere', { method: 'POST', token: phone })).status).toBe(
      204,
    );
    for (const token of [phone, web2]) expect((await h.request('/api/auth/me', { token })).status).toBe(401);
  });

  it('C-SES-1: revoking the role a session is bound to ends the session at once', async () => {
    const h = harness();
    const id = await h.addUser({ email: EMAIL, roles: ['tenant'] });
    const token = await h.signIn(EMAIL);
    h.sqlite.prepare('UPDATE user_roles SET revoked_at = ? WHERE user_id = ?').run(h.clock, id);
    expect((await h.request('/api/auth/me', { token })).status).toBe(401);
  });
});

describe('switching view (R5, U7)', () => {
  it('R5/U7: an owner who also rents switches view without signing out; the old token stops working', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner', 'tenant'] });
    const ownerToken = await h.signIn(EMAIL);
    const res = await h.request('/api/auth/switch', {
      method: 'POST',
      token: ownerToken,
      json: { role: 'tenant', partnerId: null },
    });
    expect(res.status).toBe(200);
    const { token: tenantToken } = await res.json<{ token: string }>();
    expect(tenantToken).not.toBe(ownerToken);
    expect((await h.request('/api/auth/me', { token: ownerToken })).status).toBe(401);
    expect(await (await h.request('/api/auth/me', { token: tenantToken })).json()).toMatchObject({
      role: 'tenant',
    });
  });

  it('C-AZ-1: nobody can switch into a role they do not hold, or into a console role on the phone', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner', 'jad_admin'] });
    const token = await h.signIn(EMAIL);
    for (const json of [
      { role: 'tenant', partnerId: null },
      { role: 'jad_admin', partnerId: null },
      { role: 'partner', partnerId: 'p-1' },
    ]) {
      expect((await h.request('/api/auth/switch', { method: 'POST', token, json })).status).toBe(403);
    }
  });
});

describe('role checks and deny by default (C-AZ-1)', () => {
  it('C-AZ-1: every API route except the public sign-in routes refuses requests without a session', async () => {
    const h = harness();
    const protectedRoutes = h.app.routes.filter(
      (r) =>
        r.path.startsWith('/api/') && !r.path.includes('*') && !PUBLIC_ROUTES.has(`${r.method} ${r.path}`),
    );
    expect(protectedRoutes.length).toBeGreaterThan(0);
    for (const r of protectedRoutes) {
      expect((await h.request(r.path, { method: r.method })).status, `${r.method} ${r.path}`).toBe(401);
    }
  });

  it('C-AZ-1: a route declared for some roles refuses every other role', async () => {
    const h = harness();
    h.app.get('/api/test/admin-only', requireRole('jad_admin'), (c) => c.json({ ok: true }));
    await h.addUser({ email: EMAIL, roles: ['owner', 'jad_admin'] });
    const phone = await h.signIn(EMAIL, 'mobile');
    const web = await h.signIn(EMAIL, 'console');
    expect((await h.request('/api/test/admin-only', { token: phone })).status).toBe(403);
    expect((await h.request('/api/test/admin-only', { token: web })).status).toBe(200);
  });

  it('U9: a frozen account can look but cannot change anything (except signing out)', async () => {
    const h = harness();
    const id = await h.addUser({ email: EMAIL, roles: ['owner', 'tenant'] });
    const token = await h.signIn(EMAIL);
    h.sqlite.prepare("UPDATE users SET status = 'frozen' WHERE id = ?").run(id);
    expect((await h.request('/api/auth/me', { token })).status).toBe(200);
    const json = { role: 'tenant', partnerId: null };
    expect((await h.request('/api/auth/switch', { method: 'POST', token, json })).status).toBe(403);
    expect((await h.request('/api/auth/sign-out', { method: 'POST', token })).status).toBe(204);
  });
});
