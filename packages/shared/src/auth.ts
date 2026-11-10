/**
 * Sign-in and session rules (docs/SECURITY.md C-AUTH-1, C-AUTH-2, C-SES-1; BUILD_SPEC T3, R5, U7).
 * Pure functions: the API stores the state, these decide what the state means.
 */
import type { Role } from './lifecycle.js';

/** One-time code rules (C-AUTH-1). */
export const SIGN_IN_CODE_DIGITS = 6;
export const SIGN_IN_CODE_TTL_MS = 10 * 60_000;
/** Wrong guesses allowed on one code before it is dead. */
export const SIGN_IN_CODE_MAX_FAILURES = 5;

export interface ThrottlePolicy {
  /** Length of the counting window. */
  readonly windowMs: number;
  /** Attempts allowed per window; reaching it locks the key. */
  readonly maxAttempts: number;
  /** How long the key stays locked once the limit is reached. */
  readonly lockoutMs: number;
}

/** Rate limits and lockout (C-AUTH-2). Cloudflare edge rate limiting (C-RL-1) sits in front of these. */
export const THROTTLE = {
  /** Code requests from one network address. */
  sendPerIp: { windowMs: 15 * 60_000, maxAttempts: 10, lockoutMs: 15 * 60_000 },
  /** Code requests for one email: stops someone flooding a person's inbox. */
  sendPerIdentity: { windowMs: 60 * 60_000, maxAttempts: 5, lockoutMs: 60 * 60_000 },
  /** Code checks from one network address. */
  verifyPerIp: { windowMs: 15 * 60_000, maxAttempts: 30, lockoutMs: 15 * 60_000 },
  /** Wrong codes for one email: lockout after repeated failures. */
  verifyFailuresPerIdentity: { windowMs: 60 * 60_000, maxAttempts: 10, lockoutMs: 60 * 60_000 },
} as const satisfies Record<string, ThrottlePolicy>;

export interface ThrottleState {
  readonly windowStartedAt: number;
  readonly attempts: number;
  readonly lockedUntil: number | null;
}

export interface ThrottleCheck {
  readonly allowed: boolean;
  /** Milliseconds until another attempt is allowed (0 when allowed). */
  readonly retryAfterMs: number;
}

/** Whether one more attempt is allowed now. A missing state means no attempts yet. */
export function checkThrottle(state: ThrottleState | null, now: number): ThrottleCheck {
  const lockedUntil = state?.lockedUntil ?? null;
  if (lockedUntil === null || now >= lockedUntil) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: lockedUntil - now };
}

/** The state after counting one more attempt. Reaching the limit locks the key for `lockoutMs`. */
export function recordAttempt(
  state: ThrottleState | null,
  now: number,
  policy: ThrottlePolicy,
): ThrottleState {
  const fresh =
    state === null ||
    now - state.windowStartedAt >= policy.windowMs ||
    (state.lockedUntil !== null && now >= state.lockedUntil);
  const attempts = fresh ? 1 : state.attempts + 1;
  return {
    windowStartedAt: fresh ? now : state.windowStartedAt,
    attempts,
    lockedUntil: attempts >= policy.maxAttempts ? now + policy.lockoutMs : null,
  };
}

/** Which client a session lives in. Admin and partner-office roles exist only in the web console (C-AUTH-4). */
export const CLIENTS = ['mobile', 'console'] as const;
export type Client = (typeof CLIENTS)[number];

export type UserRole = Exclude<Role, 'system'>;

export const ROLE_CLIENT: Readonly<Record<UserRole, Client>> = {
  owner: 'mobile',
  tenant: 'mobile',
  partner: 'mobile',
  partner_admin: 'console',
  jad_admin: 'console',
  jad_viewer: 'console',
};

/** Session lifetimes (C-SES-1). The phone keeps people signed in; the console is short-lived. */
export const SESSION_POLICY: Readonly<
  Record<Client, { readonly idleMs: number; readonly absoluteMs: number }>
> = {
  mobile: { idleMs: 30 * 86_400_000, absoluteMs: 90 * 86_400_000 },
  console: { idleMs: 30 * 60_000, absoluteMs: 12 * 3_600_000 },
};

/** Only push the idle expiry forward (a database write) when the session was last seen this long ago. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60_000;

export interface SessionTimes {
  readonly idleExpiresAt: number;
  readonly absoluteExpiresAt: number;
  readonly revokedAt: number | null;
}

export type SessionStatus = 'valid' | 'revoked' | 'idle_expired' | 'expired';

export function sessionStatus(s: SessionTimes, now: number): SessionStatus {
  if (s.revokedAt !== null) return 'revoked';
  if (now >= s.absoluteExpiresAt) return 'expired';
  if (now >= s.idleExpiresAt) return 'idle_expired';
  return 'valid';
}

/** Expiry times for a session created at `now`. */
export function newSessionTimes(
  client: Client,
  now: number,
): { idleExpiresAt: number; absoluteExpiresAt: number } {
  const policy = SESSION_POLICY[client];
  return { idleExpiresAt: now + policy.idleMs, absoluteExpiresAt: now + policy.absoluteMs };
}

/** New idle expiry after activity at `now`; never beyond the absolute expiry. */
export function touchedIdleExpiry(client: Client, absoluteExpiresAt: number, now: number): number {
  return Math.min(now + SESSION_POLICY[client].idleMs, absoluteExpiresAt);
}

/** A role a person can act in; partner roles name the partner. */
export interface RoleContext {
  readonly role: UserRole;
  readonly partnerId: string | null;
}

/** Order used to pick the starting view when a person has several (they can switch any time, R5/U7). */
const CONTEXT_PRIORITY: readonly UserRole[] = [
  'owner',
  'tenant',
  'partner',
  'partner_admin',
  'jad_admin',
  'jad_viewer',
];

/** The contexts usable on a client, in priority order. */
export function contextsForClient(contexts: readonly RoleContext[], client: Client): RoleContext[] {
  return contexts
    .filter((c) => ROLE_CLIENT[c.role] === client)
    .sort((a, b) => CONTEXT_PRIORITY.indexOf(a.role) - CONTEXT_PRIORITY.indexOf(b.role));
}
