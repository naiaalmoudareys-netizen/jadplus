/** Who receives and who may see each notification (ADR 0019, 0024, 0035): O2, O3, O5, P5, R2, C-AZ-2. */
import { describe, expect, it } from 'vitest';
import {
  HANDOVER_TEAM_KINDS,
  INBOX_KINDS,
  PARTNER_KINDS,
  SERVICE_OWNER_KINDS,
  SESSION_KINDS,
  UNTARGETED_KINDS,
  inboxData,
  inboxRecipients,
  inboxViewAllows,
} from '../src/index.js';

const PARTNER_ROLES = ['partner', 'partner_admin'];
const OTHER_ROLES = ['owner', 'tenant', 'jad_admin', 'jad_viewer'];

describe('service-flow notifications (ADR 0035)', () => {
  it('R2: every service-flow kind goes to the owner only, never to the tenant who raised a request', () => {
    for (const kind of SERVICE_OWNER_KINDS) {
      expect(inboxRecipients(kind, 'owner-1', 'tenant-1')).toEqual(['owner-1']);
    }
  });

  it('R2/C-AZ-2: service-flow kinds show only in the owner view', () => {
    for (const kind of SERVICE_OWNER_KINDS) {
      expect(inboxViewAllows(kind, 'owner')).toBe(true);
      for (const role of ['tenant', ...PARTNER_ROLES, 'jad_admin'])
        expect(inboxViewAllows(kind, role)).toBe(false);
    }
  });

  it('O3/C-AZ-2: the provider kinds show only to partners; "snags to fix" only in the office view', () => {
    for (const kind of [
      'reinspection_requested',
      'snag_reopened',
      'snags_all_confirmed',
      'snags_to_fix',
    ] as const) {
      expect(PARTNER_KINDS.has(kind)).toBe(true);
      for (const role of OTHER_ROLES) expect(inboxViewAllows(kind, role)).toBe(false);
    }
    expect(inboxViewAllows('snag_reopened', 'partner')).toBe(true);
    expect(inboxViewAllows('snags_to_fix', 'partner_admin')).toBe(true);
    expect(inboxViewAllows('snags_to_fix', 'partner')).toBe(false);
    expect([...HANDOVER_TEAM_KINDS]).toEqual(['snags_to_fix']);
  });

  it('earlier kinds keep their rules: residents may see request items, partners their job items', () => {
    expect(inboxViewAllows('visit_booked', 'tenant')).toBe(true);
    expect(inboxViewAllows('job_new', 'partner')).toBe(true);
    expect(inboxViewAllows('job_new', 'owner')).toBe(false);
  });

  it('every kind is listed once; session kinds are exactly the "session_" kinds; the untargeted ones are owner kinds', () => {
    expect(new Set(INBOX_KINDS).size).toBe(INBOX_KINDS.length);
    expect(INBOX_KINDS.filter((k) => k.startsWith('session_'))).toEqual([...SESSION_KINDS]);
    for (const kind of UNTARGETED_KINDS)
      expect((SERVICE_OWNER_KINDS as readonly string[]).includes(kind)).toBe(true);
  });

  it('C-PD-1: the facts are codes; free text, e-mails and phone numbers do not pass', () => {
    expect(inboxData.parse({ service: 'golden-visa', stage: 'pre_approval', hasNote: true })).toEqual({
      service: 'golden-visa',
      stage: 'pre_approval',
      hasNote: true,
    });
    expect(inboxData.safeParse({ stage: 'demo@jadplus.ae' }).success).toBe(false);
    expect(inboxData.safeParse({ service: '+971 50 000 0000' }).success).toBe(false);
    expect(inboxData.safeParse({ date: '1 Dec' }).success).toBe(false);
    expect(inboxData.safeParse({ period: '2026-11-01' }).success).toBe(false);
    expect(
      inboxData.safeParse({ step: 'keys_collected', slot: 'morning', reportKind: 'valuation' }).success,
    ).toBe(true);
  });
});
