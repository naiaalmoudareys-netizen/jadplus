// Reports and snag lists in the console (O3, S4, L2, C-UPL-1; ADR 0032).
import { describe, expect, it } from 'vitest';
import { dueKindText } from '../src/lib/jobs';
import {
  REPORT_KIND_LABELS,
  reportFileName,
  reportProblem,
  snagContext,
  snagPhotoProblem,
  snagPhotoUrl,
  snagSummary,
} from '../src/lib/reports';

const MB = 1024 * 1024;

describe('report upload checks (O3, C-UPL-1)', () => {
  it('O3: a PDF of at most 20 MB', () => {
    expect(reportProblem(null)).toBe('Choose the report PDF first.');
    expect(reportProblem({ type: 'image/png', size: 10 })).toBe('The report must be a PDF.');
    expect(reportProblem({ type: 'application/pdf', size: 20 * MB + 1 })).toBe(
      'The report can be up to 20 MB.',
    );
    expect(reportProblem({ type: 'application/pdf', size: 0 })).toBe('The report can be up to 20 MB.');
    expect(reportProblem({ type: 'application/pdf', size: 20 * MB })).toBeNull();
  });

  it('O3: snag photos are JPEG or PNG, up to 10 MB', () => {
    expect(snagPhotoProblem({ type: 'image/gif', size: 10 })).toBe('Photos must be JPEG or PNG.');
    expect(snagPhotoProblem({ type: 'image/jpeg', size: 10 * MB + 1 })).toBe('A photo can be up to 10 MB.');
    expect(snagPhotoProblem({ type: 'image/png', size: 10 })).toBeNull();
  });
});

describe('report and snag texts (O3, S4)', () => {
  it('O3: the saved file name never comes from the server', () => {
    expect(reportFileName('JAD-7KQ4M2', 'reinspection')).toBe('jadplus-JAD-7KQ4M2-reinspection-report.pdf');
    expect(reportFileName('../x"', 'valuation')).toBe('jadplus-x-valuation-report.pdf');
    expect(REPORT_KIND_LABELS.valuation).toBe('Valuation report');
  });

  it('O3: the snag list summary and where a snag is', () => {
    expect(snagSummary([])).toBe('No snags listed.');
    expect(snagSummary(['open', 'fixed', 'confirmed'])).toBe('3 snags: 1 open, 1 fixed, 1 confirmed');
    expect(snagSummary(['open'])).toBe('1 snag: 1 open, 0 fixed, 0 confirmed');
    expect(snagContext({ ref: 'JAD-7KQ4M2', unit: 'JAD288-1102', project: 'JAD 288' })).toBe(
      'JAD-7KQ4M2 · JAD288-1102 · JAD 288',
    );
    expect(snagContext({ ref: 'JAD-7KQ4M2', unit: null, project: null })).toBe(
      'JAD-7KQ4M2 · Unit details with JAD+',
    );
    expect(snagPhotoUrl('r/1', 's 1', 'fix')).toBe('/api/requests/r%2F1/snags/s%201/photo/fix');
  });

  it('S4: the report deadlines read in plain words', () => {
    expect(dueKindText('snagging_report')).toBe('Send the snagging report');
    expect(dueKindText('reinspection_booking')).toBe('Book the re-inspection');
    expect(dueKindText('reinspection_report')).toBe('Send the re-inspection report');
  });
});
