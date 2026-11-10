/**
 * zod schemas for API payloads (docs/SECURITY.md C-VAL-1), shared by the API and the apps.
 * Every object is strict: unknown keys are rejected, not silently dropped.
 */
import { z } from 'zod';
import { CLIENTS } from './auth.js';
import { MESSAGE_MAX_LENGTH } from './conversation.js';
import { RAISABLE_EMERGENCY_TYPES } from './emergency.js';
import { ROLES } from './lifecycle.js';
import { isMonday } from './oncall.js';
import { normalisePhone, type SignInIdentifier } from './owners.js';

/** Emails are compared lower-cased and trimmed, so the blind index is stable. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address.' }));

export const signInCodeSchema = z.string().regex(/^\d{6}$/, 'The code is 6 digits.');

const userRoleSchema = z.enum(ROLES).exclude(['system']);
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** Mobile numbers are stored in international form (+971…), so the blind index is stable. */
export const phoneSchema = z
  .string()
  .max(25)
  .transform((raw, ctx) => {
    const phone = normalisePhone(raw);
    if (phone === null) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid mobile number.' });
      return z.NEVER;
    }
    return phone;
  });

const identifierFields = { email: emailSchema.optional(), phone: phoneSchema.optional() };
const ONE_IDENTIFIER = { message: 'Give either your email or your mobile number.' };
const exactlyOne = (b: { email?: string | undefined; phone?: string | undefined }): boolean =>
  (b.email === undefined) !== (b.phone === undefined);

/** POST /api/auth/code — ask for a sign-in code by email or mobile number (C-AUTH-3). */
export const requestCodeBody = z.strictObject(identifierFields).refine(exactlyOne, ONE_IDENTIFIER);

/** POST /api/auth/verify — exchange the code for a session. */
export const verifyCodeBody = z
  .strictObject({ ...identifierFields, code: signInCodeSchema, client: z.enum(CLIENTS) })
  .refine(exactlyOne, ONE_IDENTIFIER);

/** The email or mobile number a validated sign-in body names (exactly one is present). */
export function identifierOf(b: {
  email?: string | undefined;
  phone?: string | undefined;
}): SignInIdentifier {
  if (b.email !== undefined) return { kind: 'email', value: b.email };
  if (b.phone !== undefined) return { kind: 'phone', value: b.phone };
  throw new Error('A sign-in body must name an email or a mobile number.');
}

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
 * POST /api/emergencies — raise an emergency (E1, E2, E12, E14; ADR 0017: water leak or AC failure only). A tenant names their tenancy; an owner names
 * the unit. Exactly one of the two is given.
 */
export const raiseEmergencyBody = z
  .strictObject({
    tenancyId: idSchema.optional(),
    sfUnitId: sfIdSchema.optional(),
    type: z.enum(RAISABLE_EMERGENCY_TYPES),
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

/** GET /api/admin/partner-review — the S6/S7 review list; open items by default. */
export const reviewListQuery = z.strictObject({ status: z.enum(['open', 'all']).default('open') });

/** POST /api/admin/partner-review/:id/resolve — what the admin decided (kept as evidence). */
export const resolveReviewBody = z.strictObject({ note: z.string().trim().min(1).max(1000) });

const mondaySchema = z.string().refine(isMonday, 'Weeks start on a Monday (YYYY-MM-DD).');

/** GET /api/admin/on-call?from=YYYY-MM-DD — rota weeks from that Monday on. */
export const onCallQuery = z.strictObject({ from: mondaySchema.optional() });

/** PUT /api/admin/on-call/:week — who is on call that week (section 11). */
export const onCallWeekParam = z.strictObject({ week: mondaySchema });
export const setOnCallBody = z
  .strictObject({ first: idSchema, second: idSchema })
  .refine((b) => b.first !== b.second, { message: 'Two different people are needed on call.' });

export type ResolveReviewBody = z.infer<typeof resolveReviewBody>;
export type SetOnCallBody = z.infer<typeof setOnCallBody>;

/** POST /api/requests/:id/messages — a message on a request, inside JAD+ (ADR 0009). */
export const postMessageBody = z.strictObject({
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});
export type PostMessageBody = z.infer<typeof postMessageBody>;
