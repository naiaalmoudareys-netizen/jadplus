/** Partner job screens: R3 clock and next action, E4 acknowledgement and arrival choices. */
import { arrivalChoices, arrivalWindowAllowed, type PartnerJob } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { arrivalLabel, dueLabel, isOverdue, jobTitle, needsAcknowledgement } from '../src/jobs/format.js';

const NOW = Date.UTC(2026, 10, 9, 8, 0, 0);
const MIN = 60_000;

const job = (over: Partial<PartnerJob> = {}): PartnerJob => ({
  id: 'r-1',
  ref: 'JAD-7KQ4M2',
  emergency: true,
  emergencyType: 'water_leak',
  serviceName: 'Maintenance',
  status: 'assigned',
  description: 'Water coming through the ceiling.',
  nextDueAt: NOW + 12 * MIN,
  nextDueKind: 'emergency_ack',
  technicianId: null,
  arrivalWindow: null,
  preferredVisit: null,
  location: null,
  createdAt: NOW - 3 * MIN,
  ...over,
});

describe('job clock (R3)', () => {
  it('R3: shows the next action and the time left', () => {
    expect(dueLabel(job(), NOW)).toBe('Acknowledge in 12 min');
    expect(dueLabel(job({ nextDueAt: NOW + 135 * MIN, nextDueKind: 'on_site' }), NOW)).toBe(
      'Due in 2 h 15 min',
    );
    expect(dueLabel(job({ nextDueAt: null, nextDueKind: null }), NOW)).toBeNull();
  });

  it('R3: overdue jobs say by how much and are marked', () => {
    const late = job({ nextDueAt: NOW - 3 * MIN });
    expect(dueLabel(late, NOW)).toBe('Overdue by 3 min');
    expect(isOverdue(late, NOW)).toBe(true);
    expect(isOverdue(job(), NOW)).toBe(false);
  });

  it('names the job and shows the promised arrival in Dubai time', () => {
    expect(jobTitle(job())).toBe('Water leak');
    expect(jobTitle(job({ emergency: false, emergencyType: null }))).toBe('Maintenance');
    expect(jobTitle(job({ emergency: false, emergencyType: null, serviceName: 'Furnishing' }))).toBe(
      'Furnishing',
    );
    expect(jobTitle(job({ emergency: false, emergencyType: null, serviceName: null }))).toBe(
      'Service request',
    );
    expect(arrivalLabel(job({ arrivalWindow: { start: NOW, end: NOW + 120 * MIN } }))).toBe(
      'Arriving 12:00-14:00',
    );
  });
});

describe('acknowledging (E4)', () => {
  it('E4: only an emergency still waiting for acknowledgement offers the Acknowledge step', () => {
    expect(needsAcknowledgement(job())).toBe(true);
    expect(needsAcknowledgement(job({ status: 'scheduled' }))).toBe(false);
    expect(needsAcknowledgement(job({ emergency: false }))).toBe(false);
  });

  it('E4: every arrival window the app offers is one the API accepts', () => {
    for (const t of [NOW, NOW + 7 * MIN, NOW + 59_999]) {
      for (const w of arrivalChoices(t)) expect(arrivalWindowAllowed(w.start, w.end, t)).toBe(true);
    }
  });
});
