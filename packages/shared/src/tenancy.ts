/**
 * Tenants (ADR 0021; R2, O4, A1, U4, U5): the owner invites a tenant to one unit for fixed dates; the tenant
 * accepts in the app; the tenant's routine requests wait for the owner's approval (emergencies never do, E1);
 * the tenant is warned 30 days before the end, access ends on the end date by itself, and the owner can extend
 * in one tap or end it early.
 */
import { z } from 'zod';
import { emailSchema, idSchema, phoneSchema, sfIdSchema } from './schemas.js';

export const TENANCY_WARNING_DAYS = 30;
/** A tenancy is at most 3 years at a time (it can be extended). */
export const MAX_TENANCY_DAYS = 3 * 366;
/** A1: the owner is reminded after 24 hours; JAD+ calls the owner after 48 hours. */
export const APPROVAL_REMINDER_HOURS = 24;
export const APPROVAL_CALL_HOURS = 48;

const DAY = 86_400_000;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

/** `date` (YYYY-MM-DD) moved by `days`. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/**
 * Dates an owner may give: the end after the start, at most 3 years long, the start no more than 30 days in
 * the past (a tenant already living there) and the end not in the past.
 */
export function tenancyDatesAllowed(startsOn: string, endsOn: string, today: string): boolean {
  const length = daysBetween(startsOn, endsOn);
  return length > 0 && length <= MAX_TENANCY_DAYS && daysBetween(startsOn, today) <= 30 && endsOn >= today;
}

/** An extension: a new end after the current one and after today, within 3 years of today. */
export function extensionAllowed(currentEnd: string, newEnd: string, today: string): boolean {
  return newEnd > currentEnd && newEnd > today && daysBetween(today, newEnd) <= MAX_TENANCY_DAYS;
}

/** U4: the tenant (and owner) are warned on the day 30 days before the end. */
export function endingSoon(endsOn: string, today: string): boolean {
  const left = daysBetween(today, endsOn);
  return left >= 0 && left <= TENANCY_WARNING_DAYS;
}

/** POST /api/owner/tenancies: invite a tenant (exactly one of email or mobile). */
export const inviteTenantBody = z
  .strictObject({
    sfUnitId: sfIdSchema,
    name: z.string().trim().min(2).max(80),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    startsOn: isoDate,
    endsOn: isoDate,
  })
  .refine((b) => (b.email === undefined) !== (b.phone === undefined), {
    message: 'Give the tenant’s email or mobile number.',
  });
export type InviteTenantBody = z.infer<typeof inviteTenantBody>;

/** POST /api/owner/tenancies/:id/extend */
export const extendTenancyBody = z.strictObject({ endsOn: isoDate });
export type ExtendTenancyBody = z.infer<typeof extendTenancyBody>;

/** POST /api/requests/:id/approval (owner, A1). */
export const approvalBody = z.strictObject({ decision: z.enum(['approve', 'decline']) });
export type ApprovalBody = z.infer<typeof approvalBody>;

export const tenancyIdParam = z.strictObject({ id: idSchema });

const tenancyStatus = z.enum(['invited', 'active', 'ended', 'revoked']);

/** GET /api/owner/tenancies: the owner's tenancies, newest first. Contact shown masked (C-PD-1). */
export const ownerTenanciesResponse = z.object({
  tenancies: z.array(
    z.object({
      id: z.string(),
      sfUnitId: z.string(),
      tenantName: z.string(),
      contact: z.string(),
      startsOn: z.string(),
      endsOn: z.string(),
      status: tenancyStatus,
      /** Current: active and within the dates (isTenancyCurrent). */
      current: z.boolean(),
      daysLeft: z.number().int(),
    }),
  ),
});
export type OwnerTenancy = z.infer<typeof ownerTenanciesResponse>['tenancies'][number];

/** GET /api/tenant/tenancies: the tenant's invitations and tenancies, with where the unit is. */
export const tenantTenanciesResponse = z.object({
  tenancies: z.array(
    z.object({
      id: z.string(),
      unitName: z.string(),
      project: z.string().nullable(),
      startsOn: z.string(),
      endsOn: z.string(),
      status: tenancyStatus,
      current: z.boolean(),
      daysLeft: z.number().int(),
    }),
  ),
});
export type TenantTenancy = z.infer<typeof tenantTenanciesResponse>['tenancies'][number];

/** "l•••a@example.com" / "+971 •• ••• 0000": enough for the owner to recognise, not to copy (C-PD-1). */
export function maskContact(contact: string): string {
  const at = contact.indexOf('@');
  if (at > 0) {
    const name = contact.slice(0, at);
    const first = name.charAt(0);
    const last = name.length > 2 ? name.charAt(name.length - 1) : '';
    return `${first}•••${last}${contact.slice(at)}`;
  }
  return contact.length <= 4 ? '••••' : `${contact.slice(0, 4)} •• ••• ${contact.slice(-4)}`;
}
