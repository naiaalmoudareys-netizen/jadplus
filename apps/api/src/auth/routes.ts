/**
 * /api/auth: sign in with an email code, see who you are, switch view, sign out.
 * Controls: C-AUTH-1/2, C-SES-1, C-AZ-1, C-AUD-1, C-VAL-1. Requirements: R5, U7, T3.
 */
import {
  ROLES,
  contextsForClient,
  requestCodeBody,
  switchContextBody,
  verifyCodeBody,
  type UserRole,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { ApiError } from '../errors.js';
import { auditStatement } from '../audit.js';
import type { Deps } from '../context.js';
import type { AppEnv } from '../env.js';
import { parseJsonBody } from '../validate.js';
import { requireRole } from './middleware.js';
import { newSession, revokeAllStatement, revokeSessionStatement, roleContexts } from './sessions.js';
import { clearSessionCookie, csrfFor, setSessionCookie } from './console-cookie.js';
import { CODE_SENT_MESSAGE, requestCode, verifyCode, type SignedIn } from './signin.js';

const EVERY_ROLE: readonly UserRole[] = ROLES.filter((r): r is UserRole => r !== 'system');

/**
 * What a successful sign-in (or view switch) answers. The phone gets its token to keep in secure storage; the
 * console gets an HttpOnly cookie instead and only the anti-forgery token in the body (ADR 0022).
 */
async function answer(c: Context<AppEnv>, s: SignedIn, client: 'mobile' | 'console'): Promise<object> {
  const rest = { expiresAt: s.expiresAt, context: s.context, contexts: s.contexts };
  if (client === 'mobile') return { token: s.token, ...rest };
  setSessionCookie(c, s.token, s.expiresAt);
  return { ...rest, csrf: await csrfFor(c.get('keys'), s.sessionId) };
}

export function authRoutes(deps: Deps): Hono<AppEnv> {
  const auth = new Hono<AppEnv>();

  auth.post('/code', async (c) => {
    await requestCode(c, deps, await parseJsonBody(c, requestCodeBody));
    return c.json({ message: CODE_SENT_MESSAGE }, 202);
  });

  auth.post('/verify', async (c) => {
    const body = await parseJsonBody(c, verifyCodeBody);
    const signedIn = await verifyCode(c, deps, body);
    return c.json(await answer(c, signedIn, body.client));
  });

  auth.get('/me', requireRole(...EVERY_ROLE), async (c) => {
    const a = c.get('auth');
    const contexts = contextsForClient(await roleContexts(c.env.DB, a.userId), a.client);
    // The console reads its anti-forgery token here after a page reload (its cookie is not readable, ADR 0022).
    const csrf = a.client === 'console' ? await csrfFor(c.get('keys'), a.sessionId) : null;
    return c.json({
      userId: a.userId,
      role: a.role,
      partnerId: a.partnerId,
      client: a.client,
      contexts,
      csrf,
    });
  });

  // R5/U7: one person, several views (e.g. owns one unit, rents another). The session is rotated, so a
  // token never carries more than one role (C-SES-1 "rotated on privilege change").
  auth.post('/switch', requireRole(...EVERY_ROLE), async (c) => {
    const body = await parseJsonBody(c, switchContextBody);
    const a = c.get('auth');
    const now = c.get('now');
    const db = c.env.DB;
    const contexts = contextsForClient(await roleContexts(db, a.userId), a.client);
    const target = contexts.find((x) => x.role === body.role && x.partnerId === body.partnerId);
    if (target === undefined) throw new ApiError(403, 'Not allowed.');
    const session = await newSession(db, {
      userId: a.userId,
      context: target,
      client: a.client,
      now,
      ipHash: c.get('ipHash'),
    });
    await db.batch([
      revokeSessionStatement(db, a.sessionId, 'rotated', now),
      ...session.statements,
      auditStatement(db, {
        at: now,
        actorUserId: a.userId,
        actorRole: target.role,
        action: 'session_role_switched',
        targetType: 'session',
        targetId: session.sessionId,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
        detail: { from: a.role, to: target.role },
      }),
    ]);
    return c.json(
      await answer(
        c,
        {
          token: session.token,
          sessionId: session.sessionId,
          expiresAt: session.absoluteExpiresAt,
          context: target,
          contexts,
        },
        a.client,
      ),
    );
  });

  auth.post('/sign-out', requireRole(...EVERY_ROLE), async (c) => {
    const a = c.get('auth');
    if (a.client === 'console') clearSessionCookie(c);
    const now = c.get('now');
    const db = c.env.DB;
    await db.batch([
      revokeSessionStatement(db, a.sessionId, 'sign_out', now),
      auditStatement(db, {
        at: now,
        actorUserId: a.userId,
        actorRole: a.role,
        action: 'sign_out',
        targetType: 'session',
        targetId: a.sessionId,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
      }),
    ]);
    return c.body(null, 204);
  });

  // T3: lost phone — end every session of this person, on every device.
  auth.post('/sign-out-everywhere', requireRole(...EVERY_ROLE), async (c) => {
    const a = c.get('auth');
    if (a.client === 'console') clearSessionCookie(c);
    const now = c.get('now');
    const db = c.env.DB;
    await db.batch([
      revokeAllStatement(db, a.userId, 'sign_out_everywhere', now),
      auditStatement(db, {
        at: now,
        actorUserId: a.userId,
        actorRole: a.role,
        action: 'sign_out_everywhere',
        targetType: 'user',
        targetId: a.userId,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
      }),
    ]);
    return c.body(null, 204);
  });

  return auth;
}
