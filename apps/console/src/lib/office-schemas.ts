/**
 * Answers of partner office changes that have no schema in packages/shared (C-VAL-1: every answer is checked).
 * They mirror apps/api/src/partner/routes.ts, requests/partner-flow.ts, requests/partner-visit.ts,
 * requests/photos.ts and partner/company/dispatch.ts. Objects are not strict: the API may add a field.
 */
import { STATUSES } from '@jadplus/shared';
import { z } from 'zod';

const status = z.enum(STATUSES);

/** POST /api/partner/jobs/:id/acknowledge (E4). */
export const acknowledgedResponse = z.object({ id: z.string(), status, onTime: z.boolean() });

/** POST /api/partner/jobs/:id/visit, /quote, /start, /done, /no-access. */
export const jobStepResponse = z.object({ id: z.string(), status });

/** POST /api/partner/jobs/:id/make-safe (E8). */
export const makeSafeRecordedResponse = z.object({ id: z.string(), amountAed: z.number() });

/** POST /api/requests/:id/photos (201). */
export const photoAddedResponse = z.object({ id: z.string() });

/** POST /api/partner/technicians/:id/unavailable (201). */
export const unavailableAddedResponse = z.object({ id: z.string() });
