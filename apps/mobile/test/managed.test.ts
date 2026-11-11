/** Managed units, furnishing delivery and design stages in the app (ADR 0034): O4, A1, O5, S4. */
import type { OwnerManagedUnit, RequestProject, RequestSummary } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { attentionItems } from '../src/home/attention.js';
import { DICTIONARY } from '../src/i18n/dictionary.js';
import { langOf } from '../src/i18n/lang.js';
import { stageName } from '../src/inbox/flowWording.js';
import {
  arrangementPeriod,
  currentArrangement,
  deliveryDays,
  deliveryFormProblem,
  deliveryLines,
  hasProjectSide,
  managedUnitNames,
  monthLabel,
  stageRows,
  unitStatements,
} from '../src/managed/logic.js';

const en = langOf('en');
const fr = langOf('fr');
const TODAY = '2026-11-11';
const UNIT = 'a0X000000000002AAA';

const arrangement = (over: Partial<OwnerManagedUnit>): OwnerManagedUnit => ({
  id: 'm1',
  sfUnitId: UNIT,
  unitName: '506-JAD288-C',
  project: 'JAD 288',
  providerId: 'p-harbor',
  providerName: 'Harbor Property Management (demo)',
  source: 'complimentary',
  since: '2026-11-01',
  until: '2027-10-31',
  endedAt: null,
  current: true,
  statements: [],
  ...over,
});

const project = (over: Partial<RequestProject>): RequestProject => ({
  serviceCode: 'furnishing',
  delivery: null,
  stages: [],
  canSetDelivery: false,
  canMoveStage: false,
  nextStages: [],
  ...over,
});

describe('managed units on My unit (O4)', () => {
  it('O4: the arrangement in force for the unit, by unit id or name; past ones are not "managed"', () => {
    const now = arrangement({});
    const past = arrangement({ id: 'm0', current: false, endedAt: 1 });
    expect(currentArrangement([past, now], { sfUnitId: UNIT, unitName: null })).toBe(now);
    expect(currentArrangement([past, now], { sfUnitId: null, unitName: '506-JAD288-C' })).toBe(now);
    expect(currentArrangement([past], { sfUnitId: UNIT, unitName: null })).toBeNull();
    expect(currentArrangement([now], { sfUnitId: 'a0X000000000009AAA', unitName: null })).toBeNull();
  });

  it('O4: statements of current and past arrangements, newest month first', () => {
    const units = [
      arrangement({ id: 'm0', current: false, statements: [{ id: 's1', month: '2026-09', uploadedAt: 1 }] }),
      arrangement({ statements: [{ id: 's2', month: '2026-11', uploadedAt: 2 }] }),
      arrangement({
        id: 'mx',
        unitName: 'Other',
        sfUnitId: 'a0X000000000009AAA',
        statements: [{ id: 's3', month: '2026-10', uploadedAt: 3 }],
      }),
    ];
    expect(unitStatements(units, { sfUnitId: null, unitName: '506-JAD288-C' })).toEqual([
      { managedUnitId: 'm1', id: 's2', month: '2026-11' },
      { managedUnitId: 'm0', id: 's1', month: '2026-09' },
    ]);
  });

  it('O4: month and period read in the person’s language', () => {
    expect(monthLabel('2026-11', en.locale)).toBe('November 2026');
    expect(monthLabel('2026-11', fr.locale)).toMatch(/novembre 2026/);
    expect(monthLabel('bad', en.locale)).toBe('bad');
    expect(arrangementPeriod({ since: '2026-11-01', until: null }, en)).toBe('Since 1 Nov 2026');
    expect(arrangementPeriod({ since: '2026-11-01', until: '2027-10-31' }, en)).toBe(
      'From 1 Nov 2026 to 31 Oct 2027',
    );
  });
});

describe('approval by the manager on Home (A1)', () => {
  const waiting = (unitName: string): RequestSummary => ({
    id: unitName,
    ref: 'JAD-AAAAAA',
    emergency: false,
    emergencyType: null,
    serviceName: 'Maintenance',
    status: 'awaiting_owner',
    partnerName: null,
    partnerVerified: false,
    partnerKind: null,
    arrivalWindow: null,
    visitStatus: null,
    preferredVisit: null,
    location: { unitName, project: 'JAD 288', building: null, address: null },
    createdAt: 0,
  });

  it('A1: a tenant request on a managed unit does not ask the owner to approve', () => {
    const items = attentionItems({
      requests: [waiting('506-JAD288-C'), waiting('1204-J188')],
      overdue: null,
      now: Date.UTC(2026, 10, 11, 6),
      owner: true,
      t: en.t,
      label: (r) => r.id,
      arrival: () => null,
      invoices: [],
      invoiceDetail: () => '',
      managedUnits: managedUnitNames([arrangement({}), arrangement({ unitName: 'Old', current: false })]),
    });
    expect(items.map((i) => i.detail)).toEqual(['1204-J188']);
  });
});

describe('furnishing delivery and design stages (S4, O5)', () => {
  it('S4/O5: only furnishing and interior design requests have a project side', () => {
    expect(hasProjectSide('Furnishing')).toBe(true);
    expect(hasProjectSide('Interior Design')).toBe(true);
    expect(hasProjectSide('Maintenance')).toBe(false);
    expect(hasProjectSide(null)).toBe(false);
  });

  it('S4: "Delivery: …" and, after a move, the reason the owner sees', () => {
    expect(deliveryLines(project({}), en)).toEqual([]);
    const first = { date: '2026-11-20', slot: 'morning' as const, setAt: 1, reason: null, moves: 0 };
    expect(deliveryLines(project({ delivery: first }), en)).toEqual([
      'Delivery: Fri 20 Nov, Morning (9:00 - 12:00)',
    ]);
    expect(
      deliveryLines(project({ delivery: { ...first, moves: 1, reason: 'Supplier delay.' } }), en),
    ).toEqual(['Delivery: Fri 20 Nov, Morning (9:00 - 12:00)', 'Moved: Supplier delay.']);
  });

  it('S4: days from today on (the current date stays offered); a change needs a reason', () => {
    const days = deliveryDays(TODAY, null);
    expect(days[0]).toBe(TODAY);
    expect(days).toHaveLength(30);
    expect(deliveryDays(TODAY, '2027-03-01').at(-1)).toBe('2027-03-01');
    expect(deliveryFormProblem(null, { date: '2026-11-20', slot: 'morning', reason: '' }, TODAY)).toBeNull();
    const current = { date: '2026-11-20', slot: 'morning' as const, setAt: 1, reason: null, moves: 0 };
    expect(deliveryFormProblem(current, { date: '2026-11-21', slot: 'morning', reason: ' ' }, TODAY)).toBe(
      'delivery.reasonNeeded',
    );
    expect(
      deliveryFormProblem(current, { date: '2026-11-21', slot: 'morning', reason: 'Supplier delay.' }, TODAY),
    ).toBeNull();
    expect(deliveryFormProblem(current, { date: '2026-11-20', slot: 'morning', reason: 'x' }, TODAY)).toBe(
      'delivery.unchanged',
    );
  });

  it('O5: the stage timeline lists every stage with when it was reached and its note', () => {
    const rows = stageRows(
      project({
        serviceCode: 'interior-design',
        stages: [
          { stage: 'concept', at: Date.UTC(2026, 10, 10, 6), note: 'Mood board shared.' },
          { stage: 'design_approved', at: null, note: null },
          { stage: 'fit_out', at: null, note: null },
          { stage: 'handover', at: null, note: null },
        ],
      }),
      en,
      () => '2026-11-10',
    );
    expect(rows.map((r) => r.title)).toEqual(['Concept', 'Design approved', 'Fit-out', 'Handover']);
    expect(rows[0]).toEqual({
      title: 'Concept',
      reached: true,
      detail: 'Reached on 10 Nov 2026',
      note: 'Mood board shared.',
    });
    expect(rows[1]?.detail).toBe('Not yet');
  });

  it('O5: notifications name the design stages in every language (stage.<id>)', () => {
    for (const id of ['concept', 'design_approved', 'fit_out', 'handover']) {
      expect(stageName(id, en)).toBe(DICTIONARY.en[`stage.${id}` as 'stage.concept']);
      expect(stageName(id, langOf('zh'))).not.toBe(id);
    }
  });
});
