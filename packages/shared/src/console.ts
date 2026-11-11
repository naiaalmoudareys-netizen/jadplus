/**
 * The web console (ADR 0023): JAD+ Admin's "Needs action" list and request search, and the partner office's
 * team and job assignment. Rules and payloads only; the API applies them.
 */
import { z } from 'zod';
import { STATUSES } from './lifecycle.js';
import { emailSchema, idSchema, phoneSchema } from './schemas.js';
import { PROVIDER_KINDS } from './services.js';

const HOUR = 3_600_000;

/** What lands on JAD+ Admin's "Needs action" list, most urgent first. */
export const ATTENTION_KINDS = [
  'emergency_unacknowledged', // E4-E7: nobody has acknowledged an emergency yet
  'on_call_gap', // E6, E7: this week or the next has nobody (or only one person) on the JAD+ on-call rota
  'overdue', // R4: an open request is past its next deadline
  'no_access_rebook', // A7: no new visit within 24 hours of "no access"
  'owner_approval_call', // A1: a tenant's request has waited 48 hours for the owner: call the owner
  'quote_stuck', // A3: a quote was declined and no revised quote came within 3 days
  'desk_request', // ADR 0011: a JAD+ desk request not yet handled
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

/** A1: JAD+ calls the owner when a tenant's request has waited this long. */
export const OWNER_CALL_AFTER = 48 * HOUR;
/** A3: a declined quote with no revised quote after this long goes to JAD+ Admin. */
export const QUOTE_STUCK_AFTER = 72 * HOUR;

/** Order on the list: by kind (as listed above), then oldest first. */
export function attentionOrder(
  a: { kind: AttentionKind; since: number },
  b: { kind: AttentionKind; since: number },
): number {
  return ATTENTION_KINDS.indexOf(a.kind) - ATTENTION_KINDS.indexOf(b.kind) || a.since - b.since;
}

/** GET /api/admin/attention */
export const adminAttentionResponse = z.object({
  items: z.array(
    z.object({
      kind: z.enum(ATTENTION_KINDS),
      /** The request, or null for a desk request (then deskId is set). */
      requestId: z.string().nullable(),
      deskId: z.string().nullable(),
      ref: z.string().nullable(),
      /** Service name, emergency kind or desk request type. */
      what: z.string(),
      unit: z.string().nullable(),
      partnerName: z.string().nullable(),
      /**
       * Since when it needs action (the deadline that passed, or when it was raised); for an on-call gap, when
       * the week starts (Monday 00:00 Dubai).
       */
      since: z.number().int(),
    }),
  ),
});
export type AdminAttention = z.infer<typeof adminAttentionResponse>;

/** GET /api/admin/requests?q=&status= : search by reference, unit or partner name. */
export const adminRequestsQuery = z.strictObject({
  q: z.string().trim().max(60).optional(),
  status: z.enum(STATUSES).optional(),
});

export const adminRequestsResponse = z.object({
  requests: z.array(
    z.object({
      id: z.string(),
      ref: z.string(),
      status: z.enum(STATUSES),
      emergency: z.boolean(),
      what: z.string(),
      unit: z.string().nullable(),
      project: z.string().nullable(),
      partnerName: z.string().nullable(),
      nextDueAt: z.number().int().nullable(),
      createdAt: z.number().int(),
    }),
  ),
});

/** GET /api/admin/partners: each partner with its standing and documents. */
export const adminPartnersResponse = z.object({
  partners: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** ADR 0030: an outside partner or a JAD Global team. */
      kind: z.enum(PROVIDER_KINDS),
      status: z.enum(['active', 'suspended', 'ended']),
      statusReason: z.string().nullable(),
      technicians: z.number().int(),
      openJobs: z.number().int(),
      documents: z.array(z.object({ kind: z.string(), expiresOn: z.string().nullable() })),
      /** ADR 0036: what its workspace is derived from (services held now, services of open work, managed units). */
      services: z.array(z.string()),
      inHand: z.array(z.string()),
      managesUnits: z.boolean(),
    }),
  ),
});

/** POST /api/admin/partners/:id/status (jad_admin). */
export const partnerStatusBody = z.strictObject({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().min(3).max(500),
});

/** POST /api/partner/team (partner office): add a technician by name and email or mobile. */
export const addTechnicianBody = z
  .strictObject({
    name: z.string().trim().min(2).max(80),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .refine((b) => (b.email === undefined) !== (b.phone === undefined), {
    message: 'Give the technician’s email or mobile number.',
  });
export type AddTechnicianBody = z.infer<typeof addTechnicianBody>;

/** POST /api/partner/team/:id/remove (E17: removed at once; cannot be sent to jobs). */
export const removeTechnicianBody = z.strictObject({ reason: z.string().trim().min(3).max(500) });

/** POST /api/partner/jobs/:id/technician (partner office): who goes. */
export const assignTechnicianBody = z.strictObject({ technicianId: idSchema });
