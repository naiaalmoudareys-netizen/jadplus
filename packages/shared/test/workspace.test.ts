/** Provider workspaces (ADR 0036): each demo company gets exactly its own pages, title and overview sections. */
import { describe, expect, it } from 'vitest';
import {
  consultationColumn,
  consultationColumns,
  firstCallDue,
  firstCallState,
  inspectionGroup,
} from '../src/workspace-boards.js';
import { overviewSections, workspaceFor, type WorkspaceInput } from '../src/workspace.js';

const harborPm: WorkspaceInput = {
  kind: 'jad_group',
  services: ['handover', 'property-management'],
  inHand: [],
  managesUnits: true,
};
const harborRe: WorkspaceInput = {
  kind: 'jad_group',
  services: ['leasing', 'resale', 'valuation', 'education'],
  inHand: [],
  managesUnits: false,
};
const demoFixers: WorkspaceInput = {
  kind: 'external',
  services: ['maintenance', 'snagging', 'mortgage', 'furnishing', 'interior-design', 'golden-visa'],
  inHand: [],
  managesUnits: false,
};

describe('workspace pages (ADR 0036)', () => {
  it('Harbor Property Management: handovers, snags to fix, managed units, no quotes, invoices or after-hours', () => {
    const ws = workspaceFor(harborPm);
    expect(ws.title).toBe('Property management & handover');
    expect(ws.pages).toEqual([
      'overview',
      'dispatch',
      'jobs',
      'consultations',
      'inspections',
      'handovers',
      'snags',
      'messages',
      'managed_units',
      'team',
      'performance',
      'documents',
    ]);
    expect(ws.services.map((s) => s.name)).toEqual(['Handover Management', 'Property Management']);
  });

  it('Harbor Real Estate: consultations, valuation reports and education; no dispatch, jobs or invoices', () => {
    const ws = workspaceFor(harborRe);
    expect(ws.title).toBe('Sales & leasing advisory');
    expect(ws.also).toEqual([]);
    expect(ws.pages).toEqual([
      'overview',
      'consultations',
      'inspections',
      'messages',
      'education',
      'team',
      'documents',
    ]);
  });

  it('Demo Fixers: home services first, also finance advisory; quotes, after-hours, rate card, invoices', () => {
    const ws = workspaceFor(demoFixers);
    expect(ws.title).toBe('Maintenance & home services');
    expect(ws.also).toEqual(['Finance & residency advisory']);
    expect(ws.areas).toEqual(['home', 'advisory']);
    expect(ws.pages).toEqual([
      'overview',
      'dispatch',
      'jobs',
      'consultations',
      'inspections',
      'quotes',
      'messages',
      'team',
      'performance',
      'after_hours',
      'documents',
      'rate_card',
      'invoices',
    ]);
  });

  it('A2: handover is never quoted, so a handover-only team has no Quotes page', () => {
    const ws = workspaceFor({ kind: 'jad_group', services: ['handover'], inHand: [], managesUnits: false });
    expect(ws.title).toBe('Handover management');
    expect(ws.pages).not.toContain('quotes');
    expect(ws.pages).not.toContain('managed_units');
  });

  it('E1-E7: only a maintenance provider has after-hours contacts', () => {
    const furnish = workspaceFor({
      kind: 'external',
      services: ['furnishing'],
      inHand: [],
      managesUnits: false,
    });
    expect(furnish.pages).toContain('quotes');
    expect(furnish.pages).not.toContain('after_hours');
  });

  it('ADR 0036: JAD Global teams never get invoices or a rate card, outside partners always do', () => {
    const team = workspaceFor({
      kind: 'jad_group',
      services: ['maintenance'],
      inHand: [],
      managesUnits: false,
    });
    expect(team.pages).not.toContain('invoices');
    expect(team.pages).not.toContain('rate_card');
    const partner = workspaceFor({ kind: 'external', services: [], inHand: [], managesUnits: false });
    expect(partner.pages).toEqual(['overview', 'team', 'documents', 'rate_card', 'invoices']);
    expect(partner.title).toBe('Partner office');
  });

  it('O4: a team that manages units today has Managed units even without the service', () => {
    const ws = workspaceFor({ kind: 'jad_group', services: [], inHand: [], managesUnits: true });
    expect(ws.title).toBe('Property management');
    expect(ws.pages).toContain('managed_units');
  });

  it('work in hand keeps its pages after JAD+ ends the assignment, so open jobs can be finished', () => {
    const ws = workspaceFor({ kind: 'external', services: [], inHand: ['maintenance'], managesUnits: false });
    expect(ws.title).toBe('Maintenance & home services');
    expect(ws.pages).toContain('jobs');
    expect(ws.services).toEqual([]);
  });

  it('a company with no work at all is named by its kind', () => {
    const ws = workspaceFor({ kind: 'jad_group', services: [], inHand: [], managesUnits: false });
    expect(ws.title).toBe('JAD Global team');
    expect(ws.pages).toEqual(['overview', 'team', 'documents']);
  });
});

describe('overview sections (ADR 0036)', () => {
  it('each demo company stacks its own sections, main work first', () => {
    // Harbor PM holds no report service: its soft snagging is on the handovers section, never counted twice.
    expect(overviewSections(workspaceFor(harborPm))).toEqual(['handover', 'managed', 'consultations']);
    expect(overviewSections(workspaceFor(harborRe))).toEqual(['consultations', 'reports', 'education']);
    expect(overviewSections(workspaceFor(demoFixers))).toEqual(['visits', 'reports', 'consultations']);
  });
});

describe('consultation pipeline (O5, P5)', () => {
  it('columns: New, Contact made, the service stages, Done, Did not proceed', () => {
    expect(consultationColumns('leasing').map((c) => c.label)).toEqual([
      'New',
      'Contact made',
      'Listed',
      'Viewings',
      'Tenant found',
      'Contract',
      'Done',
      'Did not proceed',
    ]);
  });

  it('a consultation sits at its outcome, else its furthest stage, else contact made, else new', () => {
    expect(consultationColumn('leasing', [])).toBe('new');
    expect(consultationColumn('leasing', ['contact_made'])).toBe('contact_made');
    expect(consultationColumn('leasing', ['contact_made', 'viewings', 'listed'])).toBe('viewings');
    expect(consultationColumn('leasing', ['contact_made', 'listed', 'did_not_proceed'])).toBe(
      'did_not_proceed',
    );
  });

  it('S4: the first call is owed only while the consultation waits for contact', () => {
    expect(firstCallDue({ status: 'assigned', nextDueAt: 10 })).toBe(10);
    expect(firstCallDue({ status: 'in_progress', nextDueAt: 10 })).toBeNull();
    expect(firstCallState(5, 10, 20)).toBe('overdue');
    expect(firstCallState(15, 10, 20)).toBe('today');
    expect(firstCallState(25, 10, 20)).toBe('later');
    expect(firstCallState(null, 10, 20)).toBeNull();
  });
});

describe('inspections and reports (O3, S4)', () => {
  const base = {
    service: 'snagging' as const,
    status: 'in_progress' as const,
    reports: [],
    reinspectionRequested: false,
    snagsOpen: 0,
  };
  it('report due until the report of its kind is on file, and again after a re-inspection is asked for', () => {
    expect(inspectionGroup(base)).toBe('report_due');
    const reported = { ...base, reports: [{ kind: 'snagging' }] };
    expect(inspectionGroup({ ...reported, snagsOpen: 2 })).toBe('snags_open');
    expect(inspectionGroup(reported)).toBe('done');
    expect(inspectionGroup({ ...reported, reinspectionRequested: true })).toBe('report_due');
    expect(inspectionGroup({ ...base, status: 'closed' })).toBe('done');
  });
});
