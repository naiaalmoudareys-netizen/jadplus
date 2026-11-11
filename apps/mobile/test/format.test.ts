/** Partner job screens: R3 clock and next action, E4 acknowledgement and arrival choices. */
import { arrivalChoices, arrivalWindowAllowed, type PartnerJob } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { langOf, translator } from '../src/i18n/lang.js';
import {
  dueLabel,
  isOverdue,
  jobTitle,
  needsAcknowledgement,
  statusLabel,
  visitLine,
} from '../src/jobs/format.js';

const en = translator('en');
const fr = translator('fr');

const NOW = Date.UTC(2026, 10, 9, 8, 0, 0);
const MIN = 60_000;

const job = (over: Partial<PartnerJob> = {}): PartnerJob => ({
  id: 'r-1',
  ref: 'JAD-7KQ4M2',
  emergency: true,
  emergencyType: 'water_leak',
  serviceName: 'Maintenance',
  serviceCode: 'maintenance',
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
    expect(dueLabel(job(), NOW, en)).toBe('Acknowledge in 12 min');
    expect(dueLabel(job({ nextDueAt: NOW + 135 * MIN, nextDueKind: 'on_site' }), NOW, en)).toBe(
      'Due in 2 h 15 min',
    );
    expect(dueLabel(job({ nextDueAt: null, nextDueKind: null }), NOW, en)).toBeNull();
  });

  it('R3: overdue jobs say by how much and are marked', () => {
    const late = job({ nextDueAt: NOW - 3 * MIN });
    expect(dueLabel(late, NOW, en)).toBe('Overdue by 3 min');
    expect(isOverdue(late, NOW)).toBe(true);
    expect(isOverdue(job(), NOW)).toBe(false);
  });

  it('names the job and shows the promised arrival in Dubai time', () => {
    expect(jobTitle(job(), en)).toBe('Water leak');
    expect(jobTitle(job({ emergency: false, emergencyType: null }), en)).toBe('Maintenance');
    expect(jobTitle(job({ emergency: false, emergencyType: null, serviceName: 'Furnishing' }), en)).toBe(
      'Furnishing',
    );
    expect(jobTitle(job({ emergency: false, emergencyType: null, serviceName: null }), en)).toBe(
      'Service request',
    );
    expect(
      visitLine(
        job({ status: 'scheduled', arrivalWindow: { start: NOW, end: NOW + 120 * MIN } }),
        langOf('en'),
      ),
    ).toBe('Arriving 12:00-14:00');
  });

  it('A5: a completed job shows when it was visited, not the arrival window', () => {
    const window = { start: NOW, end: NOW + 120 * MIN };
    expect(visitLine(job({ status: 'completed', arrivalWindow: window }), langOf('en'))).toBe(
      'Visited Mon 9 Nov',
    );
    expect(visitLine(job({ status: 'in_progress', arrivalWindow: window }), langOf('en'))).toBe(
      'Arriving 12:00-14:00',
    );
    expect(visitLine(job({ status: 'reopened', arrivalWindow: window }), langOf('en'))).toBeNull();
    expect(visitLine(job({ status: 'cancelled', arrivalWindow: window }), langOf('en'))).toBeNull();
  });
});

describe('jobs in another language (ADR 0016)', () => {
  it('words the clock, title, status and arrival in French', () => {
    expect(dueLabel(job(), NOW, fr)).toBe('À confirmer dans 12 min');
    expect(dueLabel(job({ nextDueAt: NOW - 135 * MIN, nextDueKind: 'on_site' }), NOW, fr)).toBe(
      'En retard de 2 h 15 min',
    );
    expect(jobTitle(job(), fr)).toBe("Fuite d'eau");
    expect(jobTitle(job({ emergency: false, emergencyType: null }), fr)).toBe('Maintenance');
    expect(jobTitle(job({ emergency: false, emergencyType: null, serviceName: 'Furnishing' }), fr)).toBe(
      'Ameublement',
    );
    expect(jobTitle(job({ emergency: false, emergencyType: null, serviceName: 'New Service' }), fr)).toBe(
      'New Service',
    );
    expect(statusLabel('assigned', en)).toBe('New: acknowledge');
    expect(statusLabel('assigned', fr)).toBe('Nouveau : à confirmer');
    expect(
      visitLine(
        job({ status: 'scheduled', arrivalWindow: { start: NOW, end: NOW + 120 * MIN } }),
        langOf('fr'),
      ),
    ).toBe('Arrivée 12:00-14:00');
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
