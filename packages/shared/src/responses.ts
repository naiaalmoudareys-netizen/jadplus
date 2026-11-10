/**
 * The shapes of API answers the apps rely on (C-VAL-1 in both directions). The apps validate every answer
 * with these schemas, and the API's tests check its answers against them, so the two cannot drift apart.
 * Objects are not strict here: the API may add a field without breaking an older app.
 */
import { z } from 'zod';
import { EMERGENCY_TYPES, LIFE_SAFETY_TYPES } from './emergency.js';
import { ROLES, STATUSES } from './lifecycle.js';
import { VISIT_SLOT_KEYS } from './visits.js';

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

/** Where a unit is: enough for a technician to find it (ADR 0009). Not personal data. */
const location = z.object({
  unitName: z.string(),
  project: z.string().nullable(),
  building: z.string().nullable(),
  address: z.string().nullable(),
});
export type UnitLocation = z.infer<typeof location>;

const emergencyType = z.enum([...EMERGENCY_TYPES, ...LIFE_SAFETY_TYPES]);
const arrivalWindow = z.object({ start: z.number().int(), end: z.number().int() }).nullable();
/** When the owner would like the visit (ADR 0013). */
const preferredVisit = z.object({ date: z.string(), slot: z.enum(VISIT_SLOT_KEYS) }).nullable();

/** GET /api/partner/jobs (R3). */
export const partnerJobsResponse = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      ref: z.string(),
      emergency: z.boolean(),
      emergencyType: emergencyType.nullable(),
      /** The service, e.g. "Maintenance" or "Furnishing". */
      serviceName: z.string().nullable(),
      status: z.enum(STATUSES),
      description: z.string(),
      nextDueAt: z.number().int().nullable(),
      nextDueKind: z.string().nullable(),
      technicianId: z.string().nullable(),
      arrivalWindow,
      preferredVisit,
      location: location.nullable(),
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

/** GET /api/me/places — where an owner or tenant can raise an emergency (R1, R2, E1). */
export const myPlacesResponse = z.object({
  places: z.array(
    z.object({
      /** Owners raise by unit, tenants through their tenancy (raiseEmergencyBody). */
      sfUnitId: z.string().nullable(),
      tenancyId: z.string().nullable(),
      location,
    }),
  ),
});
export type MyPlace = z.infer<typeof myPlacesResponse>['places'][number];

const requestSummary = z.object({
  id: z.string(),
  ref: z.string(),
  emergency: z.boolean(),
  emergencyType: emergencyType.nullable(),
  /** The service, e.g. "Maintenance" or "Furnishing". */
  serviceName: z.string().nullable(),
  status: z.enum(STATUSES),
  /** The company handling it, once assigned (residents see the company, never a person's contact). */
  partnerName: z.string().nullable(),
  arrivalWindow,
  preferredVisit,
  location: location.nullable(),
  createdAt: z.number().int(),
});

/** GET /api/requests — the signed-in owner's or tenant's requests (R1, R2). */
export const myRequestsResponse = z.object({ requests: z.array(requestSummary) });
export type RequestSummary = z.infer<typeof requestSummary>;

const message = z.object({
  id: z.string(),
  author: z.string(),
  mine: z.boolean(),
  body: z.string(),
  at: z.number().int(),
});
export type RequestMessage = z.infer<typeof message>;

/** GET /api/requests/:id — one request with its messages, for everyone allowed to see it (ADR 0009). */
export const requestDetailResponse = z.object({
  request: requestSummary.extend({ description: z.string() }),
  /** Photos on the request, shown through GET /api/requests/:id/photos/:photoId. */
  photos: z.array(z.object({ id: z.string() })),
  messages: z.array(message),
  /** Messages can be sent while the request is open and the person may act on it. */
  canMessage: z.boolean(),
});
export type RequestDetail = z.infer<typeof requestDetailResponse>;

/** POST /api/requests/:id/messages. */
export const messagePostedResponse = z.object({ message, masked: z.boolean() });

/** POST /api/emergencies (E1, L3): the exact confirmation text. */
export const emergencyRaisedResponse = z.object({
  requestId: z.string(),
  ref: z.string(),
  confirmation: z.string(),
});
export type EmergencyRaised = z.infer<typeof emergencyRaisedResponse>;

/** Error answers: a plain message, sometimes a code (e.g. "not_emergency"). */
export const errorResponse = z.object({ error: z.string(), code: z.string().optional() });
