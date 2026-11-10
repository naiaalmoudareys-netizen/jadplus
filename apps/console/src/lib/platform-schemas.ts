/**
 * Answers of JAD+ Admin platform changes that have no schema in packages/shared yet (C-VAL-1: every answer is
 * checked). They mirror apps/api/src/admin/platform/*.ts, platform.ts and routes.ts. Objects are not strict:
 * the API may add a field without breaking the console.
 */
import { z } from 'zod';

const partnerRef = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['active', 'suspended', 'ended']),
});

/** 201 on POST /api/admin/building-contacts, POST /api/admin/notices; PUT /api/admin/guide. */
export const createdResponse = z.object({ id: z.string() });

/** DELETE /api/admin/building-contacts/:id and DELETE /api/admin/guide/:id. */
export const removedResponse = z.object({ id: z.string(), removed: z.literal(true) });

/** POST /api/admin/services/:code/listed (S1, S2). */
export const serviceListedResponse = z.object({ code: z.string(), listed: z.boolean() });

/** POST /api/admin/services/:code/partners (S3). */
export const servicePartnersResponse = z.object({
  code: z.string(),
  primary: partnerRef.nullable(),
  backup: partnerRef.nullable(),
});

/** POST /api/admin/notices/:id/withdraw (V1). */
export const noticeWithdrawnResponse = z.object({ id: z.string(), withdrawnAt: z.number().int() });

/** POST /api/admin/offer-interests/:id/handled (N2). */
export const interestHandledResponse = z.object({ id: z.string(), handledAt: z.number().int() });

/** PUT /api/admin/on-call/:week (E6, E7). */
export const onCallSetResponse = z.object({
  weekStarting: z.string(),
  first: z.string(),
  second: z.string(),
});
