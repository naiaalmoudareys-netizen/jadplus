/**
 * Console sessions in a cookie (ADR 0003 item 14, ADR 0022; docs/SECURITY.md C-SES-1, C-WEB-2).
 *
 * The web console never sees its session token: it lives in a `__Host-` cookie that is HttpOnly (page scripts
 * cannot read it), Secure, SameSite=Strict and bound to this exact host and path "/". Because a browser sends
 * cookies by itself, every change made with the cookie (any method other than GET/HEAD) must also:
 * - come from an allowed console origin (the Origin header), and
 * - carry the anti-forgery token in the `x-jadplus-csrf` header. The token is an HMAC of the session id with
 *   the server's index key: the console receives it when signing in (and from /api/auth/me after a reload),
 *   and another site can neither read it nor guess it.
 * The phone app keeps sending its token as a Bearer header, which browsers never add on their own.
 */
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { blindIndex, constantTimeEqual, toBase64Url, type Keys } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';

type Ctx = Context<AppEnv>;

/** Sent as "__Host-jadplus" (hono adds the prefix for the "host" option). */
const COOKIE = 'jadplus';
export const CSRF_HEADER = 'x-jadplus-csrf';
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
/** The console's own address while developing (Vite); production origins come from CONSOLE_ORIGINS. */
const LOCAL_CONSOLE = 'http://localhost:5173';

export function setSessionCookie(c: Ctx, token: string, expiresAt: number): void {
  setCookie(c, COOKIE, token, {
    prefix: 'host',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: Math.max(0, Math.floor((expiresAt - c.get('now')) / 1000)),
  });
}

export function clearSessionCookie(c: Ctx): void {
  deleteCookie(c, COOKIE, { prefix: 'host', secure: true, path: '/' });
}

/** The session token from the console cookie, if it has the right shape. */
export function cookieToken(c: Ctx): string | null {
  const value = getCookie(c, COOKIE, 'host');
  return value !== undefined && TOKEN_FORMAT.test(value) ? value : null;
}

/** The anti-forgery token for one console session. */
export async function csrfFor(keys: Keys, sessionId: string): Promise<string> {
  return toBase64Url(await blindIndex(keys, 'csrf', sessionId));
}

function allowedOrigins(c: Ctx): ReadonlySet<string> {
  const listed = (c.env.CONSOLE_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '');
  return new Set(c.env.ENVIRONMENT === 'local' ? [...listed, LOCAL_CONSOLE] : listed);
}

/** For a change made with the cookie: the right origin and the right anti-forgery token, or 403. */
export async function checkCookieChange(c: Ctx, sessionId: string): Promise<void> {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return;
  const origin = c.req.header('origin');
  if (origin === undefined || !allowedOrigins(c).has(origin)) {
    throw new ApiError(403, 'This request did not come from the JAD+ console.');
  }
  const sent = c.req.header(CSRF_HEADER) ?? '';
  const expected = await csrfFor(c.get('keys'), sessionId);
  const encoder = new TextEncoder();
  if (!constantTimeEqual(encoder.encode(sent), encoder.encode(expected))) {
    throw new ApiError(403, 'This request did not come from the JAD+ console.');
  }
}
