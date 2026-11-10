/** Profile settings and consents (ADR 0016): L1, N4, C-VAL-1, C-AUD-1, C-LEG-1. */
import { LANGUAGES, MARKETING_VERSION, TERMS_VERSION, preferencesResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { migratedDb } from './db.js';
import { world, type World } from './emergency-world.js';

const get = async (w: World, token = w.ownerToken) =>
  preferencesResponse.parse(await (await w.h.request('/api/me/preferences', { token })).json());
const change = (w: World, json: object, token = w.ownerToken) =>
  w.h.request('/api/me/preferences', { method: 'POST', token, json });
const consent = (w: World, json: object, token = w.ownerToken) =>
  w.h.request('/api/me/consents', { method: 'POST', token, json });
const audit = (w: World, action: string) =>
  w.h.sqlite.prepare('SELECT count(*) AS n FROM audit_log WHERE action = ?').get(action);

describe('profile settings', () => {
  it('ADR 0016: English, every switch on, no consent yet, until the person changes something', async () => {
    const w = await world();
    expect(await get(w)).toEqual({
      language: 'en',
      notifications: { payments: true, construction: true, news: true, offers: true },
      terms: null,
      termsCurrent: false,
      marketing: null,
      makeSafeCap: null,
    });
  });

  it('changes only what is sent, keeps the rest, and records it in the audit log', async () => {
    const w = await world();
    expect((await change(w, { language: 'ar' })).status).toBe(200);
    const res = await change(w, { notifications: { construction: false } });
    const prefs = preferencesResponse.parse(await res.json());
    expect(prefs.language).toBe('ar');
    expect(prefs.notifications).toEqual({ payments: true, construction: false, news: true, offers: true });
    expect(audit(w, 'preferences_changed')).toEqual({ n: 2 });
  });

  it('every role has its own settings (a technician too); nobody sees another person’s', async () => {
    const w = await world();
    await change(w, { language: 'fr' }, w.primaryToken);
    expect((await get(w, w.primaryToken)).language).toBe('fr');
    expect((await get(w)).language).toBe('en');
    expect((await w.h.request('/api/me/preferences')).status).toBe(401);
  });

  it('C-VAL-1: unknown language, unknown switch or extra keys are refused', async () => {
    const w = await world();
    expect((await change(w, { language: 'xx' })).status).toBe(400);
    expect((await change(w, { notifications: { requests: false } })).status).toBe(400);
    expect((await change(w, { language: 'en', userId: 'someone-else' })).status).toBe(400);
  });
});

describe('consents', () => {
  it('L1: accepting the current terms is recorded with version and time, append-only, and audited', async () => {
    const w = await world();
    const res = await consent(w, { kind: 'terms', version: TERMS_VERSION, accepted: true });
    expect(res.status).toBe(201);
    const prefs = await get(w);
    expect(prefs.termsCurrent).toBe(true);
    expect(prefs.terms?.version).toBe(TERMS_VERSION);
    expect(audit(w, 'terms_accepted')).toEqual({ n: 1 });
    expect(() => w.h.sqlite.prepare('DELETE FROM consents').run()).toThrow(/append-only/);
  });

  it('L1: an old version of the terms cannot be accepted', async () => {
    const w = await world();
    expect((await consent(w, { kind: 'terms', version: 'v0', accepted: true })).status).toBe(400);
  });

  it('N4: marketing consent can be given and withdrawn; the latest answer counts and both stay on record', async () => {
    const w = await world();
    await consent(w, { kind: 'marketing', version: MARKETING_VERSION, accepted: true });
    expect((await get(w)).marketing?.version).toBe(MARKETING_VERSION);
    await consent(w, { kind: 'marketing', version: MARKETING_VERSION, accepted: false });
    expect((await get(w)).marketing).toBeNull();
    expect(
      w.h.sqlite.prepare("SELECT accepted FROM consents WHERE kind = 'marketing' ORDER BY rowid").all(),
    ).toEqual([{ accepted: 1 }, { accepted: 0 }]);
    expect(audit(w, 'marketing_consent_changed')).toEqual({ n: 2 });
  });
});

describe('user_preferences mirrors preferences.ts (no drift)', () => {
  it('every app language is allowed by the database, and nothing else', () => {
    const db = migratedDb();
    db.prepare(
      "INSERT INTO users (id, email_hash, email_enc, created_at, updated_at) VALUES ('u', x'00', x'00', 1, 1)",
    ).run();
    for (const language of LANGUAGES) {
      db.prepare(
        'INSERT OR REPLACE INTO user_preferences (user_id, language, updated_at) VALUES (?, ?, 1)',
      ).run('u', language);
    }
    expect(() =>
      db
        .prepare(
          "INSERT OR REPLACE INTO user_preferences (user_id, language, updated_at) VALUES ('u', 'de', 1)",
        )
        .run(),
    ).toThrow(/CHECK/);
  });
});
