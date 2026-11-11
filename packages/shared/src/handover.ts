/**
 * Handover checklist (O2; ADR 0033): the steps from completion to key collection for one owner unit, worked
 * through by the handover team (the JAD Global team that has the owner's handover request) or JAD+ Admin, and
 * followed by the owner in My unit.
 *
 * A checklist starts from the owner's handover request (service 'handover'): the team that has the request, or
 * JAD+ Admin, opens it. One checklist per unit. The steps are fixed data, in this order (the order the app and
 * the console show them); the database mirrors the list (migration 0030, drift-tested).
 */
import { z } from 'zod';
import { plainText } from './admin-platform.js';
import { isWorkingTime, type WorkingCalendar } from './calendar.js';
import { idSchema } from './schemas.js';
import { VISIT_SLOT_KEYS, type VisitSlot } from './visits.js';

export const HANDOVER_STEPS = [
  'final_payment',
  'documents',
  'snagging',
  'utilities',
  'service_charges',
  'key_appointment',
  'keys_collected',
] as const;
export type HandoverStep = (typeof HANDOVER_STEPS)[number];

/** English names, for the console (the app has its own words in five languages). */
export const HANDOVER_STEP_LABELS: Readonly<Record<HandoverStep, string>> = {
  final_payment: 'Final payment cleared',
  documents: 'Handover documents ready',
  snagging: 'Snagging done',
  utilities: 'Utilities (DEWA / district cooling) registration',
  service_charges: 'Service charges and building access set up',
  key_appointment: 'Key collection appointment',
  keys_collected: 'Keys collected',
};

/** A staff note on a step, shown to the owner. */
export const HANDOVER_NOTE_MAX = 300;
/** How far ahead a key collection appointment may be booked. */
export const KEY_APPOINTMENT_MAX_DAYS = 180;

export interface StepState {
  readonly step: HandoverStep;
  readonly doneAt: number | null;
}

export interface ChecklistState {
  readonly steps: readonly StepState[];
  readonly completedAt: number | null;
}

const isDone = (state: ChecklistState, step: HandoverStep): boolean =>
  state.steps.some((s) => s.step === step && s.doneAt !== null);

/** Steps in the fixed order, whatever order they come in. */
export function orderedSteps<S extends { readonly step: HandoverStep }>(steps: readonly S[]): S[] {
  return [...steps].sort((a, b) => HANDOVER_STEPS.indexOf(a.step) - HANDOVER_STEPS.indexOf(b.step));
}

export function handoverProgress(state: ChecklistState): { readonly done: number; readonly total: number } {
  return { done: state.steps.filter((s) => s.doneAt !== null).length, total: HANDOVER_STEPS.length };
}

export type StepChangeRefusal = 'complete' | 'already' | 'by_appointment' | 'keys_need_all_steps';

/**
 * O2: whether a step may be ticked (done = true) or put back to pending (done = false), or why not.
 * - Once the keys are collected the checklist is complete and nothing changes any more.
 * - "Key collection appointment" is done by booking the appointment, never ticked by hand, and stays done.
 * - "Keys collected" needs every other step done.
 */
export function stepChange(
  state: ChecklistState,
  step: HandoverStep,
  done: boolean,
): StepChangeRefusal | null {
  if (state.completedAt !== null) return 'complete';
  if (step === 'key_appointment') return 'by_appointment';
  if (isDone(state, step) === done) return 'already';
  if (done && step === 'keys_collected') {
    const others = HANDOVER_STEPS.filter((s) => s !== 'keys_collected');
    if (!others.every((s) => isDone(state, s))) return 'keys_need_all_steps';
  }
  return null;
}

export const STEP_CHANGE_MESSAGES: Readonly<Record<StepChangeRefusal, string>> = {
  complete: 'The keys are collected: this handover is complete.',
  already: 'This step is already in that state.',
  by_appointment: 'Book the key collection appointment instead; that completes this step.',
  keys_need_all_steps: 'Every other step must be done before the keys are collected.',
};

export type AppointmentRefusal = 'complete' | 'payment_first' | 'not_working_day' | 'too_far' | 'in_past';

const DAY_MS = 86_400_000;
/** 10:00 Dubai (06:00 UTC): inside working hours whenever the day is a working day. */
const MID_MORNING_UTC_MS = 6 * 3_600_000;

/**
 * O2: whether the key collection appointment may be booked (or moved) to this Dubai date. The keys are handed over
 * only after the final payment has cleared; the date is a working day on the JAD+ calendar, from today up to
 * KEY_APPOINTMENT_MAX_DAYS ahead.
 */
export function appointmentRefusal(
  state: ChecklistState,
  date: string,
  today: string,
  cal: WorkingCalendar,
): AppointmentRefusal | null {
  if (state.completedAt !== null) return 'complete';
  if (!isDone(state, 'final_payment')) return 'payment_first';
  const day = Date.parse(`${date}T00:00:00Z`);
  const start = Date.parse(`${today}T00:00:00Z`);
  if (day < start) return 'in_past';
  if (day > start + KEY_APPOINTMENT_MAX_DAYS * DAY_MS) return 'too_far';
  if (!isWorkingTime(day + MID_MORNING_UTC_MS, cal)) return 'not_working_day';
  return null;
}

export const APPOINTMENT_MESSAGES: Readonly<Record<AppointmentRefusal, string>> = {
  complete: 'The keys are collected: this handover is complete.',
  payment_first: 'The final payment must be cleared before the key collection is booked.',
  not_working_day: 'Choose a working day.',
  too_far: `Choose a day within the next ${String(KEY_APPOINTMENT_MAX_DAYS)} days.`,
  in_past: 'Choose today or a later day.',
};

// ---- Payloads (strict: unknown keys rejected, C-VAL-1) ----

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** POST /api/{admin|partner}/handovers: open the checklist for the unit of a handover request. */
export const startHandoverBody = z.strictObject({ requestId: idSchema });

/** POST /api/{admin|partner}/handovers/:id/steps: tick a step, or put it back, with an optional note. */
export const handoverStepBody = z.strictObject({
  step: z.enum(HANDOVER_STEPS),
  done: z.boolean(),
  note: plainText(HANDOVER_NOTE_MAX).nullable(),
});
export type HandoverStepBody = z.infer<typeof handoverStepBody>;

/** PUT /api/{admin|partner}/handovers/:id/appointment: book or move the key collection. */
export const keyAppointmentBody = z.strictObject({
  date: dateSchema,
  slot: z.enum(VISIT_SLOT_KEYS),
});
export type KeyAppointmentBody = z.infer<typeof keyAppointmentBody>;

const appointmentView = z.object({ date: z.string(), slot: z.enum(VISIT_SLOT_KEYS) }).nullable();
export type KeyAppointment = { readonly date: string; readonly slot: VisitSlot } | null;

const stepView = z.object({
  step: z.enum(HANDOVER_STEPS),
  doneAt: z.number().nullable(),
  note: z.string().nullable(),
});

const checklistView = z.object({
  id: z.string(),
  requestId: z.string(),
  requestRef: z.string(),
  unitName: z.string().nullable(),
  project: z.string().nullable(),
  building: z.string().nullable(),
  startedAt: z.number(),
  completedAt: z.number().nullable(),
  appointment: appointmentView,
  steps: z.array(stepView),
});
export type HandoverChecklist = z.infer<typeof checklistView>;

/** GET /api/me/handovers (owners): the checklists of the owner's units. */
export const ownerHandoversResponse = z.object({ handovers: z.array(checklistView) });
export type OwnerHandovers = z.infer<typeof ownerHandoversResponse>;

/** GET /api/{admin|partner}/handovers: checklists, and handover requests still waiting for one. */
export const staffHandoversResponse = z.object({
  handovers: z.array(checklistView.extend({ partnerName: z.string().nullable() })),
  waiting: z.array(
    z.object({
      requestId: z.string(),
      requestRef: z.string(),
      unitName: z.string().nullable(),
      project: z.string().nullable(),
      building: z.string().nullable(),
      createdAt: z.number(),
      partnerName: z.string().nullable(),
    }),
  ),
});
export type StaffHandovers = z.infer<typeof staffHandoversResponse>;

export const handoverStartedResponse = z.object({ id: z.string() });
export const handoverChangedResponse = z.object({ id: z.string(), completedAt: z.number().nullable() });
