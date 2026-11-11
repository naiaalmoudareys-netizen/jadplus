/** Managed units and the office menu in the console (ADR 0034; O4, A1). */
import type { PartnerCapabilities } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { officeShows, showsSnagsToFix } from '../src/lib/capabilities';
import {
  apiRowToLine,
  parseBulkLines,
  periodText,
  statementFileName,
  statementProblem,
} from '../src/lib/managed';
import { formatRoute, navFor, parseHash, routeAllowed } from '../src/lib/router';

const caps = (services: string[], managesUnits = false): PartnerCapabilities => ({
  kind: 'jad_group',
  services,
  managesUnits,
});
const labels = (c: PartnerCapabilities | null) => navFor('partner_admin', c).map((n) => n.label);

describe('the partner office menu follows what the company holds (ADR 0034)', () => {
  it('hides Handovers, Education and Managed units until the capabilities are known', () => {
    expect(labels(null)).not.toContain('Handovers');
    expect(labels(null)).not.toContain('Education');
    expect(labels(null)).not.toContain('Managed units');
    expect(labels(null)).toContain('Jobs');
    expect(showsSnagsToFix(null)).toBe(false);
  });

  it('an outside maintenance partner sees none of the in-house pages', () => {
    const c: PartnerCapabilities = { ...caps(['maintenance']), kind: 'external' };
    expect(labels(c)).not.toContain('Handovers');
    expect(labels(c)).not.toContain('Managed units');
    expect(showsSnagsToFix(c)).toBe(false);
  });

  it('each team sees its own pages; Snags to fix goes with the handover service', () => {
    expect(labels(caps(['handover']))).toContain('Handovers');
    expect(showsSnagsToFix(caps(['handover']))).toBe(true);
    expect(labels(caps(['education']))).toEqual(expect.arrayContaining(['Education']));
    expect(labels(caps(['education']))).not.toContain('Handovers');
    expect(officeShows(caps(['property-management']), 'managed_units')).toBe(true);
    expect(officeShows(caps([], true), 'managed_units')).toBe(true);
    expect(officeShows(caps(['leasing']), 'managed_units')).toBe(false);
  });

  it('keeps JAD+ Admin’s menu as it is', () => {
    expect(navFor('jad_admin', caps([])).map((n) => n.label)).toContain('Handovers');
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
