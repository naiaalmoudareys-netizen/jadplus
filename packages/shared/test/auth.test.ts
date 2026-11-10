import { describe, expect, it } from 'vitest';
import {
  SIGN_IN_CODE_TTL_MS,
  THROTTLE,
  checkThrottle,
  contextsForClient,
  newSessionTimes,
  recordAttempt,
  sessionStatus,
  touchedIdleExpiry,
  type ThrottleState,
} from '../src/auth.js';

const T0 = Date.UTC(2026, 10, 9, 8, 0, 0);
const MIN = 60_000;

describe('sign-in codes', () => {
  it('C-AUTH-1: codes expire after 10 minutes', () => {
    expect(SIGN_IN_CODE_TTL_MS).toBe(10 * MIN);
  });
});

describe('throttling and lockout (C-AUTH-2)', () => {
  const policy = THROTTLE.verifyFailuresPerIdentity;

  function attempts(n: number, start = T0): ThrottleState | null {
    let state: ThrottleState | null = null;
    for (let i = 0; i < n; i++) state = recordAttempt(state, start + i, policy);
    return state;
  }

  it('allows attempts below the limit', () => {
    expect(checkThrottle(null, T0)).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(checkThrottle(attempts(policy.maxAttempts - 1), T0 + MIN).allowed).toBe(true);
  });

  it('C-AUTH-2: locks out after repeated failures, for the lockout period', () => {
    const locked = attempts(policy.maxAttempts);
    const check = checkThrottle(locked, T0 + MIN);
    expect(check.allowed).toBe(false);
    expect(check.retryAfterMs).toBeGreaterThan(policy.lockoutMs - 2 * MIN);
  });

  it('C-AUTH-2: lifts the lockout once it has run out and starts counting again', () => {
    const locked = attempts(policy.maxAttempts);
    const after = T0 + policy.lockoutMs + MIN;
    expect(checkThrottle(locked, after).allowed).toBe(true);
    expect(recordAttempt(locked, after, policy)).toEqual({
      windowStartedAt: after,
      attempts: 1,
      lockedUntil: null,
    });
  });

  it('C-AUTH-2: attempts spread beyond the window do not add up', () => {
    let state: ThrottleState | null = null;
    for (let i = 0; i < policy.maxAttempts * 2; i++)
      state = recordAttempt(state, T0 + i * policy.windowMs, policy);
    expect(checkThrottle(state, T0 + policy.maxAttempts * 2 * policy.windowMs).allowed).toBe(true);
  });

  it('C-AUTH-2: limits code requests per address and per email, so nobody can flood an inbox', () => {
    expect(THROTTLE.sendPerIdentity.maxAttempts).toBeLessThanOrEqual(5);
    expect(THROTTLE.sendPerIp.maxAttempts).toBeLessThanOrEqual(10);
  });
});

describe('sessions (C-SES-1)', () => {
  it('C-SES-1: a session is valid until it is idle too long, past its absolute limit, or revoked', () => {
    const times = { ...newSessionTimes('console', T0), revokedAt: null };
    expect(sessionStatus(times, T0 + 29 * MIN)).toBe('valid');
    expect(sessionStatus(times, T0 + 30 * MIN)).toBe('idle_expired');
    expect(sessionStatus({ ...times, idleExpiresAt: T0 + 13 * 60 * MIN }, T0 + 12 * 60 * MIN)).toBe(
      'expired',
    );
    expect(sessionStatus({ ...times, revokedAt: T0 + MIN }, T0 + 2 * MIN)).toBe('revoked');
  });

  it('C-SES-1: activity extends the idle limit but never past the absolute limit', () => {
    const { absoluteExpiresAt } = newSessionTimes('mobile', T0);
    expect(touchedIdleExpiry('mobile', absoluteExpiresAt, T0 + MIN)).toBeLessThan(absoluteExpiresAt);
    expect(touchedIdleExpiry('mobile', absoluteExpiresAt, absoluteExpiresAt - MIN)).toBe(absoluteExpiresAt);
  });

  it('C-AUTH-4: admin and partner-office roles are never offered in the mobile app', () => {
    const all = [
      { role: 'jad_admin', partnerId: null },
      { role: 'tenant', partnerId: null },
      { role: 'partner_admin', partnerId: 'p-1' },
      { role: 'owner', partnerId: null },
      { role: 'partner', partnerId: 'p-1' },
    ] as const;
    expect(contextsForClient(all, 'mobile').map((c) => c.role)).toEqual(['owner', 'tenant', 'partner']);
    expect(contextsForClient(all, 'console').map((c) => c.role)).toEqual(['partner_admin', 'jad_admin']);
  });
});
