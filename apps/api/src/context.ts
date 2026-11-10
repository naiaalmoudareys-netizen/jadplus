/**
 * Per-request context: clock, keys, redacting logger and hashed client address.
 * Things that differ between production and tests (clock, email delivery) are passed in as Deps.
 */
import type { MiddlewareHandler } from 'hono';
import { blindIndex, importKeys, type Keys } from './crypto.js';
import type { AppEnv, Bindings } from './env.js';
import { createLogger, type LogSink } from './logger.js';

export interface Deps {
  /** Current time in UTC milliseconds. */
  readonly now: () => number;
  /** Delivers a sign-in code. Must never log the code or the address (C-LOG-1). */
  readonly sendSignInCode: (env: Bindings, email: string, code: string) => Promise<void>;
  /**
   * The JAD+ user id of the owner of a Salesforce unit, or null if the unit or its owner is unknown.
   * Backed by the Salesforce proxy, which is not connected yet (ADR 0004): until then it rejects.
   */
  readonly unitOwner: (env: Bindings, sfUnitId: string) => Promise<string | null>;
  /** Where log lines go; defaults to the console. */
  readonly logSink?: LogSink;
}

/** Keys are imported once per Worker instance; the cache is keyed by the secret values themselves. */
let keyCache: { readonly source: string; readonly keys: Promise<Keys> } | null = null;

function keysFor(env: Bindings): Promise<Keys> {
  const source = `${env.INDEX_KEY}:${env.DATA_KEY}`;
  if (keyCache?.source !== source) keyCache = { source, keys: importKeys(env.INDEX_KEY, env.DATA_KEY) };
  return keyCache.keys;
}

export function requestContext(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('now', deps.now());
    c.set('log', createLogger({ requestId: c.get('requestId') }, deps.logSink));
    const keys = await keysFor(c.env);
    c.set('keys', keys);
    // Cloudflare sets CF-Connecting-IP; the address itself is never stored, only its keyed hash.
    c.set('ipHash', await blindIndex(keys, 'ip', c.req.header('cf-connecting-ip') ?? 'unknown'));
    await next();
  };
}
