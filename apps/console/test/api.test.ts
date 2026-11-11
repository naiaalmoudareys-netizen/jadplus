import { meResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  Api,
  ApiError,
  OFFLINE_MESSAGE,
  SignedOutError,
  UNEXPECTED_MESSAGE,
  apiPath,
  errorMessage,
  photoUrl,
  withQuery,
  type Fetch,
} from '../src/lib/api';
import { reviewDetailText, reviewKindLabel } from '../src/lib/schemas';
import { canChange, sessionFromMe, sessionFromSignIn, viewName } from '../src/lib/session';

interface Sent {
  input: string;
  init: RequestInit;
}

function fakeApi(answer: () => Response, csrf: string | null = 'csrf-token-0123456789abcdef') {
  const sent: Sent[] = [];
  let signedOut = 0;
  const fetch: Fetch = (input, init) => {
    sent.push({ input, init });
    return Promise.resolve(answer());
  };
  const api = new Api({
    fetch,
    csrf: () => csrf,
    onSignedOut: () => {
      signedOut += 1;
    },
  });
  return { api, sent, signedOut: () => signedOut };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ok = z.object({ ok: z.boolean() });

function headersOf(s: Sent | undefined): Record<string, string> {
  return (s?.init.headers ?? {}) as Record<string, string>;
}

describe('API client (ADR 0022, C-VAL-1, C-WEB-2)', () => {
  it('C-WEB-2: sends the anti-forgery token on changes, never on reads; cookie same-origin only', async () => {
    const { api, sent } = fakeApi(() => json({ ok: true }));
    await api.get('/api/admin/partners', ok);
    await api.post('/api/partner/team', { name: 'Layla Haddad' }, ok);
    expect(headersOf(sent[0])).not.toHaveProperty('x-jadplus-csrf');
    expect(headersOf(sent[1])['x-jadplus-csrf']).toBe('csrf-token-0123456789abcdef');
    expect(headersOf(sent[1])['content-type']).toBe('application/json');
    expect(sent[1]?.init.body).toBe(JSON.stringify({ name: 'Layla Haddad' }));
    for (const s of sent) {
      expect(s.init.credentials).toBe('same-origin');
      expect(s.init.cache).toBe('no-store');
    }
  });

  it('C-VAL-1: an answer that does not match its schema is refused', async () => {
    const { api } = fakeApi(() => json({ ok: 'yes' }));
    await expect(api.get('/api/x', ok)).rejects.toThrow(UNEXPECTED_MESSAGE);
    const notJson = fakeApi(() => new Response('<html>', { status: 200 }));
    await expect(notJson.api.get('/api/x', ok)).rejects.toThrow(UNEXPECTED_MESSAGE);
  });

  it('shows the API’s own message for an error, and a plain one otherwise', async () => {
    const { api } = fakeApi(() => json({ error: 'Choose an active technician from your team.' }, 400));
    await expect(api.post('/api/x', {}, ok)).rejects.toThrow('Choose an active technician from your team.');
    const bare = fakeApi(() => new Response('oops', { status: 502 }));
    await expect(bare.api.get('/api/x', ok)).rejects.toThrow('Something went wrong (502). Please try again.');
    const offline = new Api({
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
      csrf: () => null,
      onSignedOut: () => undefined,
    });
    await expect(offline.get('/api/x', ok)).rejects.toThrow(OFFLINE_MESSAGE);
  });

  it('C-SES-1: a 401 on a signed-in call signs the console out; on sign-in it is a wrong code', async () => {
    const answer = () => json({ error: 'Please sign in.' }, 401);
    const signedIn = fakeApi(answer);
    await expect(signedIn.api.get('/api/auth/me', meResponse)).rejects.toBeInstanceOf(SignedOutError);
    expect(signedIn.signedOut()).toBe(1);
    const signingIn = fakeApi(() => json({ error: 'That code is not right.' }, 401));
    const err = await signingIn.api
      .post('/api/auth/verify', {}, ok, { signedIn: false })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(SignedOutError);
    expect(errorMessage(err)).toBe('That code is not right.');
    expect(signingIn.signedOut()).toBe(0);
  });

  it('accepts an empty answer where nothing is needed (204 on sign-out)', async () => {
    const { api, sent } = fakeApi(() => new Response(null, { status: 204 }));
    await expect(api.postOnly('/api/auth/sign-out')).resolves.toBeUndefined();
    expect(headersOf(sent[0])).not.toHaveProperty('content-type');
  });

  it('encodes every part of a path, so an id cannot change where a call goes', () => {
    expect(apiPath('requests', '../admin')).toBe('/api/requests/..%2Fadmin');
    expect(photoUrl('r1', 'p 2')).toBe('/api/requests/r1/photos/p%202');
    expect(errorMessage(new Error('internal detail'))).toBe(UNEXPECTED_MESSAGE);
  });
});

describe('API client: other methods, files and queries (ADR 0025)', () => {
  it('C-WEB-2: PUT and DELETE carry the anti-forgery token like POST', async () => {
    const { api, sent } = fakeApi(() => json({ ok: true }));
    await api.put('/api/admin/guide', { a: 1 }, ok);
    await api.delete('/api/admin/guide/g1', ok);
    expect(sent.map((s) => s.init.method)).toEqual(['PUT', 'DELETE']);
    expect(headersOf(sent[0])['x-jadplus-csrf']).toBe('csrf-token-0123456789abcdef');
    expect(headersOf(sent[0])['content-type']).toBe('application/json');
    expect(headersOf(sent[1])['x-jadplus-csrf']).toBe('csrf-token-0123456789abcdef');
    expect(headersOf(sent[1])).not.toHaveProperty('content-type');
    expect(sent[1]?.init.body).toBeUndefined();
  });

  it('S7: a PDF upload is the raw file with its own type, and the token', async () => {
    const { api, sent } = fakeApi(() => json({ ok: true }, 201));
    const pdf = new Blob(['%PDF-1.7 demo'], { type: 'application/pdf' });
    await api.upload('/api/partner/documents/insurance?expiresOn=2027-01-31', pdf, 'application/pdf', ok);
    expect(sent[0]?.init.method).toBe('POST');
    expect(sent[0]?.init.body).toBe(pdf);
    expect(headersOf(sent[0])['content-type']).toBe('application/pdf');
    expect(headersOf(sent[0])['x-jadplus-csrf']).toBe('csrf-token-0123456789abcdef');
  });

  it('reads a file whole, and still shows the API’s message when it refuses', async () => {
    const { api, sent } = fakeApi(() => new Response('a,b\r\n1,2\r\n', { status: 200 }));
    const blob = await api.file('/api/admin/reports/monthly.csv?month=2026-10');
    expect(await blob.text()).toBe('a,b\r\n1,2\r\n');
    expect(headersOf(sent[0])).not.toHaveProperty('x-jadplus-csrf');
    const refused = fakeApi(() => json({ error: 'Not found.' }, 404));
    await expect(refused.api.file('/api/admin/partner-documents/x/file')).rejects.toThrow('Not found.');
  });

  it('builds query strings, leaving out empty values and encoding the rest', () => {
    expect(withQuery('/api/admin/desk-requests', { status: null })).toBe('/api/admin/desk-requests');
    expect(withQuery('/api/admin/desk-requests', { status: 'In progress' })).toBe(
      '/api/admin/desk-requests?status=In+progress',
    );
    expect(withQuery('/api/admin/people', { q: 'a&b=c', x: '', y: undefined })).toBe(
      '/api/admin/people?q=a%26b%3Dc',
    );
  });
});

describe('session (ADR 0022)', () => {
  const office = { role: 'partner_admin' as const, partnerId: 'p1' };
  const contexts = [office, { role: 'jad_admin' as const, partnerId: null }];

  it('restores a console session from /me, never a phone one', () => {
    const me = { userId: 'u1', role: 'jad_admin' as const, partnerId: null, contexts, csrf: 'x'.repeat(43) };
    expect(sessionFromMe({ ...me, client: 'console' })).toEqual({
      role: 'jad_admin',
      partnerId: null,
      contexts,
      csrf: 'x'.repeat(43),
    });
    expect(sessionFromMe({ ...me, client: 'mobile', csrf: null })).toBeNull();
    expect(
      sessionFromSignIn({ expiresAt: 1, context: office, contexts, csrf: 'y'.repeat(43) }),
    ).toMatchObject({ role: 'partner_admin', partnerId: 'p1' });
  });

  it('R5/U7: names each view; viewers and office staff are told apart from JAD+ Admin', () => {
    expect(viewName({ role: 'jad_admin', partnerId: null }, contexts)).toBe('JAD+ Admin');
    expect(viewName({ role: 'jad_viewer', partnerId: null }, contexts)).toBe('JAD+ Admin (read only)');
    expect(viewName({ role: 'partner_admin', partnerId: 'p1' }, contexts)).toBe('Partner office');
    const two = [...contexts, { role: 'partner_admin' as const, partnerId: 'p2' }];
    expect(viewName({ role: 'partner_admin', partnerId: 'p2' }, two)).toBe('Partner office 2');
  });

  it('C-AZ-1: a JAD+ viewer cannot change anything', () => {
    expect(canChange('jad_admin')).toBe(true);
    expect(canChange('partner_admin')).toBe(true);
    expect(canChange('jad_viewer')).toBe(false);
  });
});

describe('partner review list (S6, S7)', () => {
  it('describes each flag in plain words', () => {
    expect(reviewKindLabel('missed_emergencies')).toBe('Missed emergencies (2 or more in 90 days)');
    expect(reviewKindLabel('something_new')).toBe('something new');
    expect(reviewDetailText({ average: 3.4, ratings: 5 })).toBe('average 3.4 from 5 ratings');
    expect(reviewDetailText({ reason: 'Insurance lapsed' })).toBe('Insurance lapsed');
    expect(reviewDetailText({ document: 'insurance', expiresOn: '2026-12-01' })).toBe(
      'Insurance expires 1 Dec 2026',
    );
    expect(reviewDetailText({})).toBeNull();
    expect(reviewDetailText(null)).toBeNull();
  });
});
