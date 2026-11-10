/** Alert texts and delivery rules (ADR 0007): E1, E4, L3. */
import { describe, expect, it } from 'vitest';
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
