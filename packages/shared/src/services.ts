/**
 * The JAD+ service catalogue (BUILD_SPEC S1-S3; ADR 0012) and how a new routine request is routed.
 * Ported from the prototype's catalogue (portal-live src/services.js). The database table mirrors this list
 * (migration 0013, drift-tested). A partner service needs a signed, active partner; without one it shows
 * "coming soon" and cannot be requested (S2: no promise). In-house services go to the JAD+ team.
 */
import { z } from 'zod';
import { VISIT_SLOT_KEYS } from './visits.js';

export const SERVICE_GROUPS = ['Property care', 'Investment services', 'Lifestyle'] as const;
export type ServiceGroup = (typeof SERVICE_GROUPS)[number];

/** partner: delivered by a signed service partner; inhouse: by the JAD+ team. */
export type ServiceDelivery = 'partner' | 'inhouse';

export interface ServiceDefinition {
  readonly code: string;
  readonly name: string;
  readonly group: ServiceGroup;
  readonly delivery: ServiceDelivery;
  readonly blurb: string;
}

export const SERVICES: readonly ServiceDefinition[] = [
  {
    code: 'maintenance',
    name: 'Maintenance',
    group: 'Property care',
    delivery: 'partner',
    blurb: 'Repairs, AC, plumbing and electrical.',
  },
  {
    code: 'snagging',
    name: 'Snagging & Inspection',
    group: 'Property care',
    delivery: 'partner',
    blurb: 'Independent pre-handover snagging with a full report.',
  },
  {
    code: 'handover',
    name: 'Handover Management',
    group: 'Property care',
    delivery: 'inhouse',
    blurb: 'A dedicated team guiding you from completion to key collection.',
  },
  {
    code: 'property-management',
    name: 'Property Management',
    group: 'Property care',
    delivery: 'inhouse',
    blurb: 'Full management of your residence, from tenants to bills and upkeep.',
  },
  {
    code: 'leasing',
    name: 'Leasing',
    group: 'Investment services',
    delivery: 'inhouse',
    blurb: 'Finding and managing tenants at the right rent.',
  },
  {
    code: 'resale',
    name: 'Resale',
    group: 'Investment services',
    delivery: 'inhouse',
    blurb: 'Selling with a team that knows the value of each JAD project.',
  },
  {
    code: 'valuation',
    name: 'Property Valuation',
    group: 'Investment services',
    delivery: 'inhouse',
    blurb: 'An up-to-date valuation built on real JAD project data.',
  },
  {
    code: 'mortgage',
    name: 'Mortgage & Finance',
    group: 'Investment services',
    delivery: 'partner',
    blurb: 'Financing pre-approved for JAD projects.',
  },
  {
    code: 'furnishing',
    name: 'Furnishing',
    group: 'Lifestyle',
    delivery: 'partner',
    blurb: 'Furniture packages by unit type, delivered and installed.',
  },
  {
    code: 'interior-design',
    name: 'Interior Design',
    group: 'Lifestyle',
    delivery: 'partner',
    blurb: 'From concept to handover, by one accountable team.',
  },
  {
    code: 'golden-visa',
    name: 'Golden Visa',
    group: 'Lifestyle',
    delivery: 'partner',
    blurb: 'Residency guidance and processing for qualifying investors.',
  },
  {
    code: 'education',
    name: 'Investor Education',
    group: 'Lifestyle',
    delivery: 'inhouse',
    blurb: 'Sessions and resources for owners, free of charge.',
  },
];

export const SERVICE_CODES = SERVICES.map((s) => s.code) as [string, ...string[]];

/** Who takes a new request: the service's partner, the JAD+ team, or nobody yet ("coming soon", S2). */
export type ServiceRouting = 'partner' | 'jad' | 'coming_soon';

/** S2/S3: a partner service is available only with an active (primary or backup) partner. */
export function serviceRouting(delivery: ServiceDelivery, partnerAvailable: boolean): ServiceRouting {
  if (delivery === 'inhouse') return 'jad';
  return partnerAvailable ? 'partner' : 'coming_soon';
}

/** POST /api/requests: a routine request from an owner for one of their units (R1, U6). */
export const raiseRequestBody = z
  .strictObject({
    tenancyId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .optional(),
    sfUnitId: z
      .string()
      .regex(/^[A-Za-z0-9]+$/)
      .refine((s) => s.length === 15 || s.length === 18)
      .optional(),
    serviceCode: z.enum(SERVICE_CODES),
    description: z.string().trim().min(1).max(2000),
    /** A working day from preferredDays() (checked by the API) and a time window (ADR 0013). */
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    preferredSlot: z.enum(VISIT_SLOT_KEYS),
  })
  .refine((b) => (b.tenancyId === undefined) !== (b.sfUnitId === undefined), {
    message: 'Give either the tenancy or the unit.',
  });
export type RaiseRequestBody = z.infer<typeof raiseRequestBody>;

/** GET /api/services. */
export const servicesResponse = z.object({
  services: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      group: z.enum(SERVICE_GROUPS),
      blurb: z.string(),
      routing: z.enum(['partner', 'jad', 'coming_soon']),
    }),
  ),
});
export type ServiceView = z.infer<typeof servicesResponse>['services'][number];

/** POST /api/requests answer: who has the request. */
export const requestRaisedResponse = z.object({
  requestId: z.string(),
  ref: z.string(),
  /** "Primary Fixers LLC" or "the JAD+ team"; for a tenant's request, who will handle it once approved. */
  sentTo: z.string(),
  /** A1: a tenant's routine request first waits for the owner's approval. */
  awaitingOwner: z.boolean(),
});
export type RequestRaised = z.infer<typeof requestRaisedResponse>;
