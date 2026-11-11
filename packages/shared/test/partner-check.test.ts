/** Daily partner check and on-call rota rules: S6, S7, P3, section 11. */
import { describe, expect, it } from 'vitest';
import {
  PARTNER_DOCUMENT_KINDS,
  REQUIRED_PARTNER_DOCUMENTS,
  partnerDocumentLabel,
} from '../src/partner-documents.js';
import { canBeOnCall, isMonday, weekStarting } from '../src/oncall.js';
import { complianceChange, partnerCompliance, reviewKey, suspensionReason } from '../src/scorecard.js';

const TODAY = '2026-11-09';
const valid = partnerCompliance({ trade_licence: '2027-11-01', insurance: '2027-11-01' }, TODAY);
const lapsed = partnerCompliance({ trade_licence: '2027-11-01', insurance: '2026-11-08' }, TODAY);
const expiring = partnerCompliance({ trade_licence: '2026-11-20', insurance: '2027-11-01' }, TODAY);

describe('compliance changes (S7, P3)', () => {
  it('S7: a partner with a valid trade_licence and insurance is compliant', () => {
    expect(valid).toEqual({ action: 'ok', trade_licence: 'valid', insurance: 'valid' });
    expect(
      REQUIRED_PARTNER_DOCUMENTS.every((k) => (PARTNER_DOCUMENT_KINDS as readonly string[]).includes(k)),
    ).toBe(true);
    expect(partnerDocumentLabel('trade_licence')).toBe('Trade licence');
  });

  it('S7: a lapsed document suspends an active partner', () => {
    expect(complianceChange({ status: 'active', suspendedBy: null }, lapsed)).toBe('suspend');
    expect(complianceChange({ status: 'active', suspendedBy: null }, expiring)).toBeNull();
  });

  it('S7: a partner suspended by the check comes back once documents are valid; admin suspensions stay', () => {
    expect(complianceChange({ status: 'suspended', suspendedBy: 'compliance' }, valid)).toBe('reinstate');
    expect(complianceChange({ status: 'suspended', suspendedBy: 'compliance' }, expiring)).toBe('reinstate');
    expect(complianceChange({ status: 'suspended', suspendedBy: 'compliance' }, lapsed)).toBeNull();
    expect(complianceChange({ status: 'suspended', suspendedBy: 'admin' }, valid)).toBeNull();
  });

  it('P4: an ended contract is never changed by the check', () => {
    expect(complianceChange({ status: 'ended', suspendedBy: null }, lapsed)).toBeNull();
  });

  it('S7: the reason says plainly which document is the problem', () => {
    expect(suspensionReason(lapsed)).toBe('Insurance lapsed');
    expect(suspensionReason(partnerCompliance({ trade_licence: null, insurance: '2026-11-01' }, TODAY))).toBe(
      'Trade licence not on file; Insurance lapsed',
    );
  });

  it('S6: one open review item per concern', () => {
    expect(reviewKey({ kind: 'low_rating', average: 3.5, ratings: 4 })).toBe('low_rating');
    expect(reviewKey({ kind: 'breach', breach: 'honesty_breach' })).toBe('honesty_breach');
  });
});

describe('on-call rota (section 11)', () => {
  it('weeks start on Monday (Dubai date)', () => {
    expect(isMonday('2026-11-09')).toBe(true);
    expect(isMonday('2026-11-10')).toBe(false);
    expect(isMonday('2026-02-30')).toBe(false);
    expect(isMonday('9-11-2026')).toBe(false);
    expect(weekStarting('2026-11-15')).toBe('2026-11-09');
    expect(weekStarting('2026-11-09')).toBe('2026-11-09');
  });

  it('section 11: JAD+ Admin first; an admin or JAD+ viewer second; nobody else', () => {
    expect(canBeOnCall('first', ['jad_admin'])).toBe(true);
    expect(canBeOnCall('first', ['jad_viewer'])).toBe(false);
    expect(canBeOnCall('second', ['jad_viewer'])).toBe(true);
    expect(canBeOnCall('second', ['owner', 'partner'])).toBe(false);
  });
});
