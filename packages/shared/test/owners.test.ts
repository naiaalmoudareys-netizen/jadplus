/** Owners from Salesforce: C-AUTH-3, U3, T2. */
import { describe, expect, it } from 'vitest';
import {
  OWNER_UNITS_MAX_AGE_MS,
  normalisePhone,
  ownerAccess,
  ownerLookupResponse,
  ownerUnitsFresh,
  phoneMatchKey,
  type OwnerLookup,
} from '../src/owners.js';
import { identifierOf, requestCodeBody, verifyCodeBody } from '../src/schemas.js';

const person = {
  contactId: '003000000000001AAA',
  name: 'Layla Haddad',
  email: 'layla.haddad@example.com',
  mobile: '+971 50 000 0000',
};
const unit = {
  unitId: 'a0X000000000001AAA',
  dealId: '006000000000001AAA',
  unitName: 'JAD288-1102',
  project: 'JAD 288',
  building: 'Building B',
  address: 'Jumeirah Village Circle, Dubai',
  role: 'Buyer' as const,
};
const found: OwnerLookup = { found: true, shared: false, person, units: [unit] };

describe('mobile numbers', () => {
  it('C-AUTH-3: UAE numbers written in any common way become one international form', () => {
    for (const raw of [
      '+971 50 000 0000',
      '00971500000000',
      '050 000 0000',
      '50-000-0000',
      '(050) 000.0000',
    ]) {
      expect(normalisePhone(raw)).toBe('+971500000000');
    }
  });

  it('keeps other international numbers; refuses things that cannot be a number', () => {
    expect(normalisePhone('+44 7700 900000')).toBe('+447700900000');
    for (const raw of ['', '12345', 'call me', '+0 123 456 789', '040000000', '+1234567890123456']) {
      expect(normalisePhone(raw)).toBeNull();
    }
  });

  it('matches Salesforce numbers on their last 9 digits, like the Salesforce match key', () => {
    expect(phoneMatchKey('+971 50 000 0000')).toBe('500000000');
    expect(phoneMatchKey('0500000000')).toBe('500000000');
    expect(phoneMatchKey('1234')).toBeNull();
  });
});

describe('sign-in identifier', () => {
  it('C-AUTH-3: an owner signs in with either their email or their mobile number, never both', () => {
    expect(identifierOf(requestCodeBody.parse({ email: ' Layla.Haddad@Example.com ' }))).toEqual({
      kind: 'email',
      value: 'layla.haddad@example.com',
    });
    expect(identifierOf(requestCodeBody.parse({ phone: '050 000 0000' }))).toEqual({
      kind: 'phone',
      value: '+971500000000',
    });
    expect(requestCodeBody.safeParse({}).success).toBe(false);
    expect(requestCodeBody.safeParse({ email: 'demo@jadplus.ae', phone: '0500000000' }).success).toBe(false);
    expect(requestCodeBody.safeParse({ phone: 'not a number' }).success).toBe(false);
    expect(verifyCodeBody.safeParse({ phone: '0500000000', code: '123456', client: 'mobile' }).success).toBe(
      true,
    );
  });
});

describe('Salesforce identity answer', () => {
  it('C-VAL-1: is validated; unknown fields or malformed ids are refused', () => {
    expect(ownerLookupResponse.parse(found)).toEqual(found);
    expect(ownerLookupResponse.safeParse({ ...found, extra: 1 }).success).toBe(false);
    expect(ownerLookupResponse.safeParse({ ...found, units: [{ ...unit, unitId: 'x; DROP' }] }).success).toBe(
      false,
    );
  });

  it('C-AUTH-3: one person with at least one Sold or Booked unit may sign in as an owner', () => {
    expect(ownerAccess(found)).toEqual({ allowed: true, person, units: [unit] });
  });

  it('C-AUTH-3: an email or number shared by two different people is refused', () => {
    expect(ownerAccess({ ...found, shared: true })).toEqual({ allowed: false, reason: 'shared' });
  });

  it('U3: someone with no Sold or Booked unit (e.g. sold it) is not an owner', () => {
    expect(ownerAccess({ ...found, units: [] })).toEqual({ allowed: false, reason: 'not_owner' });
    expect(ownerAccess({ found: false, shared: false, person: null, units: [] })).toEqual({
      allowed: false,
      reason: 'not_owner',
    });
  });

  it('U3/T2: the stored unit list is refreshed from Salesforce once it is a day old', () => {
    expect(ownerUnitsFresh(0, OWNER_UNITS_MAX_AGE_MS - 1)).toBe(true);
    expect(ownerUnitsFresh(0, OWNER_UNITS_MAX_AGE_MS)).toBe(false);
  });
});
