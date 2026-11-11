import type { PartnerJob } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { attentionTiming, groupAttention, type AttentionItem } from '../src/lib/attention';
import { documentLine, documentLines } from '../src/lib/documents';
import { groupJobs, jobClock, jobWhat, placeJob, placeText } from '../src/lib/jobs';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 10, 8, 0);

function item(kind: AttentionItem['kind'], since: number, ref = 'JAD-1'): AttentionItem {
  return {
    kind,
    requestId: kind === 'desk_request' ? null : `id-${ref}`,
    deskId: kind === 'desk_request' ? `desk-${ref}` : null,
    ref: kind === 'desk_request' ? null : ref,
    what: 'Maintenance',
    unit: 'JAD288-1102',
    partnerName: 'Demo Partner',
    since,
  };
}

describe('Needs action (ADR 0023)', () => {
  it('E4/R4/A7/A1/A3: groups by kind, most urgent first, oldest first inside a group; empty groups hidden', () => {
    const groups = groupAttention([
      item('desk_request', NOW - HOUR, 'D'),
      item('overdue', NOW - 5 * MIN, 'B'),
      item('emergency_unacknowledged', NOW - 10 * MIN, 'A'),
      item('overdue', NOW - 2 * HOUR, 'C'),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['emergency_unacknowledged', 'overdue', 'desk_request']);
    expect(groups[1]?.items.map((i) => i.ref)).toEqual(['C', 'B']);
    expect(groups[0]?.title).toBe('Emergencies nobody has acknowledged');
  });

  it('says how long it was raised for emergencies and desk requests, how late for the rest', () => {
    expect(attentionTiming({ kind: 'emergency_unacknowledged', since: NOW - 12 * MIN }, NOW)).toBe(
      'Raised 12 min ago',
    );
    expect(attentionTiming({ kind: 'desk_request', since: NOW - 2 * DAY }, NOW)).toBe('Raised 2 days ago');
    expect(attentionTiming({ kind: 'owner_approval_call', since: NOW - 3 * HOUR }, NOW)).toBe(
      'Overdue by 3 h',
    );
  });

  it('E6/E7: an on-call gap says whether the week has started', () => {
    expect(attentionTiming({ kind: 'on_call_gap', since: NOW - DAY }, NOW)).toBe('This week');
    expect(attentionTiming({ kind: 'on_call_gap', since: NOW + 2 * DAY }, NOW)).toBe('Starts in 2 days');
  });
});

function job(over: Partial<PartnerJob>): PartnerJob {
  return {
    id: 'j1',
    ref: 'JAD-1',
    emergency: false,
    emergencyType: null,
    serviceName: 'Maintenance',
    serviceCode: 'maintenance',
    status: 'scheduled',
    description: 'Dripping tap',
    nextDueAt: NOW + DAY,
    nextDueKind: 'scheduled',
    technicianId: 't1',
    arrivalWindow: null,
    preferredVisit: null,
    location: { unitName: 'JAD288-1102', project: 'JAD 288', building: 'Building B', address: null },
    createdAt: NOW - DAY,
    ...over,
  };
}

describe('Jobs board (R3, E4, S4)', () => {
  it('puts what the office must act on in "Needs you now", with the reason', () => {
    expect(placeJob(job({ emergency: true, status: 'assigned' }), NOW)).toEqual({
      column: 'now',
      reason: 'Emergency: acknowledge',
    });
    expect(placeJob(job({ nextDueAt: NOW - MIN }), NOW).reason).toBe('Overdue');
    expect(placeJob(job({ status: 'reopened' }), NOW).reason).toBe('Reopened: not done');
    expect(placeJob(job({ technicianId: null, status: 'assigned' }), NOW).reason).toBe('No technician yet');
    expect(placeJob(job({ nextDueAt: NOW + HOUR }), NOW).reason).toBe('Due soon');
  });

  it('A2/A1/A4: jobs waiting on the owner or resident go to "Waiting on the owner"', () => {
    expect(placeJob(job({ status: 'quote_sent', nextDueAt: NOW - HOUR }), NOW).column).toBe('waiting');
    expect(placeJob(job({ status: 'awaiting_owner' }), NOW).column).toBe('waiting');
    expect(placeJob(job({ status: 'completed' }), NOW).column).toBe('waiting');
  });

  it('everything else is upcoming, including on-hold work without a technician', () => {
    expect(placeJob(job({}), NOW)).toEqual({ column: 'upcoming', reason: null });
    expect(placeJob(job({ status: 'on_hold', technicianId: null, nextDueAt: null }), NOW).column).toBe(
      'upcoming',
    );
  });

  it('keeps all three columns in order and the API order inside each', () => {
    const groups = groupJobs(
      [
        job({ id: 'a' }),
        job({ id: 'b', nextDueAt: NOW - MIN }),
        job({ id: 'c' }),
        job({ id: 'd', status: 'quote_sent' }),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.title, g.jobs.map((j) => j.job.id)])).toEqual([
      ['Needs you now', ['b']],
      ['Upcoming', ['a', 'c']],
      ['Waiting on the owner', ['d']],
    ]);
  });

  it('E4: an emergency’s clock asks for the acknowledgement; others show the deadline', () => {
    expect(jobClock({ nextDueAt: NOW + 12 * MIN, nextDueKind: 'emergency_ack' }, NOW)).toBe(
      'Acknowledge in 12 min',
    );
    expect(jobClock({ nextDueAt: NOW + 3 * HOUR, nextDueKind: 'routine_response' }, NOW)).toBe('Due in 3 h');
    expect(jobClock({ nextDueAt: NOW - 5 * MIN, nextDueKind: 'emergency_ack' }, NOW)).toBe(
      'Overdue by 5 min',
    );
    expect(jobClock({ nextDueAt: null, nextDueKind: null }, NOW)).toBeNull();
  });

  it('names the job and the place', () => {
    expect(jobWhat(job({ emergency: true, emergencyType: 'water_leak' }))).toBe('Water leak (emergency)');
    expect(jobWhat(job({ serviceName: null }))).toBe('Service request');
    expect(placeText(job({}).location)).toBe('JAD288-1102 · Building B · JAD 288');
    expect(placeText(null)).toBe('Unit details with JAD+');
  });
});

describe('partner documents (S7, P3)', () => {
  it('red when lapsed or missing, amber within 30 days, green otherwise', () => {
    expect(documentLine({ kind: 'insurance', expiresOn: '2026-11-03' }, NOW)).toEqual({
      label: 'Insurance',
      standing: 'lapsed',
      tone: 'bad',
      text: 'expired 3 Nov 2026',
    });
    expect(documentLine({ kind: 'licence', expiresOn: '2026-12-01' }, NOW)).toMatchObject({
      label: 'Trade licence',
      tone: 'warn',
      text: 'expires 1 Dec 2026',
    });
    expect(documentLine({ kind: 'licence', expiresOn: '2027-06-01' }, NOW).tone).toBe('good');
    // The expiry day itself is still valid; it lapses the day after.
    expect(documentLine({ kind: 'licence', expiresOn: '2026-11-10' }, NOW).standing).toBe('expiring_soon');
  });

  it('always lists the trade licence and insurance, "not on file" when missing', () => {
    const lines = documentLines([{ kind: 'licence', expiresOn: '2027-06-01' }], NOW);
    expect(lines.map((l) => [l.label, l.text, l.tone])).toEqual([
      ['Trade licence', 'expires 1 Jun 2027', 'good'],
      ['Insurance', 'not on file', 'bad'],
    ]);
  });
});
