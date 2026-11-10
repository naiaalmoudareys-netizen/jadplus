import { describe, expect, it } from 'vitest';
import {
  NO_AUDIT_FILTERS,
  auditFilterProblem,
  auditQuery,
  detailLines,
  exactlyAt,
  guideRows,
  monthName,
  onCallPage,
  placeName,
  reaching,
  weekEditable,
} from '../src/lib/platform';
import {
  noticeWithdrawnResponse,
  onCallSetResponse,
  removedResponse,
  servicePartnersResponse,
} from '../src/lib/platform-schemas';

const project = 'JAD 288';
const towerA = { project, building: 'Tower A' };
const towerB = { project, building: 'Tower B' };
const whole = { project, building: null };
const other = { project: 'Other Project', building: 'Tower A' };

describe('building pages (ADR 0025)', () => {
  it('E12: a building page lists only the contacts kept for that exact place', () => {
    const contacts = [
      { id: 'a', ...towerA },
      { id: 'b', ...towerB },
      { id: 'p', ...whole },
      { id: 'o', ...other },
    ];
    expect(exactlyAt(contacts, towerA).map((c) => c.id)).toEqual(['a']);
    expect(exactlyAt(contacts, whole).map((c) => c.id)).toEqual(['p']);
  });

  it('V1: a building page shows its own notices and the project-wide ones, never a neighbour’s', () => {
    const notices = [
      { id: 'a', ...towerA },
      { id: 'b', ...towerB },
      { id: 'p', ...whole },
      { id: 'o', ...other },
    ];
    expect(reaching(notices, towerA).map((n) => n.id)).toEqual(['a', 'p']);
  });

  it('home guide: a building’s own section replaces the project’s; otherwise the project text shows', () => {
    const sections = [
      { id: 'pw', section: 'water' as const, ...whole },
      { id: 'pa', section: 'ac' as const, ...whole },
      { id: 'aa', section: 'ac' as const, ...towerA },
    ];
    const rows = guideRows(sections, towerA);
    expect(rows.map((r) => r.section)).toEqual([
      'ac',
      'water',
      'waste',
      'parking',
      'access',
      'amenities',
      'other',
    ]);
    expect(rows[0]).toMatchObject({ own: { id: 'aa' }, inherited: null });
    expect(rows[1]).toMatchObject({ own: null, inherited: { id: 'pw' } });
    expect(rows[2]).toMatchObject({ own: null, inherited: null });
    // The project page itself never "inherits".
    expect(guideRows(sections, whole)[1]).toMatchObject({ own: { id: 'pw' }, inherited: null });
  });

  it('names a place in plain words', () => {
    expect(placeName(towerA)).toBe('Tower A · JAD 288');
    expect(placeName(whole)).toBe('JAD 288 (whole project)');
  });
});

describe('audit log filters (C-AUD-1)', () => {
  it('turns Dubai dates into day bounds and passes paging', () => {
    const q = auditQuery(
      { action: ' partner_suspended ', actor: 'u1', target: '', from: '2026-11-01', to: '2026-11-10' },
      42,
    );
    expect(q).toEqual({
      action: 'partner_suspended',
      actor: 'u1',
      target: '',
      from: String(Date.UTC(2026, 9, 31, 20)),
      to: String(Date.UTC(2026, 10, 10, 20)),
      before: '42',
    });
    expect(auditQuery(NO_AUDIT_FILTERS, null)).toMatchObject({ from: null, to: null, before: null });
  });

  it('refuses filters the API would refuse, with a plain reason', () => {
    expect(auditFilterProblem(NO_AUDIT_FILTERS)).toBeNull();
    expect(auditFilterProblem({ ...NO_AUDIT_FILTERS, action: 'Drop Table' })).toMatch(/small letters/);
    expect(auditFilterProblem({ ...NO_AUDIT_FILTERS, actor: 'a/b' })).toMatch(/id/);
    expect(auditFilterProblem({ ...NO_AUDIT_FILTERS, from: '2026-11-10', to: '2026-11-01' })).toMatch(
      /before/,
    );
    expect(auditFilterProblem({ ...NO_AUDIT_FILTERS, from: '2026-02-31' })).toMatch(/real/);
  });

  it('shows a detail record as lines', () => {
    expect(detailLines({ kind: 'insurance', count: 2, ok: true, none: null })).toEqual([
      'kind: insurance',
      'count: 2',
      'ok: true',
      'none: —',
    ]);
    expect(detailLines(null)).toEqual([]);
  });
});

describe('on-call calendar (E6, E7)', () => {
  it('E6/E7: pages through 8 weeks at a time; past weeks are read-only', () => {
    expect(onCallPage('2026-11-09', 1)).toBe('2027-01-04');
    expect(onCallPage('2026-11-09', -1)).toBe('2026-09-14');
    expect(weekEditable('2026-11-02', '2026-11-09')).toBe(false);
    expect(weekEditable('2026-11-09', '2026-11-09')).toBe(true);
    expect(weekEditable('2026-11-16', '2026-11-09')).toBe(true);
  });
});

describe('settings and answers (C-VAL-1)', () => {
  it('E14: names the AC season months', () => {
    expect([5, 6, 9].map(monthName)).toEqual(['May', 'June', 'September']);
  });

  it('S3, V1, N2: change answers are checked before a page trusts them', () => {
    expect(
      servicePartnersResponse.safeParse({
        code: 'maintenance',
        primary: { id: 'p1', name: 'Demo Partner', status: 'active' },
        backup: null,
      }).success,
    ).toBe(true);
    expect(servicePartnersResponse.safeParse({ code: 'maintenance', primary: 'p1' }).success).toBe(false);
    expect(removedResponse.safeParse({ id: 'c1', removed: true }).success).toBe(true);
    expect(removedResponse.safeParse({ id: 'c1', removed: false }).success).toBe(false);
    expect(noticeWithdrawnResponse.safeParse({ id: 'n1', withdrawnAt: 'now' }).success).toBe(false);
    expect(
      onCallSetResponse.safeParse({ weekStarting: '2026-11-09', first: 'u1', second: 'u2' }).success,
    ).toBe(true);
  });
});
