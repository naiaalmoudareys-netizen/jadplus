/** Alert texts and delivery rules (ADR 0007): E1, E4, L3. */
import { describe, expect, it } from 'vitest';
import { CONTACT_REMOVED, maskContactDetails, messageAuthorLabel } from '../src/conversation.js';
import { OWNER_EMERGENCY_NOTICE } from '../src/emergency.js';
import {
  MAX_DELIVERY_ATTEMPTS,
  NOTIFICATION_TEMPLATES,
  RECIPIENT_KINDS,
  channelsFor,
  dubaiClock,
  nextAttemptAt,
  renderMessage,
} from '../src/messages.js';

const facts = { ref: 'JAD-7KQ4M2', type: 'water_leak' as const, arrival: null };

describe('alert texts', () => {
  it('E1: the owner notice is exactly the plan text', () => {
    expect(renderMessage('emergency_owner_notice', 'user', facts).body).toBe(OWNER_EMERGENCY_NOTICE);
  });

  it('E4: the resident is told the arrival window in Dubai time', () => {
    const t = Date.UTC(2026, 10, 9, 10, 30);
    expect(dubaiClock(t)).toBe('14:30');
    expect(
      renderMessage('emergency_acknowledged', 'user', { ...facts, arrival: { from: '14:30', to: '16:00' } })
        .body,
    ).toBe('Your emergency has been acknowledged. A technician will arrive between 14:30 and 16:00.');
  });

  it('every template renders for every recipient, names the reference, and fits two SMS (L3: no instructions)', () => {
    for (const template of NOTIFICATION_TEMPLATES) {
      for (const to of RECIPIENT_KINDS) {
        const m = renderMessage(template, to, facts);
        expect(m.subject).toContain(facts.ref);
        expect(`${m.subject} - ${m.body}`.length).toBeLessThanOrEqual(306);
        expect(m.body).not.toMatch(/turn off|switch off|close the valve/i);
      }
    }
  });
});

describe('delivery rules', () => {
  it('urgent alerts go by SMS and email; other messages by email', () => {
    expect(channelsFor(true)).toEqual(['sms', 'email']);
    expect(channelsFor(false)).toEqual(['email']);
  });

  it('urgent alerts retry within minutes; after the last attempt they fail for good', () => {
    expect(nextAttemptAt(1, true, 0)).toBe(60_000);
    expect(nextAttemptAt(1, false, 0)).toBe(5 * 60_000);
    expect(nextAttemptAt(MAX_DELIVERY_ATTEMPTS, true, 0)).toBeNull();
  });
});

describe('contact stays in JAD+ (ADR 0009)', () => {
  it('ADR 0009: phone numbers in any common form are removed', () => {
    for (const phone of [
      '050 000 0000',
      '+971 50 000 0000',
      '00971500000000',
      '04-000-0000',
      '(050) 000-0000',
    ]) {
      const out = maskContactDetails(`Call ${phone} please`);
      expect(out.masked).toBe(true);
      expect(out.text).toBe(`Call ${CONTACT_REMOVED} please`);
    }
  });

  it('ADR 0009: emails and messenger links are removed', () => {
    expect(maskContactDetails('mail me at layla.haddad@example.com').text).toBe(
      `mail me at ${CONTACT_REMOVED}`,
    );
    expect(maskContactDetails('see https://wa.me/971500000000 ok').text).toBe(`see ${CONTACT_REMOVED} ok`);
    expect(maskContactDetails('t.me/someone').masked).toBe(true);
  });

  it('a list of small numbers is not a phone number', () => {
    expect(maskContactDetails('Rooms 1 2 3 4 5 6 7 8 9 checked').masked).toBe(false);
    expect(maskContactDetails('Items 1,  2,  3,  4,  5,  6,  7,  8,  9').masked).toBe(false);
  });

  it('ordinary details stay: unit names, references, dates, times and amounts', () => {
    const text = 'Unit JAD288-1102, ref JAD-7KQ4M2, on 10-11-2026 at 14:30, quote AED 1,500.';
    expect(maskContactDetails(text)).toEqual({ text, masked: false });
  });

  it('residents appear as Owner or Tenant, partner staff under the company, JAD+ staff as JAD+', () => {
    expect(messageAuthorLabel('tenant', null)).toBe('Tenant');
    expect(messageAuthorLabel('partner', 'Demo Fixers LLC')).toBe('Demo Fixers LLC');
    expect(messageAuthorLabel('jad_admin', null)).toBe('JAD+');
  });
});

describe('contact masking stays fast and keeps line breaks', () => {
  it('a long hostile message is handled quickly and new lines are kept', () => {
    const hostile = `${'1 '.repeat(500)}x`;
    const started = Date.now();
    maskContactDetails(hostile);
    expect(Date.now() - started).toBeLessThan(50);
    expect(maskContactDetails('Hi\nmail: a.b@example.com\nThanks').text).toBe(
      `Hi\nmail: ${CONTACT_REMOVED}\nThanks`,
    );
  });
});
