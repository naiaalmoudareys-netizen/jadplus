/**
 * The shapes of API answers the apps rely on (C-VAL-1 in both directions). The apps validate every answer
 * with these schemas, and the API's tests check its answers against them, so the two cannot drift apart.
 * Objects are not strict here: the API may add a field without breaking an older app.
 */
import { z } from 'zod';
import { EMERGENCY_TYPES, LIFE_SAFETY_TYPES } from './emergency.js';
import { ROLES, STATUSES } from './lifecycle.js';

const roleContext = z.object({
  role: z.enum(ROLES).exclude(['system']),
  partnerId: z.string().nullable(),
});
export type RoleContextView = z.infer<typeof roleContext>;

/** POST /api/auth/verify and POST /api/auth/switch. */
export const sessionResponse = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.number().int(),
  context: roleContext,
  contexts: z.array(roleContext),
});
export type SessionResponse = z.infer<typeof sessionResponse>;

/** GET /api/auth/me. */
export const meResponse = z.object({
  userId: z.string(),
  role: z.enum(ROLES).exclude(['system']),
  partnerId: z.string().nullable(),
  client: z.enum(['mobile', 'console']),
  contexts: z.array(roleContext),
});
export type MeResponse = z.infer<typeof meResponse>;

/** POST /api/auth/code. */
export const codeSentResponse = z.object({ message: z.string() });

/** GET /api/partner/jobs (R3). */
export const partnerJobsResponse = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      ref: z.string(),
      emergency: z.boolean(),
      emergencyType: z.enum([...EMERGENCY_TYPES, ...LIFE_SAFETY_TYPES]).nullable(),
      status: z.enum(STATUSES),
      description: z.string(),
      nextDueAt: z.number().int().nullable(),
      nextDueKind: z.string().nullable(),
      technicianId: z.string().nullable(),
      arrivalWindow: z.object({ start: z.number().int(), end: z.number().int() }).nullable(),
      createdAt: z.number().int(),
    }),
  ),
});
export type PartnerJob = z.infer<typeof partnerJobsResponse>['jobs'][number];

/** GET /api/partner/team (E4, E17). */
export const partnerTeamResponse = z.object({
  partner: z.object({ id: z.string(), name: z.string(), status: z.string() }).nullable(),
  technicians: z.array(z.object({ id: z.string(), name: z.string(), self: z.boolean() })),
});
export type PartnerTeam = z.infer<typeof partnerTeamResponse>;

/** Error answers: a plain message, sometimes a code (e.g. "not_emergency"). */
export const errorResponse = z.object({ error: z.string(), code: z.string().optional() });
