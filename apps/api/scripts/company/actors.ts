/**
 * People acting in the demo company. Each actor signs in exactly as the apps do (email code; the console
 * gets its session cookie), from its own fictional address (TEST-NET ranges), and signs in again when its session
 * has run out in simulated time. Every call must succeed: an unexpected answer stops the generator with the
 * path and the API's error, never any personal data.
 */
import type { CompanyWorld } from './world.js';

export type Client = 'mobile' | 'console';

export interface Actor {
  readonly email: string;
  readonly client: Client;
  readonly ip: string;
  token: string | null;
}

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`${path} answered ${String(status)}: ${body.slice(0, 300)}`);
  }
}

let addresses = 0;

export function actor(email: string, client: Client): Actor {
  addresses += 1;
  const n = addresses;
  return {
    email,
    client,
    ip: `198.51.${String(100 + Math.floor(n / 250))}.${String((n % 250) + 1)}`,
    token: null,
  };
}

async function raw(w: CompanyWorld, a: Actor, path: string, init: RequestInit & { json?: unknown }) {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('cf-connecting-ip', a.ip);
  if (a.token !== null) headers.set('authorization', `Bearer ${a.token}`);
  if (json !== undefined) headers.set('content-type', 'application/json');
  const body = json === undefined ? rest.body : JSON.stringify(json);
  return w.app.request(path, { ...rest, headers, body: body ?? null }, w.env);
}

export async function signIn(w: CompanyWorld, a: Actor): Promise<void> {
  a.token = null;
  const code = await raw(w, a, '/api/auth/code', { method: 'POST', json: { email: a.email } });
  if (code.status !== 200 && code.status !== 202)
    throw new ApiFailure(code.status, '/api/auth/code', await code.text());
  const sent = w.outbox.at(-1);
  if (sent?.to !== a.email) throw new Error('No sign-in code was sent (is this person known to JAD+?)');
  const res = await raw(w, a, '/api/auth/verify', {
    method: 'POST',
    json: { email: a.email, code: sent.code, client: a.client },
  });
  if (res.status !== 200) throw new ApiFailure(res.status, '/api/auth/verify', await res.text());
  if (a.client === 'mobile') {
    a.token = (await res.json<{ token: string }>()).token;
    return;
  }
  // The console's token is only in its HttpOnly cookie (ADR 0022); in process it is sent back as a Bearer header.
  const cookie = /__Host-jadplus=([A-Za-z0-9_-]{43})/.exec(res.headers.get('set-cookie') ?? '');
  if (cookie?.[1] === undefined) throw new Error('No console session cookie');
  a.token = cookie[1];
}

/** One API call as `a`; signs in first (or again after expiry). Returns the parsed JSON answer. */
export async function call<T = Record<string, unknown>>(
  w: CompanyWorld,
  a: Actor,
  method: string,
  path: string,
  json?: unknown,
  expected: readonly number[] = [200, 201, 204],
): Promise<T> {
  if (a.token === null) await signIn(w, a);
  let res = await raw(w, a, path, json === undefined ? { method } : { method, json });
  if (res.status === 401) {
    await signIn(w, a);
    res = await raw(w, a, path, json === undefined ? { method } : { method, json });
  }
  const text = await res.text();
  if (!expected.includes(res.status)) throw new ApiFailure(res.status, `${method} ${path}`, text);
  return (text === '' ? {} : JSON.parse(text)) as T;
}

/** Uploads a file (photo or PDF) as the raw body, as the apps do. */
export async function upload<T = Record<string, unknown>>(
  w: CompanyWorld,
  a: Actor,
  path: string,
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
): Promise<T> {
  if (a.token === null) await signIn(w, a);
  const send = () =>
    raw(w, a, path, { method: 'POST', body: bytes, headers: { 'content-type': contentType } });
  let res = await send();
  if (res.status === 401) {
    await signIn(w, a);
    res = await send();
  }
  const text = await res.text();
  if (res.status !== 201 && res.status !== 200) throw new ApiFailure(res.status, `POST ${path}`, text);
  return JSON.parse(text) as T;
}

export const get = <T = Record<string, unknown>>(w: CompanyWorld, a: Actor, path: string): Promise<T> =>
  call<T>(w, a, 'GET', path);
export const post = <T = Record<string, unknown>>(
  w: CompanyWorld,
  a: Actor,
  path: string,
  json: unknown = {},
): Promise<T> => call<T>(w, a, 'POST', path, json);
export const put = <T = Record<string, unknown>>(
  w: CompanyWorld,
  a: Actor,
  path: string,
  json: unknown,
): Promise<T> => call<T>(w, a, 'PUT', path, json);
