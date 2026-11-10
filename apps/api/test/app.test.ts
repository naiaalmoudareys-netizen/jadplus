import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS } from '../src/security.js';
import { harness } from './harness.js';

describe('API foundation', () => {
  it('answers the health check without signing in', async () => {
    const res = await harness().request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'jadplus-api' });
  });

  it('C-HDR: sets every security header on every response, including errors', async () => {
    const h = harness();
    for (const path of ['/api/health', '/api/does-not-exist', '/not-api', '/api/auth/me']) {
      const res = await h.request(path);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(name)).toBe(value);
      expect(res.headers.get('x-request-id')).toBeTruthy();
    }
  });

  it('C-AZ-1: unknown API paths ask for sign-in rather than revealing which routes exist', async () => {
    const res = await harness().request('/api/does-not-exist');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
    expect(await res.json()).toEqual({ error: 'Please sign in.' });
  });

  it('returns a generic 404 without internals outside the API', async () => {
    const res = await harness().request('/not-api');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found.' });
  });

  it('C-SZ-1: refuses oversized bodies', async () => {
    const res = await harness().request('/api/auth/code', {
      method: 'POST',
      body: 'x'.repeat(70 * 1024),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(413);
  });

  it('C-ERR-1/C-LOG-1: unexpected errors return a generic message; the log keeps no personal data', async () => {
    const h = harness();
    h.app.get('/boom', () => {
      throw new Error('Failed for demo@jadplus.ae on +971 50 000 0000');
    });
    const res = await h.request('/boom');
    expect(res.status).toBe(500);
    const body = await res.json<{ error: string; requestId: string }>();
    expect(body.error).toBe('Something went wrong. Please try again.');
    expect(body.requestId).toBeTruthy();
    const logged = h.logs.join('\n');
    expect(logged).toContain('Unhandled error');
    expect(logged).not.toContain('demo@jadplus.ae');
    expect(logged).not.toContain('000 0000');
  });

  it('C-VAL-1: refuses non-JSON bodies, broken JSON and unknown fields', async () => {
    const h = harness();
    const asText = await h.request('/api/auth/code', { method: 'POST', body: 'email=demo@jadplus.ae' });
    expect(asText.status).toBe(415);
    const broken = await h.request('/api/auth/code', {
      method: 'POST',
      body: '{"email":',
      headers: { 'content-type': 'application/json' },
    });
    expect(broken.status).toBe(400);
    const extra = await h.request('/api/auth/code', {
      method: 'POST',
      json: { email: 'demo@jadplus.ae', role: 'jad_admin' },
    });
    expect(extra.status).toBe(400);
    const bad = await h.request('/api/auth/code', { method: 'POST', json: { email: 'not-an-email' } });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(await bad.json())).not.toContain('not-an-email');
  });
});
