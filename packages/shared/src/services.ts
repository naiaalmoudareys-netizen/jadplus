/**
 * The JAD+ service catalogue (BUILD_SPEC S1-S3, P6; ADR 0012, 0030) and how a new routine request is routed.
 * Ported from the prototype's catalogue (portal-live src/services.js). The database table mirrors this list
 * (migrations 0013 and 0027, drift-tested). Every service is delivered by a provider assigned to it (primary or
 * backup): a signed outside partner for a partner service, a JAD Global team (kind 'jad_group') for an in-house
 * one. Without an active provider it shows "coming soon" and cannot be requested (S2, P6: no promise).
 */
import { z } from 'zod';
import { VISIT_SLOT_KEYS } from './visits.js';

export const SERVICE_GROUPS = ['Property care', 'Investment services', 'Lifestyle'] as const;
export type ServiceGroup = (typeof SERVICE_GROUPS)[number];

/** partner: delivered by a signed outside partner; inhouse: by a JAD Global team (ADR 0030). */
export type ServiceDelivery = 'partner' | 'inhouse';

/**
 * How a request for the service runs (ADR 0030). visit: the provider visits the home (book, quote, work, confirm);
 * report: the provider delivers a written report (snagging, valuation); consultation: a conversation in stages
 * (leasing, resale, mortgage, ...); booking: a seat on a session (investor education). Mirrors the CHECK list on
 * services.flow in migration 0027. Only the visit journey is built today; the others follow in later waves.
 */
export const SERVICE_FLOWS = ['visit', 'report', 'consultation', 'booking'] as const;
export type ServiceFlow = (typeof SERVICE_FLOWS)[number];

/**
 * The kind of provider company (ADR 0030): an outside partner, or a JAD Global group team (e.g. the group's real
 * estate or property management company) that delivers in-house services through the same partner office.
 * Mirrors the CHECK list on partners.kind in migration 0027.
 */
export const PROVIDER_KINDS = ['external', 'jad_group'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export interface ServiceDefinition {
  readonly code: string;
  readonly name: string;
  readonly group: ServiceGroup;
  readonly delivery: ServiceDelivery;
  readonly flow: ServiceFlow;
  readonly blurb: string;
}

export const SERVICES: readonly ServiceDefinition[] = [
  {
    code: 'maintenance',
    name: 'Maintenance',
    group: 'Property care',
    delivery: 'partner',
    flow: 'visit',
    blurb: 'Repairs, AC, plumbing and electrical.',
  },
  {
    code: 'snagging',
    name: 'Snagging & Inspection',
    group: 'Property care',
    delivery: 'partner',
    flow: 'report',
    blurb: 'Independent pre-handover snagging with a full report.',
  },
  {
    code: 'handover',
    name: 'Handover Management',
    group: 'Property care',
    delivery: 'inhouse',
    flow: 'visit',
    blurb: 'A dedicated team guiding you from completion to key collection.',
  },
  {
    code: 'property-management',
    name: 'Property Management',
    group: 'Property care',
    delivery: 'inhouse',
    flow: 'consultation',
    blurb: 'Full management of your residence, from tenants to bills and upkeep.',
  },
  {
    code: 'leasing',
    name: 'Leasing',
    group: 'Investment services',
    delivery: 'inhouse',
    flow: 'consultation',
    blurb: 'Finding and managing tenants at the right rent.',
  },
  {
    code: 'resale',
    name: 'Resale',
    group: 'Investment services',
    delivery: 'inhouse',
    flow: 'consultation',
    blurb: 'Selling with a team that knows the value of each JAD project.',
  },
  {
    code: 'valuation',
    name: 'Property Valuation',
    group: 'Investment services',
    delivery: 'inhouse',
    flow: 'report',
    blurb: 'An up-to-date valuation built on real JAD project data.',
  },
  {
    code: 'mortgage',
    name: 'Mortgage & Finance',
    group: 'Investment services',
    delivery: 'partner',
    flow: 'consultation',
    blurb: 'Financing pre-approved for JAD projects.',
  },
  {
    code: 'furnishing',
    name: 'Furnishing',
    group: 'Lifestyle',
    delivery: 'partner',
    flow: 'visit',
    blurb: 'Furniture packages by unit type, delivered and installed.',
  },
  {
    code: 'interior-design',
    name: 'Interior Design',
    group: 'Lifestyle',
    delivery: 'partner',
    flow: 'visit',
    blurb: 'From concept to handover, by one accountable team.',
  },
  {
    code: 'golden-visa',
    name: 'Golden Visa',
    group: 'Lifestyle',
    delivery: 'partner',
    flow: 'consultation',
    blurb: 'Residency guidance and processing for qualifying investors.',
  },
  {
    code: 'education',
    name: 'Investor Education',
    group: 'Lifestyle',
    delivery: 'inhouse',
    flow: 'booking',
    blurb: 'Sessions and resources for owners, free of charge.',
  },
];

export const SERVICE_CODES = SERVICES.map((s) => s.code) as [string, ...string[]];

/**
 * Who takes a new request: the service's outside partner, its JAD Global team, or nobody yet ("coming soon",
 * S2, P6).
 */
export type ServiceRouting = 'partner' | 'jad' | 'coming_soon';

/** The kind of provider that may deliver a service: outside partners for partner services, JAD Global teams for in-house ones. */
export function providerKindFor(delivery: ServiceDelivery): ProviderKind {
  return delivery === 'inhouse' ? 'jad_group' : 'external';
}

/** Whether a provider of this kind may be assigned to (and take requests for) a service delivered this way. */
export function providerFits(delivery: ServiceDelivery, kind: ProviderKind): boolean {
  return providerKindFor(delivery) === kind;
}

/**
 * R2 (Naya, 10-Nov-2026): a tenant requests repairs in the home they live in, nothing else. Every other service
 * (snagging, handover, leasing, resale, valuation, mortgage, Golden Visa, furnishing, design, education) is the
 * owner's decision.
 */
export const TENANT_SERVICES: ReadonlySet<string> = new Set(['maintenance']);

/** Whether this role may request this service. */
export function serviceOpenTo(role: 'owner' | 'tenant', code: string): boolean {
  return role === 'owner' || TENANT_SERVICES.has(code);
}

/**
 * S2/S3/P6: a service is available only with an active (primary or backup) provider of the right kind: an outside
 * partner, or for an in-house service a JAD Global team. Without one it is "coming soon" (e.g. the team is not
 * trained yet, P6).
 */
export function serviceRouting(delivery: ServiceDelivery, providerAvailable: boolean): ServiceRouting {
  if (!providerAvailable) return 'coming_soon';
  return delivery === 'inhouse' ? 'jad' : 'partner';
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
      /** How a request for it runs (ADR 0030), so the apps can branch as the other flows are built. */
      flow: z.enum(SERVICE_FLOWS),
      routing: z.enum(['partner', 'jad', 'coming_soon']),
    }),
  ),
});
export type ServiceView = z.infer<typeof servicesResponse>['services'][number];

/** POST /api/requests answer: who has the request. */
export const requestRaisedResponse = z.object({
  requestId: z.string(),
  ref: z.string(),
  /** The provider, e.g. "Primary Fixers LLC"; for a tenant's request, who will handle it once approved. */
  sentTo: z.string(),
  /** A1: a tenant's routine request first waits for the owner's approval. */
  awaitingOwner: z.boolean(),
});
export type RequestRaised = z.infer<typeof requestRaisedResponse>;
