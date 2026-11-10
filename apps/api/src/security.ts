/**
 * Security headers on every response (CLAUDE.md "Web security"; docs/SECURITY.md control C-HDR).
 * The API serves JSON only, so the CSP denies everything.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './env.js';

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cache-control': 'no-store',
};

export function securityHeaders(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(name, value);
    c.res.headers.delete('x-powered-by');
  };
}
