/** Profile settings and consents (ADR 0016): L1, N4. */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SWITCHES,
  MAKE_SAFE_VERSION,
  MARKETING_VERSION,
  TERMS_VERSION,
  consentBody,
  messageAllowed,
  preferencesBody,
} from '../src/index.js';

describe('which messages may be sent', () => {
  it('N4: news and offers need marketing consent AND the switch on', () => {
    expect(messageAllowed('news', DEFAULT_SWITCHES, false)).toBe(false);
    expect(messageAllowed('offers', DEFAULT_SWITCHES, false)).toBe(false);
    expect(messageAllowed('news', DEFAULT_SWITCHES, true)).toBe(true);
    expect(messageAllowed('offers', { ...DEFAULT_SWITCHES, offers: false }, true)).toBe(false);
  });

  it('payment reminders and construction updates follow their switch, without marketing consent', () => {
    expect(messageAllowed('payments', DEFAULT_SWITCHES, false)).toBe(true);
    expect(messageAllowed('construction', { ...DEFAULT_SWITCHES, construction: false }, true)).toBe(false);
  });

  it('updates about your own requests are the service itself: always sent', () => {
    const allOff = { payments: false, construction: false, news: false, offers: false };
    expect(messageAllowed('requests', allOff, false)).toBe(true);
  });
});

describe('profile payloads (C-VAL-1)', () => {
  it('accepts a language or switches; refuses unknown languages, unknown keys and empty changes', () => {
    expect(preferencesBody.safeParse({ language: 'ar' }).success).toBe(true);
    expect(preferencesBody.safeParse({ notifications: { news: false } }).success).toBe(true);
    expect(preferencesBody.safeParse({ language: 'de' }).success).toBe(false);
    expect(preferencesBody.safeParse({ language: 'en', theme: 'dark' }).success).toBe(false);
    expect(preferencesBody.safeParse({ notifications: { requests: false } }).success).toBe(false);
    expect(preferencesBody.safeParse({}).success).toBe(false);
  });

  it('L1: terms can only be accepted, in the current version; marketing can be given or withdrawn', () => {
    expect(consentBody.safeParse({ kind: 'terms', version: TERMS_VERSION, accepted: true }).success).toBe(
      true,
    );
    expect(consentBody.safeParse({ kind: 'terms', version: TERMS_VERSION, accepted: false }).success).toBe(
      false,
    );
    expect(consentBody.safeParse({ kind: 'terms', version: 'old', accepted: true }).success).toBe(false);
    expect(
      consentBody.safeParse({ kind: 'marketing', version: MARKETING_VERSION, accepted: false }).success,
    ).toBe(true);
    expect(
      consentBody.safeParse({ kind: 'make_safe_cap', version: TERMS_VERSION, accepted: true }).success,
    ).toBe(false);
  });
});

describe('make-safe limit (E8)', () => {
  it('one of the offered limits, or none; the limit is given exactly when accepted', () => {
    const ok = (body: object) =>
      consentBody.safeParse({ kind: 'make_safe_cap', version: MAKE_SAFE_VERSION, ...body }).success;
    expect(ok({ accepted: true, capAed: 500 })).toBe(true);
    expect(ok({ accepted: false, capAed: null })).toBe(true);
    expect(ok({ accepted: true, capAed: 750 })).toBe(false);
    expect(ok({ accepted: true, capAed: null })).toBe(false);
    expect(ok({ accepted: false, capAed: 500 })).toBe(false);
  });
});
