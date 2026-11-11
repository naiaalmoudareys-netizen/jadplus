/**
 * The snag list of a snagging inspection (BUILD_SPEC O3; ADR 0032): with the report, the inspector lists each
 * snag (what, where, an optional photo). Each snag is then fixed by the JAD Global handover team or the
 * snagging provider (with a photo of the fix), and the owner confirms the fix or reopens the snag. When no snag
 * is open the owner may ask for the free re-inspection (reports.ts).
 *
 * Mirrors the CHECK lists of migration 0029 (drift-tested).
 */
import { z } from 'zod';
import type { UserRole } from './auth.js';
import { idSchema } from './schemas.js';

/** Mirrors snags.status (migration 0029). */
export const SNAG_STATUSES = ['open', 'fixed', 'confirmed'] as const;
export type SnagStatus = (typeof SNAG_STATUSES)[number];

/** The history of a snag (append-only). Mirrors snag_events.kind (migration 0029). */
export const SNAG_EVENT_KINDS = [
  'added',
  'photo_added',
  'removed',
  'fixed',
  'confirmed',
  'reopened',
] as const;
export type SnagEventKind = (typeof SNAG_EVENT_KINDS)[number];

export type SnagStep = 'fix' | 'confirm' | 'reopen';

/** O3: open → fixed (with a photo) → confirmed by the owner, or reopened (back to open). Null: not allowed. */
export function snagStep(from: SnagStatus, step: SnagStep): SnagStatus | null {
  if (step === 'fix') return from === 'open' ? 'fixed' : null;
  if (from !== 'fixed') return null;
  return step === 'confirm' ? 'confirmed' : 'open';
}

/**
 * O3: who may mark a snag fixed: the provider the snagging request is assigned to, or a JAD Global team
 * assigned to the handover service (the developer side, which fixes snags before handover). Nobody else.
 */
export function mayFixSnag(
  actor: { readonly role: UserRole; readonly partnerId: string | null },
  requestPartnerId: string | null,
  handoverTeams: readonly string[],
): boolean {
  if (actor.role !== 'partner' && actor.role !== 'partner_admin') return false;
  if (actor.partnerId === null) return false;
  return actor.partnerId === requestPartnerId || handoverTeams.includes(actor.partnerId);
}

/** Most snags one inspection may list. */
export const MAX_SNAGS = 200;

/** POST /api/requests/:id/snags (the inspector, before the report is uploaded). */
export const addSnagBody = z.strictObject({
  title: z.string().trim().min(1).max(200),
  room: z.string().trim().min(1).max(100),
});
export type AddSnagBody = z.infer<typeof addSnagBody>;

/** POST /api/requests/:id/snags/:snagId/decision (the owner, on a fixed snag). */
export const snagDecisionBody = z.strictObject({ confirm: z.boolean() });
export type SnagDecisionBody = z.infer<typeof snagDecisionBody>;

export const snagParam = z.strictObject({ id: idSchema, snagId: idSchema });
export const snagPhotoParam = snagParam.extend({ which: z.enum(['snag', 'fix']) });

const snag = z.object({
  id: z.string(),
  title: z.string(),
  room: z.string(),
  status: z.enum(SNAG_STATUSES),
  hasPhoto: z.boolean(),
  hasFixPhoto: z.boolean(),
  fixedAt: z.number().int().nullable(),
  reopenCount: z.number().int(),
});
export type Snag = z.infer<typeof snag>;

/** GET /api/requests/:id/snags */
export const snagListResponse = z.object({
  snags: z.array(snag),
  /** What the signed-in person may do on the list now. */
  canAdd: z.boolean(),
  canFix: z.boolean(),
  canDecide: z.boolean(),
});
export type SnagList = z.infer<typeof snagListResponse>;

/** GET /api/partner/snags: snags waiting for a fix, for the handover team and snagging providers. */
export const snagsToFixResponse = z.object({
  snags: z.array(
    snag.extend({
      requestId: z.string(),
      ref: z.string(),
      unit: z.string().nullable(),
      project: z.string().nullable(),
    }),
  ),
});
export type SnagToFix = z.infer<typeof snagsToFixResponse>['snags'][number];

/** POST answers that create or change a snag. */
export const snagChangedResponse = z.object({ id: z.string(), status: z.enum(SNAG_STATUSES) });
