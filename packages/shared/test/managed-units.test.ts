/** Managed units (ADR 0034): O4, A1, R2. */
import { describe, expect, it } from 'vitest';
import {
  BULK_MAX_ROWS,
  MANAGED_SOURCES,
  approverFor,
  bulkManagedBody,
  canTransition,
  isManagedOn,
  maintenancePartnerFor,
  managementDatesAllowed,
  managerSeesRequest,
  ownerRequestRouting,
  setManagedBody,
  statementMonthAllowed,
  tenancyKeeperFor,
} from '../src/index.js';

const TODAY = '2026-11-11';
const open = { since: '2026-11-01', until: null, endedAt: null };

describe('managed units (O4)', () => {
  it('O4: a unit is managed from its first day through its last, unless ended', () => {
    expect(isManagedOn(open, TODAY)).toBe(true);
    expect(isManagedOn({ ...open, since: '2026-11-12' }, TODAY)).toBe(false);
    expect(isManagedOn({ ...open, until: '2026-11-11' }, TODAY)).toBe(true);
    expect(isManagedOn({ ...open, until: '2026-11-10' }, TODAY)).toBe(false);
    expect(isManagedOn({ ...open, endedAt: 1 }, TODAY)).toBe(false);
  });

  it('O4: the managing team keeps the tenancy of a managed unit; the owner keeps an unmanaged one', () => {
    expect(tenancyKeeperFor(true)).toBe('manager');
    expect(tenancyKeeperFor(false)).toBe('owner');
  });

  it('O4: JAD+ Admin dates: from today or up to a year back, ending after today, at most 5 years', () => {
    expect(managementDatesAllowed(TODAY, '2027-11-11', TODAY)).toBe(true);
    expect(managementDatesAllowed(TODAY, null, TODAY)).toBe(true);
    expect(managementDatesAllowed('2026-11-12', null, TODAY)).toBe(false);
    expect(managementDatesAllowed('2025-01-01', null, TODAY)).toBe(false);
    expect(managementDatesAllowed(TODAY, TODAY, TODAY)).toBe(false);
    expect(managementDatesAllowed(TODAY, '2032-11-11', TODAY)).toBe(false);
  });

  it('O4: statements are for months of the arrangement, up to this month, never after it ended', () => {
    expect(statementMonthAllowed('2026-11', open, TODAY)).toBe(true);
    expect(statementMonthAllowed('2026-10', open, TODAY)).toBe(false);
    expect(statementMonthAllowed('2026-12', open, TODAY)).toBe(false);
    const past = { since: '2025-01-15', until: '2026-03-31', endedAt: null };
    expect(statementMonthAllowed('2026-03', past, TODAY)).toBe(true);
    expect(statementMonthAllowed('2026-04', past, TODAY)).toBe(false);
    expect(statementMonthAllowed('2026-03', { ...past, endedAt: 1 }, TODAY)).toBe(false);
  });

  it('R2: the manager sees repairs and emergencies, never the owner’s sales, mortgage or visa matters', () => {
    expect(managerSeesRequest('maintenance', false)).toBe(true);
    expect(managerSeesRequest('maintenance', true)).toBe(true);
    expect(managerSeesRequest('resale', false)).toBe(false);
    expect(managerSeesRequest('mortgage', false)).toBe(false);
  });

  it('O4: bulk entry needs unit, owner email and until date; at most 200 rows; strict', () => {
    const row = { unitName: '506-JAD288-C', ownerEmail: 'Demo@JadPlus.ae ', until: '2027-11-11' };
    const parsed = bulkManagedBody.parse({ providerId: 'p-harbor', rows: [row] });
    expect(parsed.rows[0]?.ownerEmail).toBe('demo@jadplus.ae');
    expect(bulkManagedBody.safeParse({ providerId: 'p', rows: [] }).success).toBe(false);
    expect(
      bulkManagedBody.safeParse({
        providerId: 'p',
        rows: Array.from({ length: BULK_MAX_ROWS + 1 }, () => row),
      }).success,
    ).toBe(false);
    expect(bulkManagedBody.safeParse({ providerId: 'p', rows: [{ ...row, phone: '1' }] }).success).toBe(
      false,
    );
    expect(
      setManagedBody.safeParse({
        sfUnitId: 'a0X000000000001AAA',
        ownerUserId: 'u-1',
        providerId: 'p-1',
        since: TODAY,
        until: null,
      }).success,
    ).toBe(true);
  });

  it('every source is one the database accepts (drift-tested against migration 0032)', () => {
    expect(MANAGED_SOURCES).toEqual(['consultation', 'admin', 'complimentary']);
  });
});

describe('approval by the manager (A1)', () => {
  it('A1: a tenant request on a managed unit is decided by the managing team, otherwise by the owner', () => {
    expect(approverFor(true)).toBe('manager');
    expect(approverFor(false)).toBe('owner');
  });

  it('A1: the managing team’s office may approve (submitted) or decline (closed) a waiting request', () => {
    expect(canTransition('partner_admin', 'awaiting_owner', 'submitted')).toBe(true);
    expect(canTransition('partner_admin', 'awaiting_owner', 'closed')).toBe(true);
    expect(canTransition('partner', 'awaiting_owner', 'submitted')).toBe(false);
    expect(canTransition('partner_admin', 'assigned', 'closed')).toBe(false);
  });

  it('A1: approved requests go to the manager’s maintenance company when it is an active outside partner', () => {
    expect(maintenancePartnerFor({ id: 'p-vip', kind: 'external', status: 'active' })).toBe('p-vip');
    expect(maintenancePartnerFor({ id: 'p-vip', kind: 'external', status: 'suspended' })).toBeNull();
    expect(maintenancePartnerFor({ id: 'p-team', kind: 'jad_group', status: 'active' })).toBeNull();
    expect(maintenancePartnerFor(null)).toBeNull();
  });

  it('O4: the owner’s own requests on a managed unit run the normal owner flow', () => {
    expect(ownerRequestRouting()).toBe('normal');
  });
});
