/**
 * Provider companies (ADR 0030; S3, S10, P6, C-VAL-1): JAD+ Admin adds an outside partner or a JAD Global team,
 * with its first office administrator, and closes old in-house requests that nobody could take ("Mark as
 * handled by JAD+"). Payloads are strict (unknown keys rejected); the rules are pure and tested.
 */
import { z } from 'zod';
import { plainText } from './admin-platform.js';
import type { Status } from './lifecycle.js';
import { emailSchema } from './schemas.js';
import { PROVIDER_KINDS } from './services.js';

/** POST /api/admin/partners: a new provider company and the person who runs its office (partner_admin). */
export const addProviderBody = z.strictObject({
  name: plainText(120),
  kind: z.enum(PROVIDER_KINDS),
  adminName: z.string().trim().min(2).max(80),
  adminEmail: emailSchema,
});
export type AddProviderBody = z.infer<typeof addProviderBody>;

export const providerAddedResponse = z.object({
  id: z.string(),
  kind: z.enum(PROVIDER_KINDS),
  status: z.enum(['active', 'suspended']),
});

/**
 * S7/S10: a new provider starts suspended, with the reason the daily check would give, until its trade licence
 * and insurance are uploaded and verified; the daily check then reinstates it (suspended_by 'compliance').
 */
export const NEW_PROVIDER_REASON = 'Trade licence not on file; Insurance not on file';

/** Same company twice is refused: names are compared without case or extra spaces. */
export function sameProviderName(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(a) === norm(b);
}

/**
 * ADR 0030: before in-house teams became providers, in-house requests were stored with no provider and nobody
 * could finish them. JAD+ Admin may mark such a request as handled: a routine request still waiting
 * (submitted) with no provider. It then moves to "work done" and the resident confirms it, as on any job.
 */
export function canMarkHandledByJad(r: {
  readonly status: Status;
  readonly partnerId: string | null;
  readonly emergency: boolean;
}): boolean {
  return r.status === 'submitted' && r.partnerId === null && !r.emergency;
}
