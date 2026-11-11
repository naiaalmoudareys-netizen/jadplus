/**
 * How "Your handover" (O2; ADR 0033) is worded: which checklist belongs to the unit shown, the step names, the
 * key collection appointment and the dates. Pure functions, tested without a phone.
 */
import {
  HANDOVER_STEPS,
  VISIT_SLOTS,
  handoverProgress,
  type HandoverChecklist,
  type HandoverStep,
  type KeyAppointment,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import { localDate } from '../i18n/format.js';
import type { Lang } from '../i18n/lang.js';
import { visitSlotText } from '../i18n/sharedLabels.js';
import { dayLabel } from '../jobs/format.js';

export const STEP_KEYS: Readonly<Record<HandoverStep, MessageKey>> = {
  final_payment: 'handover.step.final_payment',
  documents: 'handover.step.documents',
  snagging: 'handover.step.snagging',
  utilities: 'handover.step.utilities',
  service_charges: 'handover.step.service_charges',
  key_appointment: 'handover.step.key_appointment',
  keys_collected: 'handover.step.keys_collected',
};

/** The checklist of the unit shown in My unit (matched by its Salesforce unit name), or null. */
export function handoverForUnit(
  handovers: readonly HandoverChecklist[],
  unitName: string | null,
): HandoverChecklist | null {
  if (unitName === null) return null;
  return handovers.find((h) => h.unitName === unitName) ?? null;
}

/** "3 of 7 steps done", or the welcome line once the keys are collected. */
export function progressLine(h: HandoverChecklist, lang: Lang): string {
  if (h.completedAt !== null) return lang.t('handover.complete');
  const { done, total } = handoverProgress(h);
  return lang.t('handover.progress', { done, total });
}

/** "Thu 12 Nov · Morning (9:00 - 12:00)". */
export function appointmentLine(appointment: KeyAppointment, lang: Lang): string | null {
  if (appointment === null) return null;
  const slot = VISIT_SLOTS.find((s) => s.key === appointment.slot);
  return lang.t('handover.appointment', {
    day: dayLabel(appointment.date, lang.locale),
    slot: slot === undefined ? appointment.slot : visitSlotText(slot, lang.t),
  });
}

/** "Done on 10 November 2026", or "To do". */
export function stepState(doneAt: number | null, lang: Lang): string {
  return doneAt === null
    ? lang.t('handover.pending')
    : lang.t('handover.done', { date: localDate(doneAt, lang.locale) });
}

export interface StepLine {
  readonly step: HandoverStep;
  readonly title: string;
  readonly state: string;
  readonly done: boolean;
  readonly note: string | null;
}

/** Every step, in the fixed order, ready to show. */
export function stepLines(h: HandoverChecklist, lang: Lang): StepLine[] {
  return HANDOVER_STEPS.map((step) => {
    const s = h.steps.find((x) => x.step === step);
    const doneAt = s?.doneAt ?? null;
    return {
      step,
      title: lang.t(STEP_KEYS[step]),
      state: stepState(doneAt, lang),
      done: doneAt !== null,
      note: s?.note ?? null,
    };
  });
}

/** The owner may ask for another key collection time while the keys are not yet collected. */
export function canAskToChange(h: HandoverChecklist): boolean {
  return h.completedAt === null && h.appointment !== null;
}
