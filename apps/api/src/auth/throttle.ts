/**
 * Rate limits and lockout stored in D1 (C-AUTH-2). The decision rules are in packages/shared/src/auth.ts.
 */
import { checkThrottle, recordAttempt, type ThrottleCheck, type ThrottlePolicy } from '@jadplus/shared';
import { toHex } from '../crypto.js';

/** Throttle keys: what is being limited, and for which hashed address or identity. */
export type ThrottleScope = 'ip:send' | 'id:send' | 'ip:verify' | 'id:verify';

export function throttleKey(scope: ThrottleScope, hash: Uint8Array): string {
  return `${scope}:${toHex(hash)}`;
}

interface ThrottleRow {
  window_started_at: number;
  attempts: number;
  locked_until: number | null;
}

async function load(db: D1Database, key: string) {
  const row = await db
    .prepare('SELECT window_started_at, attempts, locked_until FROM sign_in_throttle WHERE key = ?')
    .bind(key)
    .first<ThrottleRow>();
  return row === null
    ? null
    : { windowStartedAt: row.window_started_at, attempts: row.attempts, lockedUntil: row.locked_until };
}

export async function isAllowed(db: D1Database, key: string, now: number): Promise<ThrottleCheck> {
  return checkThrottle(await load(db, key), now);
}

/** Counts one attempt. Returns true when this attempt has just locked the key. */
export async function countAttempt(
  db: D1Database,
  key: string,
  now: number,
  policy: ThrottlePolicy,
): Promise<boolean> {
  const next = recordAttempt(await load(db, key), now, policy);
  await db
    .prepare(
      `INSERT INTO sign_in_throttle (key, window_started_at, attempts, locked_until) VALUES (?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET window_started_at = excluded.window_started_at,
         attempts = excluded.attempts, locked_until = excluded.locked_until`,
    )
    .bind(key, next.windowStartedAt, next.attempts, next.lockedUntil)
    .run();
  return next.lockedUntil !== null;
}

export function resetStatement(db: D1Database, key: string): D1PreparedStatement {
  return db.prepare('DELETE FROM sign_in_throttle WHERE key = ?').bind(key);
}
