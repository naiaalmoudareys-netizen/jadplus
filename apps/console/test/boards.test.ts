/** The work boards of a provider workspace (ADR 0036; O3, O5, P5, S4): layout and wording. */
import type { PartnerConsultation, PartnerInspection } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { firstCallText, inspectionSections, pipelines, unitLine } from '../src/lib/boards';
import { onJobsBoard } from '../src/lib/jobs';

const NOW = Date.UTC(2026, 10, 11, 8);
const HOUR = 3_600_000;

const consultation = (over: Partial<PartnerConsultation>): PartnerConsultation => ({
  id: 'c1',
  ref: 'JAD-C1',
  serviceCode: 'leasing',
  unitName: '506-JAD288-C',
  project: 'JAD 288',
  status: 'assigned',
  steps: [],
  lastStepAt: null,
  nextDueAt: NOW + 3 * HOUR,
  createdAt: NOW - HOUR,
  ...over,
});

const inspection = (over: Partial<PartnerInspection>): PartnerInspection => ({
  id: 'i1',
  ref: 'JAD-I1',
  service: 'valuation',
  snaggingType: null,
  unitName: null,
  project: null,
  status: 'scheduled',
  nextDueAt: NOW + HOUR,
  nextDueKind: 'valuation_report',
  reports: [],
  reinspectionRequested: false,
  snagsOpen: 0,
  createdAt: NOW - HOUR,
  ...over,
});

describe('consultations pipeline (O5, P5)', () => {
  it('one pipeline per service, cards in the column of their furthest step', () => {
    const [leasing, resale] = pipelines([
      consultation({ id: 'a' }),
      consultation({ id: 'b', status: 'in_progress', steps: ['contact_made', 'listed'] }),
      consultation({ id: 'c', serviceCode: 'resale', status: 'completed', steps: ['contact_made', 'done'] }),
    ]);
    expect(leasing?.serviceName).toBe('Leasing');
    expect(leasing?.columns.map((c) => [c.label, c.items.map((i) => i.id)])).toEqual([
      ['New', ['a']],
      ['Contact made', []],
      ['Listed', ['b']],
      ['Viewings', []],
      ['Tenant found', []],
      ['Contract', []],
      ['Done', []],
      ['Did not proceed', []],
    ]);
    expect(resale?.columns.find((c) => c.id === 'done')?.items).toHaveLength(1);
  });

  it('S4: the first-call deadline reads plainly, red once it is late, and disappears after contact', () => {
    expect(firstCallText(consultation({}), NOW)).toEqual({ text: 'First call due in 3 h', tone: 'calm' });
    expect(firstCallText(consultation({ nextDueAt: NOW + HOUR }), NOW)?.tone).toBe('warn');
    expect(firstCallText(consultation({ nextDueAt: NOW - 20 * 60_000 }), NOW)).toEqual({
      text: 'First call overdue by 20 min',
      tone: 'bad',
    });
    expect(firstCallText(consultation({ status: 'in_progress' }), NOW)).toBeNull();
  });
});

describe('inspections and reports (O3)', () => {
  it('groups by what the inspection waits for', () => {
    const sections = inspectionSections([
      inspection({ id: 'due' }),
      inspection({
        id: 'snags',
        service: 'snagging',
        snaggingType: 'soft',
        reports: [{ kind: 'snagging', uploadedAt: NOW }],
        snagsOpen: 3,
      }),
      inspection({ id: 'done', status: 'closed', reports: [{ kind: 'valuation', uploadedAt: NOW }] }),
    ]);
    expect(sections.map((s) => [s.label, s.items.map((i) => i.id)])).toEqual([
      ['Report due', ['due']],
      ['Reported, snags open', ['snags']],
      ['Reported or finished', ['done']],
    ]);
    expect(unitLine({ unitName: '506-JAD288-C', project: 'JAD 288' })).toBe('506-JAD288-C · JAD 288');
    expect(unitLine({ unitName: null, project: null })).toBe('Unit name not on file');
  });
});

describe('jobs board (ADR 0036)', () => {
  it('home visits and inspections stay on the jobs board; consultations move to their own board', () => {
    expect(onJobsBoard({ serviceCode: 'maintenance' })).toBe(true);
    expect(onJobsBoard({ serviceCode: 'snagging' })).toBe(true);
    expect(onJobsBoard({ serviceCode: 'handover' })).toBe(true);
    expect(onJobsBoard({ serviceCode: 'mortgage' })).toBe(false);
    expect(onJobsBoard({ serviceCode: 'leasing' })).toBe(false);
  });
});
