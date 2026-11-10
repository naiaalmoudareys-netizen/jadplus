/**
 * Answers the console reads that have no schema in packages/shared yet (C-VAL-1: every answer is checked).
 * They mirror apps/api/src/admin/routes.ts and apps/api/src/partner/office.ts. Objects are not strict, as in
 * shared/responses.ts: the API may add a field without breaking the console.
 */
import { z } from 'zod';

/** GET /api/admin/partner-review (S6, S7, P3). */
export const partnerReviewResponse = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      partner: z.object({ id: z.string(), name: z.string(), status: z.string() }),
      kind: z.string(),
      detail: z.unknown(),
      openedAt: z.number().int(),
      resolvedAt: z.number().int().nullable(),
      resolutionNote: z.string().nullable(),
    }),
  ),
});
export type PartnerReviewItem = z.infer<typeof partnerReviewResponse>['items'][number];

/** POST /api/admin/partner-review/:id/resolve. */
export const reviewResolvedResponse = z.object({ id: z.string(), resolvedAt: z.number().int() });

/** POST /api/admin/partners/:id/status. */
export const partnerStatusChangedResponse = z.object({
  id: z.string(),
  status: z.enum(['active', 'suspended']),
});

/** POST /api/partner/team (201). */
export const technicianAddedResponse = z.object({ id: z.string() });

/** POST /api/partner/team/:id/remove. */
export const technicianRemovedResponse = z.object({ id: z.string(), status: z.literal('removed') });

/** POST /api/partner/jobs/:id/technician. */
export const technicianAssignedResponse = z.object({ id: z.string(), technicianId: z.string() });

/** What each review item is about, in plain words (migration 0008 kinds). */
export const REVIEW_KIND_LABELS: Readonly<Record<string, string>> = {
  low_rating: 'Low ratings (below 4.0 over 30 days)',
  missed_emergencies: 'Missed emergencies (2 or more in 90 days)',
  safety_breach: 'Safety breach',
  honesty_breach: 'Honesty breach',
  document_expiring: 'Licence or insurance expiring',
  suspended: 'Suspended by the daily check',
  open_jobs: 'Open jobs while suspended',
};

export function reviewKindLabel(kind: string): string {
  return REVIEW_KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');
}

/** The facts the daily check records with an item (apps/api/src/jobs/partner-review.ts). */
const reviewDetail = z.object({
  reason: z.string().optional(),
  jobs: z.number().optional(),
  document: z.string().optional(),
  expiresOn: z.string().optional(),
  average: z.number().optional(),
  ratings: z.number().optional(),
  missed: z.number().optional(),
});

/** "Average 3.4 from 5 ratings", "insurance expires 2026-12-01"; null when there is nothing to add. */
export function reviewDetailText(detail: unknown): string | null {
  const parsed = reviewDetail.safeParse(detail);
  if (!parsed.success) return null;
  const d = parsed.data;
  const parts = [
    d.reason,
    d.average === undefined ? undefined : `average ${d.average} from ${d.ratings ?? 0} ratings`,
    d.missed === undefined ? undefined : `${d.missed} missed`,
    d.jobs === undefined ? undefined : `${d.jobs} open jobs`,
    d.document === undefined ? undefined : `${d.document} expires ${d.expiresOn ?? 'soon'}`,
  ].filter((p): p is string => p !== undefined && p !== '');
  return parts.length === 0 ? null : parts.join('; ');
}
