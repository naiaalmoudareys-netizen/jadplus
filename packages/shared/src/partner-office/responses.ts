/**
 * Partner office company tools (ADR 0025): every answer the API gives, so the console can check what it
 * receives. Nothing here carries a resident's name, unit or contact details; technicians are named only to
 * their own company's office. Money is in fils (1 AED = 100 fils).
 */
import { z } from 'zod';
import { EMERGENCY_TYPES } from '../emergency.js';
import { STATUSES } from '../lifecycle.js';
import { SLA_METRICS } from '../sla.js';
import { PARTNER_DOCUMENT_KINDS } from '../partner-documents.js';
import { QUOTE_STATUSES_FOR_OFFICE, SKILLS, UNAVAILABLE_REASONS } from './rules.js';
import { RATE_UNITS } from './schemas.js';

const int = z.number().int();
const standing = z.enum(['valid', 'expiring_soon', 'lapsed', 'missing']);
const targets = z.object({ onTimePercent: int, averageRating: z.number(), repeatVisitPercent: int });

const monthFigures = z.object({
  month: z.string(),
  jobsDone: int,
  onTimePercent: int.nullable(),
  averageRating: z.number().nullable(),
  ratings: int,
  repeatVisits: int,
});

/**
 * The home-services part of GET /api/partner/overview (ADR 0025, 0036): today's emergencies and visits, this
 * month against last month and JAD+'s targets, and who is away today.
 */
export const visitsOverview = z.object({
  today: z.object({
    /** Emergencies not yet acknowledged, with minutes left on the 15-minute clock (E4; negative = late). */
    emergencies: z.array(z.object({ id: z.string(), ref: z.string(), minutesLeft: int })),
    visitsToday: int,
    overdue: int,
    unassigned: int,
    quotesWaiting: int,
  }),
  thisMonth: monthFigures,
  lastMonth: monthFigures,
  targets,
  unavailableToday: z.array(
    z.object({
      technicianId: z.string(),
      name: z.string(),
      reason: z.enum(UNAVAILABLE_REASONS),
      until: z.string(),
    }),
  ),
});
export type VisitsOverview = z.infer<typeof visitsOverview>;

/** Warnings for the whole company: documents expiring or lapsed, being close to the S6 review line. */
export const overviewAlert = z.object({
  kind: z.enum(['document', 'low_rating', 'missed_emergencies', 'breach']),
  level: z.enum(['warning', 'flagged']),
  text: z.string(),
});
export type OverviewAlert = z.infer<typeof overviewAlert>;

/** GET/PUT /api/partner/technicians/:id/skills */
export const technicianSkillsResponse = z.object({
  technicianId: z.string(),
  skills: z.array(z.enum(SKILLS)),
});

/** GET /api/partner/technicians/:id/unavailable */
export const technicianUnavailableResponse = z.object({
  technicianId: z.string(),
  entries: z.array(
    z.object({ id: z.string(), from: z.string(), to: z.string(), reason: z.enum(UNAVAILABLE_REASONS) }),
  ),
});

/** GET /api/partner/dispatch?date= */
export const dispatchResponse = z.object({
  date: z.string(),
  technicians: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      skills: z.array(z.enum(SKILLS)),
      available: z.boolean(),
      unavailableReason: z.enum(UNAVAILABLE_REASONS).nullable(),
      visits: z.array(
        z.object({
          requestId: z.string(),
          ref: z.string(),
          service: z.string().nullable(),
          /** The emergency type when the visit is an emergency, so every page names it the same way. */
          emergencyType: z.enum(EMERGENCY_TYPES).nullable(),
          building: z.string().nullable(),
          windowStart: int,
          windowEnd: int,
          status: z.string(),
        }),
      ),
    }),
  ),
  unassigned: z.array(
    z.object({
      id: z.string(),
      ref: z.string(),
      emergency: z.boolean(),
      emergencyType: z.enum(EMERGENCY_TYPES).nullable(),
      service: z.string().nullable(),
      building: z.string().nullable(),
      nextDueAt: int.nullable(),
      minutesLeft: int.nullable(),
      skill: z.enum(SKILLS).nullable(),
      /** Technician ids, best first (available, with the skill, fewest visits that day). */
      suggested: z.array(z.string()),
    }),
  ),
});
export type Dispatch = z.infer<typeof dispatchResponse>;

/** GET /api/partner/messages */
export const partnerMessagesResponse = z.object({
  threads: z.array(
    z.object({
      requestId: z.string(),
      ref: z.string(),
      service: z.string().nullable(),
      status: z.enum(STATUSES),
      messages: int,
      lastAt: int,
      lastFrom: z.enum(['resident', 'partner', 'jad']),
      /** The last message as stored (contact details already removed), cut to 140 characters. */
      preview: z.string(),
      awaitingReply: z.boolean(),
    }),
  ),
});

/** GET /api/partner/quotes?status= */
export const partnerQuotesResponse = z.object({
  quotes: z.array(
    z.object({
      id: z.string(),
      requestId: z.string(),
      ref: z.string(),
      service: z.string().nullable(),
      amountFils: int,
      status: z.enum(QUOTE_STATUSES_FOR_OFFICE),
      revision: int,
      sentAt: int,
      expiresAt: int,
      /** Pending quotes only: days before it expires (A2). */
      daysLeft: int.nullable(),
    }),
  ),
  thisMonth: z.object({
    month: z.string(),
    sent: int,
    approved: int,
    quotedFils: int,
    approvedFils: int,
    conversionPercent: int.nullable(),
  }),
});

/** GET /api/partner/documents (S7, S10) */
export const partnerDocumentsResponse = z.object({
  documents: z.array(
    z.object({
      kind: z.enum(PARTNER_DOCUMENT_KINDS),
      onFile: z.boolean(),
      /** Latest verified expiry date. */
      expiresOn: z.string().nullable(),
      standing,
      pending: z.object({ id: z.string(), uploadedAt: int, expiresOn: z.string().nullable() }).nullable(),
      lastRejected: z.object({ at: int, reason: z.string() }).nullable(),
    }),
  ),
});

/** POST /api/partner/documents/:kind */
export const documentUploadedResponse = z.object({
  id: z.string(),
  kind: z.enum(PARTNER_DOCUMENT_KINDS),
  status: z.literal('pending'),
});

const rateItem = z.object({
  serviceCode: z.string(),
  item: z.string(),
  unit: z.enum(RATE_UNITS),
  priceFils: int,
});
const rateCard = z.object({
  changeId: z.string(),
  effectiveFrom: z.string(),
  validUntil: z.string(),
  items: z.array(rateItem),
});
const changeStatus = z.enum(['pending', 'accepted', 'rejected']);

/** GET /api/partner/rate-card (S9, P1) */
export const rateCardResponse = z.object({
  current: rateCard.nullable(),
  upcoming: z.array(rateCard),
  changes: z.array(
    z.object({
      id: z.string(),
      status: changeStatus,
      effectiveFrom: z.string(),
      proposedAt: int,
      decidedAt: int.nullable(),
      reason: z.string().nullable(),
      items: int,
    }),
  ),
});

/** POST /api/partner/rate-card/changes */
export const rateChangeProposedResponse = z.object({
  id: z.string(),
  status: z.literal('pending'),
  effectiveFrom: z.string(),
  validUntil: z.string(),
});

/** GET/PUT /api/partner/after-hours (E5-E7) */
export const afterHoursResponse = z.object({
  weeks: z.array(
    z.object({ weekStarting: z.string(), technicianId: z.string().nullable(), name: z.string().nullable() }),
  ),
});

/** GET /api/partner/scorecard?month= and GET /api/admin/partners/:id/scorecard?month= (S5) */
export const partnerScorecardResponse = z.object({
  partnerId: z.string(),
  partnerName: z.string(),
  month: z.string(),
  jobsDone: int,
  sla: z.array(
    z.object({ metric: z.enum(SLA_METRICS), met: int, missed: int, excused: int, percent: int.nullable() }),
  ),
  onTimePercent: int.nullable(),
  /** From assignment to acknowledgement or visit booked, in minutes. */
  averageResponseMinutes: int.nullable(),
  /** From assignment to work completed, in minutes. */
  averageCompletionMinutes: int.nullable(),
  rating: z.object({
    average: z.number().nullable(),
    count: int,
    /** How many 1, 2, 3, 4 and 5-star ratings. */
    stars: z.array(int).length(5),
  }),
  repeatVisits: int,
  repeatVisitPercent: int.nullable(),
  incidents: z.array(z.object({ kind: z.string(), count: int })),
  targets,
  meets: z.object({
    onTime: z.boolean().nullable(),
    rating: z.boolean().nullable(),
    repeatVisits: z.boolean().nullable(),
  }),
});
export type PartnerScorecard = z.infer<typeof partnerScorecardResponse>;

/** GET /api/partner/feedback?month=: no resident names or units, only the service and the date. */
export const partnerFeedbackResponse = z.object({
  month: z.string(),
  feedback: z.array(
    z.object({
      stars: int,
      comment: z.string().nullable(),
      service: z.string().nullable(),
      date: z.string(),
    }),
  ),
});

/** JAD+ Admin: GET /api/admin/partner-documents?status= */
export const adminPartnerDocumentsResponse = z.object({
  uploads: z.array(
    z.object({
      id: z.string(),
      partnerId: z.string(),
      partnerName: z.string(),
      kind: z.enum(PARTNER_DOCUMENT_KINDS),
      expiresOn: z.string().nullable(),
      byteSize: int,
      uploadedAt: int,
      status: changeStatus,
      decidedAt: int.nullable(),
      reason: z.string().nullable(),
    }),
  ),
});

/** JAD+ Admin: GET /api/admin/rate-card-changes?status= */
export const adminRateChangesResponse = z.object({
  changes: z.array(
    z.object({
      id: z.string(),
      partnerId: z.string(),
      partnerName: z.string(),
      status: changeStatus,
      effectiveFrom: z.string(),
      validUntil: z.string(),
      proposedAt: int,
      decidedAt: int.nullable(),
      approvedBy: z.string().nullable(),
      reason: z.string().nullable(),
      /** Each line with the price on the partner's current card, to compare (S9). */
      items: z.array(rateItem.extend({ currentPriceFils: int.nullable() })),
    }),
  ),
});

/** JAD+ Admin decisions on a document or a rate-card change. */
export const officeDecisionResponse = z.object({ id: z.string(), status: z.enum(['accepted', 'rejected']) });
