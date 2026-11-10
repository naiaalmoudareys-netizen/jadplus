/**
 * Deny by default (C-AZ-1): every /api route needs a valid session except the few listed in PUBLIC_ROUTES.
 * Each protected route then declares the roles allowed to call it with requireRole(); object ownership is
 * checked inside the handler with the rules in packages/shared/src/access.ts (C-AZ-2).
 */
import type { UserRole } from '@jadplus/shared';
import type { MiddlewareHandler } from 'hono';
import { ApiError } from '../errors.js';
import type { AppEnv } from '../env.js';
import { resolveSession } from './sessions.js';

/** The only routes reachable without signing in. Changing this list is a security review item. */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  'GET /api/health',
  'POST /api/auth/code',
  'POST /api/auth/verify',
]);

/** 43 base64url characters = 32 random bytes. Anything else is refused without a database lookup. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

function signInRequired(): ApiError {
  return new ApiError(401, 'Please sign in.', { headers: { 'www-authenticate': 'Bearer' } });
}

export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(header ?? '');
  const token = match?.[1];
  return token !== undefined && TOKEN_FORMAT.test(token) ? token : null;
}

export function authenticate(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (PUBLIC_ROUTES.has(`${c.req.method} ${c.req.path}`)) {
      await next();
      return;
    }
    const token = bearerToken(c.req.header('authorization'));
    const session = token === null ? null : await resolveSession(c.env.DB, token, c.get('now'));
    if (session === null) throw signInRequired();
    // U9: a frozen account can still look, but cannot change anything.
    if (
      session.userStatus === 'frozen' &&
      c.req.method !== 'GET' &&
      !c.req.path.startsWith('/api/auth/sign-out')
    ) {
      throw new ApiError(403, 'This account is frozen. Please talk to JAD+ Admin.');
    }
    c.set('auth', session);
    await next();
  };
}

/** Allows the route only for sessions bound to one of `roles`. */
export function requireRole(...roles: readonly UserRole[]): MiddlewareHandler<AppEnv> {
  const allowed: ReadonlySet<UserRole> = new Set(roles);
  return async (c, next) => {
    if (!allowed.has(c.get('auth').role)) throw new ApiError(403, 'Not allowed.');
    await next();
  };
}
