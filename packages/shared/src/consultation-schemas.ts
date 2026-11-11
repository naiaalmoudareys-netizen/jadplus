/**
 * Flow C "consultation" payloads (ADR 0031; C-VAL-1): what the owner sends, what the provider office sends, and
 * the answers the API gives. Every object is strict; the answers to the service's questions are checked against
 * consultation.ts by answersProblem().
 */
import { z } from 'zod';
import {
  CONSULTATION_CONSENT_VERSION,
  CONSULTATION_OUTCOMES,
  CONSULTATION_SERVICE_CODES,
  questionsFor,
} from './consultation.js';
import { CONSULTATION_ACTIONS } from './consultation-flow.js';
import { STATUSES } from './lifecycle.js';
import { idSchema } from './schemas.js';
import { VISIT_SLOT_KEYS } from './visits.js';

const DAY_MS = 86_400_000;
/** How far ahead a date answer ("available from") may be. */
export const ANSWER_DATE_MAX_DAYS = 366;
export const CONSULTATION_NOTE_MAX = 500;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const note = z.string().trim().min(1).max(CONSULTATION_NOTE_MAX);

/** The owner's answers: question id → option id, or a date (YYYY-MM-DD). */
export const consultationAnswers = z
  .record(z.string().regex(/^[a-z_]{1,32}$/), z.string().regex(/^[A-Za-z0-9_-]{1,32}$/))
  .refine((a) => Object.keys(a).length <= 3, 'At most 3 answers.');
export type ConsultationAnswers = z.infer<typeof consultationAnswers>;

/**
 * O5: the answers must be exactly the service's questions, each with one of its options, and a date answer must be
 * a real date from today to a year ahead. Returns what is wrong, or null.
 */
export function answersProblem(code: string, answers: ConsultationAnswers, today: string): string | null {
  const questions = questionsFor(code);
  const ids = questions.map((q) => q.id);
  if (Object.keys(answers).some((k) => !ids.includes(k))) return 'Unknown question.';
  for (const q of questions) {
    const value = answers[q.id];
    if (value === undefined) return 'Answer every question.';
    if (q.kind === 'choice' && !q.options.some((o) => o.id === value))
      return 'Choose one of the answers given.';
    if (q.kind === 'date') {
      const at = Date.parse(`${value}T00:00:00Z`);
      const real = !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === value;
      const from = Date.parse(`${today}T00:00:00Z`);
      if (!real || at < from || at > from + ANSWER_DATE_MAX_DAYS * DAY_MS) {
        return 'Choose a date within the next year.';
      }
    }
  }
  return null;
}

/** POST /api/consultations: an owner asks for a consultation for one of their units (O5; consent required). */
export const raiseConsultationBody = z.strictObject({
  sfUnitId: z
    .string()
    .regex(/^[A-Za-z0-9]+$/)
    .refine((s) => s.length === 15 || s.length === 18),
  serviceCode: z.enum(CONSULTATION_SERVICE_CODES),
  answers: consultationAnswers,
  note: z.string().trim().max(CONSULTATION_NOTE_MAX).optional(),
  /** Best time to call: a working day offered by preferredDays() (checked by the API) and a window. */
  bestDate: isoDate,
  bestSlot: z.enum(VISIT_SLOT_KEYS),
  /** The provider named in the consent on the screen; refused if the service has moved to another one since. */
  providerId: idSchema,
  /** The owner switched on "Share my name, unit and contact details with …": nothing is sent without it. */
  consent: z.literal(true),
  consentVersion: z.literal(CONSULTATION_CONSENT_VERSION),
});
export type RaiseConsultationBody = z.infer<typeof raiseConsultationBody>;

/** POST /api/partner/jobs/:id/consultation/contact-made */
export const contactMadeBody = z.strictObject({ note: note.optional() });
export type ContactMadeBody = z.infer<typeof contactMadeBody>;

/** POST /api/partner/jobs/:id/consultation/stage: the next stage reached, with an optional note for the owner. */
export const consultationStageBody = z.strictObject({
  stage: z.string().regex(/^[a-z_]{1,32}$/),
  note: note.optional(),
});
export type ConsultationStageBody = z.infer<typeof consultationStageBody>;

/** POST /api/partner/jobs/:id/consultation/close: Done, or Did not proceed with the reason the owner sees (P5). */
export const closeConsultationBody = z
  .strictObject({ outcome: z.enum(CONSULTATION_OUTCOMES), note: note.optional() })
  .refine((b) => b.outcome === 'done' || b.note !== undefined, {
    message: 'Give the reason the owner will see.',
    path: ['note'],
  });
export type CloseConsultationBody = z.infer<typeof closeConsultationBody>;

/** GET /api/requests/:id/consultation: null when the request is not a consultation. */
export const consultationResponse = z.object({
  consultation: z
    .object({
      serviceCode: z.enum(CONSULTATION_SERVICE_CODES),
      status: z.enum(STATUSES),
      answers: z.record(z.string(), z.string()),
      bestTime: z.object({ date: isoDate, slot: z.enum(VISIT_SLOT_KEYS) }).nullable(),
      /** The consent the owner gave: when, which wording, and to which provider. */
      consent: z.object({ at: z.number().int(), version: z.string(), providerName: z.string() }),
      steps: z.array(z.object({ step: z.string(), note: z.string().nullable(), at: z.number().int() })),
      /** The provider office's steps now (partner_admin only; empty for everyone else). */
      actions: z.array(z.enum(CONSULTATION_ACTIONS)),
      /** The signed-in office may open the owner's contact details (consent given to this provider). */
      contactShared: z.boolean(),
    })
    .nullable(),
});
export type ConsultationView = NonNullable<z.infer<typeof consultationResponse>['consultation']>;

/** GET /api/partner/jobs/:id/consultation/contact: shared with consent, every view audited. */
export const consultationContactResponse = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
export type ConsultationContact = z.infer<typeof consultationContactResponse>;

/** The answer to each provider step. */
export const consultationStepResponse = z.object({ id: z.string(), status: z.enum(STATUSES) });

/** GET /api/consultations/provider/:serviceCode: who would get the owner's details (named in the consent). */
export const consultationProviderResponse = z.object({
  provider: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type ConsultationProvider = z.infer<typeof consultationProviderResponse>['provider'];

/** POST /api/consultations answer. */
export const consultationRaisedResponse = z.object({
  requestId: z.string(),
  ref: z.string(),
  sentTo: z.string(),
});
export type ConsultationRaised = z.infer<typeof consultationRaisedResponse>;
