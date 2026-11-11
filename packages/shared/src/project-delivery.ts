/**
 * After the owner approves the quote (ADR 0034; O5, S4):
 *
 * - Furnishing: the provider sets the delivery date and a time window in writing (S4: "delivery date in
 *   writing"), from the console job page or the technician app. Moving it later needs a reason the owner sees.
 * - Interior design: optional project stages, Concept → Design approved → Fit-out → Handover, moved forward by
 *   the provider's office with an optional note; the owner sees a small stage timeline.
 *
 * Pure rules; the API enforces them and the apps only show what they allow. The stage ids mirror the CHECK list
 * in migration 0032 (drift-tested). Notes and reasons are shown to the owner; contact details in them are masked
 * before saving (ADR 0009).
 */
import { z } from 'zod';
import { plainText } from './admin-platform.js';
import type { Role, Status } from './lifecycle.js';
import { VISIT_SLOT_KEYS, type VisitSlot } from './visits.js';

export const DELIVERY_SERVICE_CODE = 'furnishing';
export const DESIGN_SERVICE_CODE = 'interior-design';

export const PROJECT_STAGES = ['concept', 'design_approved', 'fit_out', 'handover'] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

/** English names for the console (the app has its own words in five languages). */
export const PROJECT_STAGE_LABELS: Readonly<Record<ProjectStage, string>> = {
  concept: 'Concept',
  design_approved: 'Design approved',
  fit_out: 'Fit-out',
  handover: 'Handover',
};

/** A delivery is at most this far ahead. */
export const DELIVERY_MAX_DAYS = 365;
export const DELIVERY_REASON_MAX = 300;
export const STAGE_NOTE_MAX = 500;

/** While the work runs: after the quote is approved (scheduled) and until the provider finishes. */
const DELIVERY_STATUSES: ReadonlySet<Status> = new Set<Status>(['scheduled', 'in_progress']);
/** Stages may still be moved when the work is marked done (the handover often is the last step). */
const STAGE_STATUSES: ReadonlySet<Status> = new Set<Status>(['scheduled', 'in_progress', 'completed']);

export interface ProjectState {
  readonly serviceCode: string;
  readonly status: Status;
  /** The owner approved a quote on this request (L4). */
  readonly quoteApproved: boolean;
}

const isProvider = (role: Role): boolean => role === 'partner' || role === 'partner_admin';

/** S4: whether the provider may set or move the delivery date now (furnishing, after the approved quote). */
export function deliveryAllowed(role: Role, s: ProjectState): boolean {
  return (
    isProvider(role) &&
    s.serviceCode === DELIVERY_SERVICE_CODE &&
    s.quoteApproved &&
    DELIVERY_STATUSES.has(s.status)
  );
}

export type DeliveryRefusal = 'in_past' | 'too_far' | 'reason_needed' | 'unchanged';

export interface DeliveryChoice {
  readonly date: string;
  readonly slot: VisitSlot;
  readonly reason: string | null;
}

/**
 * S4 (ADR 0034): the first delivery date needs no reason; moving it needs one (the owner sees it). The date is
 * today or later, within DELIVERY_MAX_DAYS. Choosing the same date and window again changes nothing.
 */
export function deliveryRefusal(
  current: { readonly date: string; readonly slot: VisitSlot } | null,
  next: DeliveryChoice,
  today: string,
): DeliveryRefusal | null {
  if (next.date < today) return 'in_past';
  const ahead = (Date.parse(`${next.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  if (ahead > DELIVERY_MAX_DAYS) return 'too_far';
  if (current === null) return null;
  if (current.date === next.date && current.slot === next.slot) return 'unchanged';
  return next.reason === null ? 'reason_needed' : null;
}

export const DELIVERY_MESSAGES: Readonly<Record<DeliveryRefusal, string>> = {
  in_past: 'Choose today or a later day.',
  too_far: `Choose a day within the next ${String(DELIVERY_MAX_DAYS)} days.`,
  reason_needed: 'Give the reason for the new date; the owner sees it.',
  unchanged: 'This is already the delivery date and time.',
};

/** C: whether the provider's office may move the design project's stage now (interior design, quote approved). */
export function stagesAllowed(role: Role, s: ProjectState): boolean {
  return (
    role === 'partner_admin' &&
    s.serviceCode === DESIGN_SERVICE_CODE &&
    s.quoteApproved &&
    STAGE_STATUSES.has(s.status)
  );
}

/** The stage reached last, or null before the first. */
export function currentProjectStage(reached: readonly string[]): ProjectStage | null {
  let current: ProjectStage | null = null;
  for (const s of PROJECT_STAGES) if (reached.includes(s)) current = s;
  return current;
}

/** Stages move forward only; skipping is allowed (the same rule as consultation stages, ADR 0031). */
export function nextProjectStages(reached: readonly string[]): readonly ProjectStage[] {
  const current = currentProjectStage(reached);
  return PROJECT_STAGES.slice(current === null ? 0 : PROJECT_STAGES.indexOf(current) + 1);
}

/** The owner's timeline: every stage in order, reached or not. */
export function projectTimeline(
  reached: readonly { readonly stage: string; readonly at: number; readonly note: string | null }[],
): { readonly stage: ProjectStage; readonly at: number | null; readonly note: string | null }[] {
  return PROJECT_STAGES.map((stage) => {
    const hit = reached.find((r) => r.stage === stage);
    return { stage, at: hit?.at ?? null, note: hit?.note ?? null };
  });
}

// ---- Payloads (strict, C-VAL-1) ----

/** PUT /api/partner/jobs/:id/delivery: set or move the delivery date. */
export const deliveryBody = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(VISIT_SLOT_KEYS),
  reason: plainText(DELIVERY_REASON_MAX).nullable(),
});
export type DeliveryBody = z.infer<typeof deliveryBody>;

/** POST /api/partner/jobs/:id/project-stage: the next stage reached, with an optional note. */
export const projectStageBody = z.strictObject({
  stage: z.enum(PROJECT_STAGES),
  note: plainText(STAGE_NOTE_MAX).nullable(),
});
export type ProjectStageBody = z.infer<typeof projectStageBody>;

/** GET /api/requests/:id/project: the delivery date (furnishing) and stages (interior design). */
export const requestProjectResponse = z.object({
  serviceCode: z.string(),
  delivery: z
    .object({
      date: z.string(),
      slot: z.enum(VISIT_SLOT_KEYS),
      setAt: z.number(),
      /** The reason given for the latest move, or null for the first date. */
      reason: z.string().nullable(),
      /** How many times it was moved. */
      moves: z.number().int(),
    })
    .nullable(),
  stages: z.array(
    z.object({
      stage: z.enum(PROJECT_STAGES),
      at: z.number().nullable(),
      note: z.string().nullable(),
    }),
  ),
  canSetDelivery: z.boolean(),
  canMoveStage: z.boolean(),
  nextStages: z.array(z.enum(PROJECT_STAGES)),
});
export type RequestProject = z.infer<typeof requestProjectResponse>;
