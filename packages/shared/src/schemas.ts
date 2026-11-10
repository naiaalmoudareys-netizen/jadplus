/**
 * zod schemas for API payloads (docs/SECURITY.md C-VAL-1), shared by the API and the apps.
 * Every object is strict: unknown keys are rejected, not silently dropped.
 */
import { z } from 'zod';
import { CLIENTS } from './auth.js';
import { EMERGENCY_TYPES, LIFE_SAFETY_TYPES } from './emergency.js';
import { ROLES } from './lifecycle.js';

/** Emails are compared lower-cased and trimmed, so the blind index is stable. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address.' }));

export const signInCodeSchema = z.string().regex(/^\d{6}$/, 'The code is 6 digits.');

const userRoleSchema = z.enum(ROLES).exclude(['system']);
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** POST /api/auth/code — ask for a sign-in code by email. */
export const requestCodeBody = z.strictObject({ email: emailSchema });

/** POST /api/auth/verify — exchange the code for a session. */
export const verifyCodeBody = z.strictObject({
  email: emailSchema,
  code: signInCodeSchema,
  client: z.enum(CLIENTS),
});

/** POST /api/auth/switch — move the session to another view the person holds (R5, U7). */
export const switchContextBody = z.strictObject({
  role: userRoleSchema,
  partnerId: idSchema.nullable(),
});

export type RequestCodeBody = z.infer<typeof requestCodeBody>;
export type VerifyCodeBody = z.infer<typeof verifyCodeBody>;
export type SwitchContextBody = z.infer<typeof switchContextBody>;

/** Salesforce record ids are 15 or 18 letters/digits. */
export const sfIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9]+$/, 'Not a valid unit reference.')
  .refine((s) => s.length === 15 || s.length === 18, 'Not a valid unit reference.');

/**
 * POST /api/emergencies — raise an emergency (E1-E3, E12, E14). A tenant names their tenancy; an owner names
 * the unit. Exactly one of the two is given.
 */
export const raiseEmergencyBody = z
  .strictObject({
    tenancyId: idSchema.optional(),
    sfUnitId: sfIdSchema.optional(),
    type: z.enum([...EMERGENCY_TYPES, ...LIFE_SAFETY_TYPES]),
    faultSource: z.enum(['unit', 'building', 'neighbour', 'fire_system']).default('unit'),
    description: z.string().trim().min(1).max(2000),
  })
  .refine((b) => (b.tenancyId === undefined) !== (b.sfUnitId === undefined), {
    message: 'Give either the tenancy or the unit.',
  });

/** POST /api/partner/jobs/:id/acknowledge — name the technician and arrival window (E4). */
export const acknowledgeEmergencyBody = z.strictObject({
  technicianId: idSchema,
  arrivalWindowStart: z.number().int().positive(),
  arrivalWindowEnd: z.number().int().positive(),
});

export const requestIdParam = z.strictObject({ id: idSchema });

export type RaiseEmergencyBody = z.infer<typeof raiseEmergencyBody>;
export type AcknowledgeEmergencyBody = z.infer<typeof acknowledgeEmergencyBody>;
