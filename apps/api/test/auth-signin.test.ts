/** Sign-in by email code: C-AUTH-1 (codes), C-AUTH-2 (rate limits, lockout), C-AUTH-4, C-AUD-1, C-LOG-1. */
import { describe, expect, it } from 'vitest';
import { CODE_REJECTED_MESSAGE, CODE_SENT_MESSAGE } from '../src/auth/signin.js';
import { harness, type Harness } from './harness.js';

const EMAIL = 'layla.haddad@example.com';
const MIN = 60_000;

async function askCode(h: Harness, email = EMAIL) {
  return h.request('/api/auth/code', { method: 'POST', json: { email } });
}

async function verify(h: Harness, code: string, email = EMAIL, client = 'mobile') {
  return h.request('/api/auth/verify', { method: 'POST', json: { email, code, client } });
}

function wrong(code: string): string {
  return code === '000000' ? '111111' : '000000';
}

function lastCode(h: Harness): string {
  const sent = h.outbox.at(-1);
  if (sent === undefined) throw new Error('no code sent');
  return sent.code;
}

describe('requesting a code (C-AUTH-1)', () => {
  it('C-AUTH-1: sends a 6-digit code to a registered email', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    const res = await askCode(h);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ message: CODE_SENT_MESSAGE });
    expect(lastCode(h)).toMatch(/^\d{6}$/);
  });

  it('C-AUTH-1: gives the same answer for an unknown email and sends nothing (no account discovery)', async () => {
    const h = harness();
    const res = await askCode(h, 'nobody@example.com');
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ message: CODE_SENT_MESSAGE });
    expect(h.outbox).toEqual([]);
  });

  it('C-AUTH-1/C-PD-2: stores neither the code nor the email in readable form', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    await askCode(h);
    const code = lastCode(h);
    const dump = JSON.stringify(
      ['users', 'sign_in_codes', 'audit_log', 'sign_in_throttle'].map((t) =>
        h.sqlite.prepare(`SELECT * FROM ${t}`).all(),
      ),
      (_k, v: unknown) => (v instanceof Uint8Array ? new TextDecoder().decode(v) : v),
    );
    expect(dump).not.toContain(EMAIL);
    expect(dump).not.toContain(code);
  });

  it('C-AUTH-2: limits code requests per email so nobody can flood an inbox', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    for (let i = 0; i < 4; i++) expect((await askCode(h)).status).toBe(202);
    expect((await askCode(h)).status).toBe(202); // 5th reaches the limit and locks
    const res = await askCode(h);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    h.clock += 61 * MIN;
    expect((await askCode(h)).status).toBe(202);
  });

  it('C-AUTH-2: limits code requests per network address across different emails', async () => {
    const h = harness();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await askCode(h, `person${i}@example.com`)).status);
    expect(statuses.slice(0, 10).every((s) => s === 202)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('verifying a code (C-AUTH-1, C-AUTH-2)', () => {
  it('C-AUTH-1: the right code signs in once; the same code never works twice', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    await askCode(h);
    const code = lastCode(h);
    const ok = await verify(h, code);
    expect(ok.status).toBe(200);
    const body = await ok.json<{ token: string; context: { role: string } }>();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.context.role).toBe('owner');
    const again = await verify(h, code);
    expect(again.status).toBe(401);
    expect(await again.json()).toEqual({ error: CODE_REJECTED_MESSAGE });
  });

  it('C-AUTH-1: a code expires after 10 minutes', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    await askCode(h);
    h.clock += 10 * MIN;
    expect((await verify(h, lastCode(h))).status).toBe(401);
  });

  it('C-AUTH-1: asking again replaces the earlier code', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    await askCode(h);
    const first = lastCode(h);
    await askCode(h);
    if (first !== lastCode(h)) expect((await verify(h, first)).status).toBe(401);
    expect((await verify(h, lastCode(h))).status).toBe(200);
  });

  it('C-AUTH-1: five wrong guesses kill the code, even if the right one comes next', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    await askCode(h);
    const code = lastCode(h);
    for (let i = 0; i < 5; i++) expect((await verify(h, wrong(code))).status).toBe(401);
    expect((await verify(h, code)).status).toBe(401);
  });

  it('C-AUTH-2: repeated failures lock the email out, and the lockout is audited', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    for (let i = 0; i < 10; i++) expect((await verify(h, '123456')).status).toBe(401);
    await askCode(h);
    const locked = await verify(h, lastCode(h));
    expect(locked.status).toBe(429);
    const actions = h.sqlite.prepare('SELECT action FROM audit_log ORDER BY seq').all();
    expect(actions).toContainEqual({ action: 'sign_in_locked_out' });
    h.clock += 61 * MIN;
    await askCode(h);
    expect((await verify(h, lastCode(h))).status).toBe(200);
  });

  it('C-AUTH-4: admin and partner-office roles cannot sign in to the mobile app', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['jad_admin'] });
    await askCode(h);
    expect((await verify(h, lastCode(h))).status).toBe(403);
  });

  it('closed accounts get no code', async () => {
    const h = harness();
    const id = await h.addUser({ email: EMAIL, roles: ['owner'] });
    h.sqlite.prepare("UPDATE users SET status = 'closed' WHERE id = ?").run(id);
    await askCode(h);
    expect(h.outbox).toEqual([]);
  });

  it('C-AUD-1/C-LOG-1: sign-in is audited, and neither logs nor audit hold the email, code or token', async () => {
    const h = harness();
    const id = await h.addUser({ email: EMAIL, roles: ['owner'] });
    const token = await h.signIn(EMAIL);
    const audit = h.sqlite.prepare('SELECT actor_user_id, action FROM audit_log ORDER BY seq').all();
    expect(audit).toEqual([
      { actor_user_id: null, action: 'sign_in_code_sent' },
      { actor_user_id: null, action: 'owner_linked' },
      { actor_user_id: id, action: 'sign_in' },
    ]);
    const evidence = JSON.stringify(h.sqlite.prepare('SELECT * FROM audit_log').all()) + h.logs.join('\n');
    for (const secret of [EMAIL, lastCode(h), token]) expect(evidence).not.toContain(secret);
  });
});
