/** Managed units, the office menu and the office header in the console (ADR 0034, 0036; O4, A1). */
import { workspaceFor, type PartnerWorkspace, type WorkspaceInput } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import {
  apiRowToLine,
  parseBulkLines,
  periodText,
  statementFileName,
  statementProblem,
} from '../src/lib/managed';
import { navFor, navGroups, officeRouteAllowed } from '../src/lib/nav';
import { formatRoute, parseHash, routeAllowed } from '../src/lib/router';
import { officeHeader, workspaceSummary } from '../src/lib/workspace';

const input = (kind: WorkspaceInput['kind'], services: string[], managesUnits = false): WorkspaceInput => ({
  kind,
  services,
  inHand: [],
  managesUnits,
});
const PM = input('jad_group', ['handover', 'property-management'], true);
const RE = input('jad_group', ['leasing', 'resale', 'valuation', 'education']);
const FIXERS = input('external', [
  'maintenance',
  'snagging',
  'mortgage',
  'furnishing',
  'interior-design',
  'golden-visa',
]);
const labels = (i: WorkspaceInput) => navFor('partner_admin', workspaceFor(i).pages).map((n) => n.label);
const office = (name: string, i: WorkspaceInput): PartnerWorkspace => ({
  id: 'p-1',
  name,
  kind: i.kind,
  managesUnits: i.managesUnits,
  workspace: workspaceFor(i),
});

describe('each office menu is exactly its workspace (ADR 0036)', () => {
  it('nothing shows until the workspace is known', () => {
    expect(navFor('partner_admin', null)).toEqual([]);
  });

  it('Harbor Property Management: handovers, snags to fix and managed units, grouped', () => {
    expect(
      navGroups('partner_admin', workspaceFor(PM).pages).map((g) => [g.label, g.items.map((n) => n.label)]),
    ).toEqual([
      ['Today', ['Overview', 'Dispatch']],
      ['Work', ['Jobs', 'Consultations', 'Reports', 'Handovers', 'Snags to fix', 'Messages']],
      ['Clients', ['Managed units']],
      ['Company', ['Team', 'Performance', 'Documents']],
    ]);
  });

  it('Harbor Real Estate: consultations, reports and education; no dispatch, jobs, quotes or invoices', () => {
    expect(labels(RE)).toEqual([
      'Overview',
      'Consultations',
      'Reports',
      'Education',
      'Messages',
      'Team',
      'Documents',
    ]);
  });

  it('Demo Fixers: home services with quotes, after-hours, rate card and invoices; no in-house pages', () => {
    const l = labels(FIXERS);
    expect(l).toEqual(
      expect.arrayContaining(['Dispatch', 'Jobs', 'Quotes', 'After-hours', 'Rate card', 'Invoices']),
    );
    for (const page of ['Handovers', 'Snags to fix', 'Managed units', 'Education'])
      expect(l).not.toContain(page);
  });

  it('an office cannot open a page outside its workspace, even by typing the address', () => {
    const re = workspaceFor(RE).pages;
    expect(officeRouteAllowed({ name: 'dispatch', date: null }, re)).toBe(false);
    expect(officeRouteAllowed({ name: 'handover', id: 'h1' }, re)).toBe(false);
    expect(officeRouteAllowed({ name: 'education_session', id: 's1' }, re)).toBe(true);
    expect(officeRouteAllowed({ name: 'request', id: 'r1' }, re)).toBe(true);
    expect(officeRouteAllowed({ name: 'invoices' }, workspaceFor(PM).pages)).toBe(false);
  });

  it('the header names the company, its kind, its workspace and its services as chips', () => {
    const h = officeHeader(office('Demo Fixers LLC', FIXERS));
    expect(h.company).toBe('Demo Fixers LLC');
    expect(h.kind.label).toBe('Partner');
    expect(h.title).toBe('Maintenance & home services');
    expect(h.also).toBe('Also: Finance & residency advisory');
    expect(h.chips).toEqual([
      'Maintenance',
      'Snagging & Inspection',
      'Mortgage & Finance',
      'Furnishing',
      'Interior Design',
      'Golden Visa',
    ]);
    const pm = officeHeader(office('Harbor Property Management (demo)', PM));
    expect([pm.kind.label, pm.title, pm.also]).toEqual([
      'JAD Global team',
      'Property management & handover',
      null,
    ]);
  });

  it('JAD+ Admin reads each provider’s workspace and the pages its console shows', () => {
    expect(workspaceSummary(RE)).toEqual({
      title: 'Sales & leasing advisory',
      pages: ['Overview', 'Consultations', 'Reports', 'Education', 'Messages', 'Team', 'Documents'],
    });
    expect(navFor('jad_admin').map((n) => n.label)).not.toContain('Managed units');
  });

  it('routes the managed-unit pages for the office only', () => {
    expect(parseHash('#/managed-units')).toEqual({ name: 'managed_units' });
    expect(parseHash('#/managed-units/m_1')).toEqual({ name: 'managed_unit', id: 'm_1' });
    expect(formatRoute({ name: 'managed_unit', id: 'm_1' })).toBe('#/managed-units/m_1');
    expect(formatRoute({ name: 'managed_units' })).toBe('#/managed-units');
    expect(routeAllowed({ name: 'managed_units' }, 'partner_admin')).toBe(true);
    expect(routeAllowed({ name: 'managed_unit', id: 'x' }, 'jad_admin')).toBe(false);
  });
});

describe('bulk entry of complimentary management (O4)', () => {
  it('reads one unit per line, comma or tab, skipping empty lines; emails lower-cased', () => {
    const r = parseBulkLines(
      '506-JAD288-C, Demo@JadPlus.ae, 2027-11-30\n\n1204-J188\tdemo2@jadplus.ae\t2027-12-31\n',
    );
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([
      { unitName: '506-JAD288-C', ownerEmail: 'demo@jadplus.ae', until: '2027-11-30' },
      { unitName: '1204-J188', ownerEmail: 'demo2@jadplus.ae', until: '2027-12-31' },
    ]);
  });

  it('names the line of every problem', () => {
    const r = parseBulkLines(
      '506-JAD288-C, demo@jadplus.ae\nX, not-an-email, 2027-01-01\nY, demo@jadplus.ae, 31/12/2027',
    );
    expect(r.rows).toEqual([]);
    expect(r.problems.map((p) => p.row)).toEqual([1, 2, 3]);
    expect(parseBulkLines('  \n').problems).toHaveLength(1);
  });

  it('maps the API’s row numbers back to the typed lines (empty lines skipped)', () => {
    const text = 'A, demo@jadplus.ae, 2027-01-01\n\nB, demo@jadplus.ae, 2027-01-01';
    expect(apiRowToLine(text, 1)).toBe(1);
    expect(apiRowToLine(text, 2)).toBe(3);
  });
});

describe('statements and words (O4)', () => {
  it('checks the month and the PDF before sending', () => {
    const pdf = { type: 'application/pdf', size: 1000 };
    expect(statementProblem('2026-11', pdf)).toBeNull();
    expect(statementProblem('2026-13', pdf)).not.toBeNull();
    expect(statementProblem('2026-11', null)).not.toBeNull();
    expect(statementProblem('2026-11', { type: 'image/png', size: 10 })).not.toBeNull();
    expect(statementProblem('2026-11', { type: 'application/pdf', size: 21 * 1024 * 1024 })).not.toBeNull();
  });

  it('never takes a file name from the server', () => {
    expect(statementFileName('506-JAD288-C', '2026-11')).toBe('jadplus-statement-506-JAD288-C-2026-11.pdf');
    expect(statementFileName('../x y', '2026-11')).toBe('jadplus-statement-xy-2026-11.pdf');
    expect(statementFileName(null, '2026-11')).toBe('jadplus-statement-unit-2026-11.pdf');
  });

  it('shows the period', () => {
    expect(periodText('2026-11-01', null)).toBe('Since 1 Nov 2026');
    expect(periodText('2026-11-01', '2027-10-31')).toBe('1 Nov 2026 – 31 Oct 2027');
  });
});
