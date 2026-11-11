/**
 * Partner office company tools (ADR 0025): what the API accepts. Every query, parameter and body is strict
 * (unknown keys rejected, C-VAL-1). Answers are in ./responses.ts.
 */
import { z } from 'zod';
import { idSchema } from '../schemas.js';
import { isMonday } from '../oncall.js';
import { SERVICE_CODES } from '../services.js';
import { monthSchema } from '../periods.js';
import { daysBetween } from '../tenancy.js';
import { PARTNER_DOCUMENT_KINDS, QUOTE_STATUSES_FOR_OFFICE, SKILLS, UNAVAILABLE_REASONS } from './rules.js';

/** A real calendar date, YYYY-MM-DD. */
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
  }, 'Use a real date (YYYY-MM-DD).');

const monday = z.string().refine(isMonday, 'Weeks start on a Monday (YYYY-MM-DD).');

/** /api/partner/technicians/:id/... */
export const technicianParam = z.strictObject({ id: idSchema });
/** DELETE /api/partner/technicians/:id/unavailable/:entryId */
export const unavailableEntryParam = z.strictObject({ id: idSchema, entryId: idSchema });

/** PUT /api/partner/technicians/:id/skills: the whole list, replacing the old one. */
export const setSkillsBody = z.strictObject({
  skills: z
    .array(z.enum(SKILLS))
    .max(SKILLS.length)
    .refine((s) => new Set(s).size === s.length, 'List each skill once.'),
});
export type SetSkillsBody = z.infer<typeof setSkillsBody>;

/** POST /api/partner/technicians/:id/unavailable: away from one date to another (both included). */
export const addUnavailableBody = z
  .strictObject({ from: calendarDate, to: calendarDate, reason: z.enum(UNAVAILABLE_REASONS) })
  .refine((b) => b.to >= b.from, { message: 'The last day cannot be before the first.', path: ['to'] })
  .refine((b) => daysBetween(b.from, b.to) <= 365, { message: 'Up to one year at a time.', path: ['to'] });
export type AddUnavailableBody = z.infer<typeof addUnavailableBody>;

/** GET /api/partner/dispatch?date= (default today, Dubai). */
export const dispatchQuery = z.strictObject({ date: calendarDate.optional() });

/** GET /api/partner/quotes?status= */
export const partnerQuotesQuery = z.strictObject({ status: z.enum(QUOTE_STATUSES_FOR_OFFICE).optional() });

/** POST /api/partner/documents/:kind?expiresOn= (the PDF is the raw body). */
export const documentKindParam = z.strictObject({ kind: z.enum(PARTNER_DOCUMENT_KINDS) });
export const documentUploadQuery = z.strictObject({ expiresOn: calendarDate.optional() });

/** Units a rate is priced in. */
export const RATE_UNITS = [
  'per_job',
  'per_hour',
  'per_visit',
  'per_item',
  'per_sqm',
  'per_metre',
  'per_day',
] as const;

const priceAed = z
  .number()
  .positive()
  .max(1_000_000)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most 2 decimals.');

/** POST /api/partner/rate-card/changes: the full proposed card and the day it starts (S9, P1). */
export const rateCardChangeBody = z.strictObject({
  effectiveFrom: calendarDate,
  items: z
    .array(
      z.strictObject({
        serviceCode: z.enum(SERVICE_CODES),
        item: z.string().trim().min(2).max(120),
        unit: z.enum(RATE_UNITS),
        priceAed,
      }),
    )
    .min(1)
    .max(200)
    .refine(
      (items) =>
        new Set(items.map((i) => `${i.serviceCode}|${i.item.toLowerCase()}|${i.unit}`)).size === items.length,
      'List each item once.',
    ),
});
export type RateCardChangeBody = z.infer<typeof rateCardChangeBody>;

/** GET /api/partner/after-hours?from= (a Monday; default this week). */
export const afterHoursQuery = z.strictObject({ from: monday.optional() });
/** PUT /api/partner/after-hours: who takes emergency calls out of hours that week; null clears it. */
export const setAfterHoursBody = z.strictObject({ weekStarting: monday, technicianId: idSchema.nullable() });

/** ?month=YYYY-MM (default this month, Dubai) for the scorecard, feedback and export. */
export const monthQuery = z.strictObject({ month: monthSchema.optional() });

/** JAD+ Admin: GET /api/admin/partner-documents?status= */
export const partnerDocumentsQuery = z.strictObject({
  status: z.enum(['pending', 'accepted', 'rejected']).default('pending'),
});
export const uploadIdParam = z.strictObject({ id: idSchema });

/** JAD+ Admin: POST /api/admin/partner-documents/:id/verify (S7, S10). */
export const verifyDocumentBody = z
  .strictObject({
    decision: z.enum(['accept', 'reject']),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((b) => b.decision === 'accept' || b.reason !== undefined, {
    message: 'Say why the document is rejected.',
    path: ['reason'],
  });
export type VerifyDocumentBody = z.infer<typeof verifyDocumentBody>;

/** JAD+ Admin: GET /api/admin/rate-card-changes?status= */
export const rateCardChangesQuery = z.strictObject({
  status: z.enum(['pending', 'accepted', 'rejected']).default('pending'),
});

/**
 * JAD+ Admin: POST /api/admin/rate-card-changes/:id (S9, P1). An acceptance names who approved it in
 * writing; a rejection says why.
 */
export const decideRateChangeBody = z
  .strictObject({
    decision: z.enum(['accept', 'reject']),
    approvedBy: z.string().trim().min(2).max(120).optional(),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((b) => b.decision === 'reject' || b.approvedBy !== undefined, {
    message: 'Name who approved the new rates in writing.',
    path: ['approvedBy'],
  })
  .refine((b) => b.decision === 'accept' || b.reason !== undefined, {
    message: 'Say why the change is rejected.',
    path: ['reason'],
  });
export type DecideRateChangeBody = z.infer<typeof decideRateChangeBody>;

/** JAD+ Admin: GET /api/admin/partners/:id/scorecard?month= */
export const adminPartnerParam = z.strictObject({ id: idSchema });
