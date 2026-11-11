import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALENDAR,
  HANDOVER_STEPS,
  HANDOVER_STEP_LABELS,
  appointmentRefusal,
  handoverProgress,
  handoverStepBody,
  keyAppointmentBody,
  orderedSteps,
  stepChange,
  type ChecklistState,
  type HandoverStep,
} from '../src/index.js';

const NOW = Date.UTC(2026, 10, 9, 8, 0, 0);

function state(done: readonly HandoverStep[], completedAt: number | null = null): ChecklistState {
  return {
    steps: HANDOVER_STEPS.map((step) => ({ step, doneAt: done.includes(step) ? NOW : null })),
    completedAt,
  };
}

const allButKeys = HANDOVER_STEPS.filter((s) => s !== 'keys_collected');

describe('handover checklist (O2)', () => {
  it('O2: the steps run from final payment to keys collected, in that order, each with a console name', () => {
    expect(HANDOVER_STEPS[0]).toBe('final_payment');
    expect(HANDOVER_STEPS.at(-1)).toBe('keys_collected');
    expect(HANDOVER_STEPS.indexOf('key_appointment')).toBe(HANDOVER_STEPS.length - 2);
    for (const step of HANDOVER_STEPS) expect(HANDOVER_STEP_LABELS[step].length).toBeGreaterThan(0);
    const shuffled = [...HANDOVER_STEPS].reverse().map((step) => ({ step }));
    expect(orderedSteps(shuffled).map((s) => s.step)).toEqual([...HANDOVER_STEPS]);
  });

  it('O2: progress counts the steps done out of seven', () => {
    expect(handoverProgress(state([]))).toEqual({ done: 0, total: 7 });
    expect(handoverProgress(state(['final_payment', 'documents']))).toEqual({ done: 2, total: 7 });
  });

  it('O2: a step is ticked or put back; the appointment step only by booking it', () => {
    expect(stepChange(state([]), 'documents', true)).toBeNull();
    expect(stepChange(state(['documents']), 'documents', true)).toBe('already');
    expect(stepChange(state(['documents']), 'documents', false)).toBeNull();
    expect(stepChange(state([]), 'documents', false)).toBe('already');
    expect(stepChange(state([]), 'key_appointment', true)).toBe('by_appointment');
    expect(stepChange(state(['key_appointment']), 'key_appointment', false)).toBe('by_appointment');
  });

  it('O2: keys are collected only after every other step; then the checklist is locked', () => {
    expect(stepChange(state(['final_payment']), 'keys_collected', true)).toBe('keys_need_all_steps');
    expect(stepChange(state(allButKeys.filter((s) => s !== 'utilities')), 'keys_collected', true)).toBe(
      'keys_need_all_steps',
    );
    expect(stepChange(state(allButKeys), 'keys_collected', true)).toBeNull();
    const complete = state([...HANDOVER_STEPS], NOW);
    expect(stepChange(complete, 'documents', false)).toBe('complete');
    expect(stepChange(complete, 'keys_collected', false)).toBe('complete');
  });

  it('O2: key collection is booked after the final payment, on a working day, within 180 days', () => {
    const today = '2026-11-09';
    const paid = state(['final_payment']);
    expect(appointmentRefusal(state([]), '2026-11-12', today, DEFAULT_CALENDAR)).toBe('payment_first');
    expect(appointmentRefusal(paid, '2026-11-12', today, DEFAULT_CALENDAR)).toBeNull();
    expect(appointmentRefusal(paid, today, today, DEFAULT_CALENDAR)).toBeNull();
    expect(appointmentRefusal(paid, '2026-11-08', today, DEFAULT_CALENDAR)).toBe('in_past');
    expect(appointmentRefusal(paid, '2026-11-14', today, DEFAULT_CALENDAR)).toBe('not_working_day');
    expect(appointmentRefusal(paid, '2027-06-30', today, DEFAULT_CALENDAR)).toBe('too_far');
    expect(appointmentRefusal(state([...HANDOVER_STEPS], NOW), '2026-11-12', today, DEFAULT_CALENDAR)).toBe(
      'complete',
    );
  });

  it('O2/C-VAL-1: step and appointment payloads are strict; notes are plain text', () => {
    expect(handoverStepBody.safeParse({ step: 'documents', done: true, note: null }).success).toBe(true);
    expect(handoverStepBody.safeParse({ step: 'documents', done: true, note: '<script>' }).success).toBe(
      false,
    );
    expect(handoverStepBody.safeParse({ step: 'party', done: true, note: null }).success).toBe(false);
    expect(handoverStepBody.safeParse({ step: 'documents', done: true, note: null, by: 'x' }).success).toBe(
      false,
    );
    expect(keyAppointmentBody.safeParse({ date: '2026-11-12', slot: 'morning' }).success).toBe(true);
    expect(keyAppointmentBody.safeParse({ date: '12/11/2026', slot: 'morning' }).success).toBe(false);
    expect(keyAppointmentBody.safeParse({ date: '2026-11-12', slot: 'night' }).success).toBe(false);
  });
});
