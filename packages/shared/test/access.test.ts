import { describe, expect, it } from 'vitest';
import {
  canActOnRequest,
  canViewRequest,
  canViewTenancy,
  isTenancyCurrent,
  type Actor,
  type RequestFacts,
  type TenancyFacts,
} from '../src/access.js';

const TODAY = '2026-11-09';
const tenancy: TenancyFacts = {
  tenantUserId: 'u-tenant',
  ownerUserId: 'u-owner',
  status: 'active',
  startsOn: '2026-01-01',
  endsOn: '2026-12-31',
};
const request: RequestFacts = { ownerUserId: 'u-owner', tenancy, partnerId: 'p-1' };

const actor = (role: Actor['role'], userId: string, partnerId: string | null = null): Actor => ({
  role,
  userId,
  partnerId,
});

describe('C-AZ-2 object ownership: requests', () => {
  it('R1: an owner sees requests on their own units only', () => {
    expect(canViewRequest(actor('owner', 'u-owner'), request, TODAY)).toBe(true);
    expect(canViewRequest(actor('owner', 'u-other-owner'), request, TODAY)).toBe(false);
  });

  it('U3: after a sale the request belongs to the new owner, and the old owner loses access', () => {
    const sold = { ...request, ownerUserId: 'u-new-owner' };
    expect(canViewRequest(actor('owner', 'u-owner'), sold, TODAY)).toBe(false);
    expect(canViewRequest(actor('owner', 'u-new-owner'), sold, TODAY)).toBe(true);
  });

  it('R2: a tenant sees requests of their own current tenancy only', () => {
    expect(canViewRequest(actor('tenant', 'u-tenant'), request, TODAY)).toBe(true);
    expect(canViewRequest(actor('tenant', 'u-other-tenant'), request, TODAY)).toBe(false);
    expect(canViewRequest(actor('tenant', 'u-tenant'), { ...request, tenancy: null }, TODAY)).toBe(false);
  });

  it('U4: a tenant loses access automatically after the tenancy end date', () => {
    expect(canViewRequest(actor('tenant', 'u-tenant'), request, '2026-12-31')).toBe(true);
    expect(canViewRequest(actor('tenant', 'u-tenant'), request, '2027-01-01')).toBe(false);
  });

  it("R3: a partner sees only jobs assigned to it, never another partner's", () => {
    expect(canViewRequest(actor('partner', 'u-tech', 'p-1'), request, TODAY)).toBe(true);
    expect(canViewRequest(actor('partner', 'u-tech2', 'p-2'), request, TODAY)).toBe(false);
    expect(
      canViewRequest(actor('partner_admin', 'u-office', 'p-1'), { ...request, partnerId: null }, TODAY),
    ).toBe(false);
  });

  it('E6: once a job moves to the backup partner, the first partner can no longer see it', () => {
    const moved = { ...request, partnerId: 'p-backup' };
    expect(canViewRequest(actor('partner', 'u-tech', 'p-1'), moved, TODAY)).toBe(false);
    expect(canViewRequest(actor('partner', 'u-backup-tech', 'p-backup'), moved, TODAY)).toBe(true);
  });

  it('R4: JAD+ staff see every request; viewers can never act', () => {
    expect(canViewRequest(actor('jad_viewer', 'u-viewer'), request, TODAY)).toBe(true);
    expect(canActOnRequest(actor('jad_viewer', 'u-viewer'), request, TODAY)).toBe(false);
    expect(canActOnRequest(actor('jad_admin', 'u-admin'), request, TODAY)).toBe(true);
    expect(canActOnRequest(actor('owner', 'u-other-owner'), request, TODAY)).toBe(false);
  });
});

describe('C-AZ-2 object ownership: tenancies', () => {
  it('U4/U5: a tenancy is current from its start date through its end date, only while active', () => {
    expect(isTenancyCurrent(tenancy, '2025-12-31')).toBe(false);
    expect(isTenancyCurrent(tenancy, '2026-01-01')).toBe(true);
    expect(isTenancyCurrent(tenancy, '2026-12-31')).toBe(true);
    expect(isTenancyCurrent(tenancy, '2027-01-01')).toBe(false);
    expect(isTenancyCurrent({ ...tenancy, status: 'revoked' }, TODAY)).toBe(false);
    expect(isTenancyCurrent({ ...tenancy, status: 'invited' }, TODAY)).toBe(false);
  });

  it('the owner and the current tenant see the tenancy; partners never do', () => {
    expect(canViewTenancy(actor('owner', 'u-owner'), tenancy, TODAY)).toBe(true);
    expect(canViewTenancy(actor('owner', 'u-other-owner'), tenancy, TODAY)).toBe(false);
    expect(canViewTenancy(actor('tenant', 'u-tenant'), tenancy, TODAY)).toBe(true);
    expect(canViewTenancy(actor('tenant', 'u-tenant'), tenancy, '2027-02-01')).toBe(false);
    expect(canViewTenancy(actor('partner', 'u-tech', 'p-1'), tenancy, TODAY)).toBe(false);
  });
});
