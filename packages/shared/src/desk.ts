/**
 * Requests to the JAD+ desk (ADR 0011; Naya 10-Nov-2026: handled in Salesforce, like the prototype). An owner
 * asks for a document (SPA, Reservation Form, stamped statement, NOC, title deed copy) or an account change;
 * the desk works the JAD+ Request record in Salesforce and, when done, attaches the document, which the owner
 * then opens in the app. Types and statuses mirror Salesforce (JADPortalApi.REQUEST_TYPES, Status__c).
 */
import { z } from 'zod';

export const DESK_REQUEST_TYPES = [
  'Reservation Form',
  'SPA',
  'Stamped Statement of Account',
  'NOC',
  'Oqood or Title Deed copy',
  'Update my contact details',
  'Close my JAD+ account',
  'Other',
] as const;
export type DeskRequestType = (typeof DESK_REQUEST_TYPES)[number];

export const DESK_STATUSES = ['New', 'In progress', 'Completed', 'Cancelled'] as const;
export type DeskStatus = (typeof DESK_STATUSES)[number];

/** Requests for a document of one residence, listed under Documents with "Request" (Naya, 10-Nov-2026). */
export const DOCUMENT_REQUEST_TYPES: readonly DeskRequestType[] = [
  'Reservation Form',
  'SPA',
  'Stamped Statement of Account',
  'NOC',
  'Oqood or Title Deed copy',
];

/** These need the owner to say what they want (e.g. the new mobile number). */
export const DETAILS_REQUIRED: readonly DeskRequestType[] = ['Update my contact details', 'Other'];

/** Plain explanations shown next to each request (from the prototype). */
export const DESK_REQUEST_HINTS: Readonly<Record<DeskRequestType, string>> = {
  'Reservation Form': 'A copy of your signed form',
  SPA: 'Your Sale and Purchase Agreement',
  'Stamped Statement of Account': 'Signed and stamped by JAD Global',
  NOC: 'For resale, mortgage or works',
  'Oqood or Title Deed copy': 'Your registration papers',
  'Update my contact details': 'Tell us the new details; the desk checks your identity first',
  'Close my JAD+ account': 'Your JAD Global records are kept; only JAD+ access ends',
  Other: 'Anything else you need from the JAD+ desk',
};

export function isDeskOpen(status: DeskStatus): boolean {
  return status === 'New' || status === 'In progress';
}

/** POST /api/owner/desk-requests. A deal is named for document requests; details where required. */
export const deskRequestBody = z
  .strictObject({
    type: z.enum(DESK_REQUEST_TYPES),
    dealId: z
      .string()
      .regex(/^[A-Za-z0-9]{15,18}$/)
      .nullable(),
    details: z.string().trim().max(1000).optional(),
  })
  .refine((b) => !DETAILS_REQUIRED.includes(b.type) || (b.details ?? '') !== '', {
    message: 'Please tell the JAD+ desk what you need.',
  })
  .refine((b) => !DOCUMENT_REQUEST_TYPES.includes(b.type) || b.dealId !== null, {
    message: 'Choose the residence the document is for.',
  });
export type DeskRequestBody = z.infer<typeof deskRequestBody>;

export interface DeskRequestFacts {
  readonly type: DeskRequestType;
  readonly status: DeskStatus;
  readonly dealId: string | null;
  readonly createdAt: string;
}

/**
 * The request to show on a document row: the newest one of that type for that residence that is open or
 * completed (a cancelled one lets the owner ask again).
 */
export function latestDeskRequest<R extends DeskRequestFacts>(
  requests: readonly R[],
  type: DeskRequestType,
  dealId: string | null,
): R | null {
  return (
    requests
      .filter((r) => r.type === type && r.dealId === dealId && r.status !== 'Cancelled')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}
