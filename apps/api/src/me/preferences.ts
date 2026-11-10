/**
 * Profile settings and consents (ADR 0016; L1, N4). Every signed-in person, any role.
 *
 * - GET  /api/me/preferences   language, notification switches, terms and marketing consent
 * - POST /api/me/preferences   change the language and/or switches (only the fields sent)
 * - POST /api/me/consents      accept the current terms, or give / withdraw marketing consent
 *
 * Consents are evidence: appended to the consents table (never edited) with version, time and IP hash, and
 * written to the audit log in the same batch (C-AUD-1, C-LEG-1).
 */
import {
  DEFAULT_LANGUAGE,
  DEFAULT_SWITCHES,
  ROLES,
  TERMS_VERSION,
  consentBody,
  preferencesBody,
  type Language,
  type Preferences,
  type UserRole,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { parseJsonBody } from '../validate.js';

const EVERY_ROLE: readonly UserRole[] = ROLES.filter((r): r is UserRole => r !== 'system');

interface PrefRow {
  language: Language;
  notify_payments: number;
  notify_construction: number;
  notify_news: number;
  notify_offers: number;
}

interface ConsentRow {
  version: string;
  accepted: number;
  at: number;
}

const LATEST_CONSENT =
  'SELECT version, accepted, at FROM consents WHERE user_id = ? AND kind = ? ORDER BY at DESC, rowid DESC LIMIT 1';

/** The person's settings, with the defaults when they never changed anything. */
async function readPreferences(db: D1Database, userId: string): Promise<Preferences> {
  const [row, terms, marketing] = await Promise.all([
    db
      .prepare(
        'SELECT language, notify_payments, notify_construction, notify_news, notify_offers FROM user_preferences WHERE user_id = ?',
      )
      .bind(userId)
      .first<PrefRow>(),
    db.prepare(LATEST_CONSENT).bind(userId, 'terms').first<ConsentRow>(),
    db.prepare(LATEST_CONSENT).bind(userId, 'marketing').first<ConsentRow>(),
  ]);
  return {
    language: row?.language ?? DEFAULT_LANGUAGE,
    notifications:
      row === null
        ? { ...DEFAULT_SWITCHES }
        : {
            payments: row.notify_payments === 1,
            construction: row.notify_construction === 1,
            news: row.notify_news === 1,
            offers: row.notify_offers === 1,
          },
    terms: terms === null ? null : { version: terms.version, at: terms.at },
    termsCurrent: terms?.version === TERMS_VERSION,
    marketing: marketing?.accepted === 1 ? { version: marketing.version, at: marketing.at } : null,
  };
}

export function preferenceRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('/me/preferences', requireRole(...EVERY_ROLE));
  r.use('/me/consents', requireRole(...EVERY_ROLE));

  r.get('/me/preferences', async (c) => c.json(await readPreferences(c.env.DB, c.get('auth').userId)));

  r.post('/me/preferences', async (c) => {
    const body = await parseJsonBody(c, preferencesBody);
    const a = c.get('auth');
    const db = c.env.DB;
    const now = c.get('now');
    const current = await readPreferences(db, a.userId);
    const language = body.language ?? current.language;
    const sent = body.notifications;
    const n = {
      payments: sent?.payments ?? current.notifications.payments,
      construction: sent?.construction ?? current.notifications.construction,
      news: sent?.news ?? current.notifications.news,
      offers: sent?.offers ?? current.notifications.offers,
    };
    await db.batch([
      db
        .prepare(
          `INSERT INTO user_preferences (user_id, language, notify_payments, notify_construction, notify_news, notify_offers, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET language = excluded.language,
             notify_payments = excluded.notify_payments, notify_construction = excluded.notify_construction,
             notify_news = excluded.notify_news, notify_offers = excluded.notify_offers,
             updated_at = excluded.updated_at`,
        )
        .bind(
          a.userId,
          language,
          Number(n.payments),
          Number(n.construction),
          Number(n.news),
          Number(n.offers),
          now,
        ),
      auditStatement(db, {
        at: now,
        actorUserId: a.userId,
        actorRole: a.role,
        action: 'preferences_changed',
        targetType: 'user',
        targetId: a.userId,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
        detail: { language, ...n },
      }),
    ]);
    return c.json(await readPreferences(db, a.userId));
  });

  r.post('/me/consents', async (c) => {
    const body = await parseJsonBody(c, consentBody);
    const a = c.get('auth');
    const db = c.env.DB;
    const now = c.get('now');
    await db.batch([
      db
        .prepare(
          'INSERT INTO consents (id, user_id, kind, version, accepted, at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(newId(), a.userId, body.kind, body.version, Number(body.accepted), now, c.get('ipHash')),
      auditStatement(db, {
        at: now,
        actorUserId: a.userId,
        actorRole: a.role,
        action: body.kind === 'terms' ? 'terms_accepted' : 'marketing_consent_changed',
        targetType: 'user',
        targetId: a.userId,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
        detail: { version: body.version, accepted: body.accepted },
      }),
    ]);
    return c.json(await readPreferences(db, a.userId), 201);
  });

  return r;
}
