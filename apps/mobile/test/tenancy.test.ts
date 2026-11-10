/** Tenants in the app (ADR 0021; R2, O4, U4, U5): dates, extensions, which tenancy shows, and the sentences. */
import type { MyPlace, OwnerTenancy, TenantTenancy } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { langOf } from '../src/i18n/lang.js';
import {
  addMonths,
  datesProblem,
  daysLeftText,
  defaultDates,
  endAfter,
  extensionChoices,
  extensionProblem,
  invitationSentText,
  invitationText,
  isIsoDate,
  periodText,
  placeForUnit,
  tenantHomeNote,
  unitTenancy,
  warnEnding,
} from '../src/tenancy/logic.js';

const en = langOf('en');
const fr = langOf('fr');
const TODAY = '2026-11-10';

const tenancy = (over: Partial<OwnerTenancy>): OwnerTenancy => ({
  id: 't1',
  sfUnitId: 'a0B000000000001AAA',
  tenantName: 'Nadia Karim',
  contact: 'n•••a@example.com',
  startsOn: '2026-11-15',
  endsOn: '2027-11-14',
  status: 'active',
  current: true,
  daysLeft: 369,
  ...over,
});

const place = (sfUnitId: string | null, unitName: string): MyPlace => ({
  sfUnitId,
  tenancyId: sfUnitId === null ? 'ten-1' : null,
  location: { unitName, project: 'J188', building: null, address: null },
});

const invite = (over: Partial<TenantTenancy>): TenantTenancy => ({
  id: 't1',
  unitName: '1204-J188',
  project: 'J188',
  startsOn: '2026-11-15',
  endsOn: '2027-11-14',
  status: 'invited',
  current: false,
  daysLeft: 369,
  ...over,
});

describe('R2: invitation dates', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isIsoDate('2026-11-15')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('15/11/2026')).toBe(false);
    expect(isIsoDate('2026-1-5')).toBe(false);
  });

  it('adds months within the month, and a tenancy ends the day before the same date', () => {
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonths('2026-11-15', 12)).toBe('2027-11-15');
    expect(endAfter('2026-11-15', 12)).toBe('2027-11-14');
    expect(endAfter('2026-11-15', 6)).toBe('2027-05-14');
    expect(defaultDates(TODAY)).toEqual({ startsOn: TODAY, endsOn: '2027-11-09' });
  });

  it('checks the dates with the API rule before sending', () => {
    expect(datesProblem('2026-11-15', '2027-11-14', TODAY)).toBeNull();
    expect(datesProblem('2026-11-15', '2026-11-14', TODAY)).toBe('tenancy.badRange');
    expect(datesProblem('2026-11-15', '2030-11-14', TODAY)).toBe('tenancy.badRange');
    expect(datesProblem('2026-11-15', 'next year', TODAY)).toBe('tenancy.badDate');
  });

  it('says who to tell and how they sign in, with the first name only', () => {
    expect(invitationSentText('Nadia Karim', 'n•••t@example.com', en.t)).toBe(
      'Ask Nadia to install JAD+ and sign in with n•••t@example.com.',
    );
    expect(periodText('2026-11-15', '2027-11-14', en)).toBe('15 Nov 2026 to 14 Nov 2027');
  });
});

describe('U5: extending', () => {
  it('offers +6 months and +1 year from the current end', () => {
    expect(extensionChoices('2027-11-14', TODAY).map((c) => [c.months, c.endsOn])).toEqual([
      [6, '2028-05-14'],
      [12, '2028-11-14'],
    ]);
  });

  it('brings back a tenancy that just ended; drops a choice still in the past', () => {
    expect(extensionChoices('2026-11-08', TODAY).map((c) => c.endsOn)).toEqual(['2027-05-08', '2027-11-08']);
    expect(extensionChoices('2025-01-31', TODAY).map((c) => c.endsOn)).toEqual([]);
  });

  it('checks another date: later than the current end, within 3 years', () => {
    expect(extensionProblem('2027-11-14', '2028-01-31', TODAY)).toBeNull();
    expect(extensionProblem('2027-11-14', '2027-10-01', TODAY)).toBe('tenancy.badExtension');
    expect(extensionProblem('2027-11-14', '2031-01-01', TODAY)).toBe('tenancy.badExtension');
    expect(extensionProblem('2027-11-14', '2028-02-30', TODAY)).toBe('tenancy.badDate');
  });
});

describe('O4: the tenancy My unit shows', () => {
  it('the open one first, else the last that ended on its date; never a withdrawn one', () => {
    const ended = tenancy({ id: 'old', status: 'ended' });
    const revoked = tenancy({ id: 'gone', status: 'revoked' });
    const open = tenancy({ id: 'new', status: 'invited' });
    expect(unitTenancy([revoked, ended, open], 'a0B000000000001AAA')?.id).toBe('new');
    expect(unitTenancy([revoked, ended], 'a0B000000000001AAA')?.id).toBe('old');
    expect(unitTenancy([revoked], 'a0B000000000001AAA')).toBeNull();
    expect(unitTenancy([open], 'other')).toBeNull();
  });

  it('finds the residence among the owner units by name; with one unit, that one', () => {
    const a = place('a0B000000000001AAA', '1204-J188');
    const b = place('a0B000000000002AAA', '506-JAD288-C');
    expect(placeForUnit([a, b], '506-JAD288-C')).toBe(b);
    expect(placeForUnit([a, b], 'Unknown')).toBeNull();
    expect(placeForUnit([a], 'Unknown')).toBe(a);
    expect(placeForUnit([place(null, 'x')], 'x')).toBeNull();
  });

  it('U4: days left, in the warning colour within 30 days', () => {
    expect(daysLeftText(30, en.t)).toBe('30 days left');
    expect(daysLeftText(1, en.t)).toBe('1 day left');
    expect(daysLeftText(0, en.t)).toBe('Last day today');
    expect(warnEnding('2026-12-10', TODAY)).toBe(true);
    expect(warnEnding('2026-12-11', TODAY)).toBe(false);
  });
});

describe('R2, U4: the tenant', () => {
  it('reads the invitation with the place and dates', () => {
    expect(invitationText(invite({}), en)).toBe(
      'You have been invited to 1204-J188 · J188, from 15 Nov 2026 to 14 Nov 2027.',
    );
    expect(invitationText(invite({ project: null }), fr)).toBe(
      'Vous êtes invité à 1204-J188, du 15 nov. 2026 au 14 nov. 2027.',
    );
  });

  it('is told when access starts, and how many days are left within 30 days of the end', () => {
    const active = invite({ status: 'active', current: true, startsOn: '2026-01-01' });
    expect(tenantHomeNote(active, TODAY, en)).toBeNull();
    expect(tenantHomeNote({ ...active, endsOn: '2026-12-01', daysLeft: 21 }, TODAY, en)).toBe(
      'Your tenancy ends in 21 days. Ask your owner to extend it in JAD+.',
    );
    expect(tenantHomeNote({ ...active, endsOn: TODAY, daysLeft: 0 }, TODAY, en)).toBe(
      'Your tenancy ends today. Ask your owner to extend it in JAD+.',
    );
    expect(tenantHomeNote(invite({ status: 'active' }), TODAY, en)).toBe('Access starts on 15 Nov 2026');
  });
});
