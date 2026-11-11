/**
 * JAD+ Admin platform rules and payloads (ADR 0025): services and partners (S1-S4), building contacts (E12),
 * notices (V1) and home guide, offer interests (N2), on-call weeks (E6, E7), read-only settings.
 */
import { z } from 'zod';
import { DEFAULT_CALENDAR, DEFAULT_HOLIDAYS, type WorkingCalendar } from './calendar.js';
import {
  EMERGENCY_ACK_MINUTES,
  EMERGENCY_BACKUP_MINUTES,
  RAISABLE_EMERGENCY_TYPES,
  isAcEmergencySeason,
} from './emergency.js';
import { EMERGENCY_TYPE_LABELS } from './messages.js';
import {
  LANGUAGES,
  MAKE_SAFE_CAP_CHOICES,
  MAKE_SAFE_VERSION,
  MARKETING_VERSION,
  TERMS_VERSION,
} from './preferences.js';
import { emailSchema, idSchema, phoneSchema } from './schemas.js';
import { SERVICE_CODES, SERVICE_GROUPS } from './services.js';
import { MAINTENANCE_SLA, SLA_METRICS, type SlaTarget } from './sla.js';

/** V1: what a building notice is about. Mirrors the CHECK list in migration 0020. */
export const NOTICE_KINDS = ['water', 'power', 'lift', 'ac', 'works', 'other'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** Home guide sections, in the order the app shows them. Mirrors the CHECK list in migration 0020. */
export const GUIDE_SECTIONS = ['ac', 'water', 'waste', 'parking', 'access', 'amenities', 'other'] as const;
export type GuideSection = (typeof GUIDE_SECTIONS)[number];

/** E12: building management contacts kept per building (or per project): a few, not an address book. */
export const BUILDING_CONTACTS_MAX = 5;
/** V1: residents also see a notice that starts within this many days ("planned water shut-off tomorrow"). */
export const NOTICE_LEAD_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * A place notices, guides and contacts are attached to: a project, and optionally one building in it.
 * building null = the whole project (and units whose building Salesforce does not name).
 */
export type Place = Readonly<{ project: string; building: string | null }>;

/** One stable key per (project, building) pair, for grouping. */
export function buildingKey(place: Place): string {
  return JSON.stringify([place.project, place.building ?? '']);
}

/** Whether something attached to `target` applies to a unit at `unit` (project-wide covers every building). */
export function placeCovers(target: Place, unit: Place): boolean {
  return target.project === unit.project && (target.building === null || target.building === unit.building);
}

export type NoticeTimes = Readonly<{ startsAt: number; endsAt: number | null; withdrawnAt: number | null }>;

/** V1: where a notice stands at `now`. It runs from startsAt up to (not including) endsAt. */
export function noticeState(n: NoticeTimes, now: number): 'upcoming' | 'current' | 'ended' | 'withdrawn' {
  if (n.withdrawnAt !== null) return 'withdrawn';
  if (n.endsAt !== null && now >= n.endsAt) return 'ended';
  return now < n.startsAt ? 'upcoming' : 'current';
}

/**
 * V1: the notices a resident with units at `units` sees now: current ones, and upcoming ones starting within
 * NOTICE_LEAD_DAYS, for their buildings or their whole project. Soonest first; each notice once.
 */
export function noticesFor<N extends NoticeTimes & Place>(
  notices: readonly N[],
  units: readonly Place[],
  now: number,
): N[] {
  return notices
    .filter((n) => {
      const state = noticeState(n, now);
      if (state === 'ended' || state === 'withdrawn') return false;
      if (state === 'upcoming' && n.startsAt - now > NOTICE_LEAD_DAYS * DAY_MS) return false;
      return units.some((u) => placeCovers(n, u));
    })
    .sort((a, b) => a.startsAt - b.startsAt);
}

/**
 * The home guide for one unit's place: per section, the building's own text overrides the project-wide one.
 * Sections come in GUIDE_SECTIONS order.
 */
export function guideFor<G extends Place & { readonly section: GuideSection }>(
  sections: readonly G[],
  unit: Place,
): G[] {
  return GUIDE_SECTIONS.flatMap((section) => {
    const options = sections.filter((s) => s.section === section && placeCovers(s, unit));
    const own = options.find((s) => s.building !== null);
    const chosen = own ?? options[0];
    return chosen === undefined ? [] : [chosen];
  });
}

/** The distinct places of a resident's units (units without a project have no notices or guide). */
export function placesOf(units: readonly { project: string | null; building: string | null }[]): Place[] {
  const seen = new Map<string, Place>();
  for (const u of units) {
    if (u.project === null) continue;
    const place = { project: u.project, building: u.building };
    seen.set(buildingKey(place), place);
  }
  return [...seen.values()];
}

export type PartnerRank = 'primary' | 'backup';

/**
 * S3: which ranks change when an admin sets a service's primary and backup. Unchanged ranks keep their
 * assignment (and its start date); a changed rank ends the current row and, unless cleared, starts a new one.
 */
export function changedRanks(
  current: Readonly<Record<PartnerRank, string | null>>,
  next: Readonly<Record<PartnerRank, string | null>>,
): PartnerRank[] {
  return (['primary', 'backup'] as const).filter((rank) => current[rank] !== next[rank]);
}

/** S4: the service-level targets each service runs on today (maintenance), or none yet. */
export function serviceSlaTargets(code: string): readonly SlaTarget[] {
  return code === 'maintenance' ? Object.values(MAINTENANCE_SLA) : [];
}

/** E14: the Dubai months (1-12) in which AC failure counts as an emergency. */
export function acSeasonMonths(): number[] {
  return Array.from({ length: 12 }, (_, i) => i + 1).filter(isAcEmergencySeason);
}

const hhmm = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** GET /api/admin/settings: the versions, limits, calendar and targets the platform runs on (read-only). */
export function platformSettings(cal: WorkingCalendar = DEFAULT_CALENDAR): PlatformSettings {
  const holidays = DEFAULT_HOLIDAYS.filter(([d]) => cal.holidays.has(d)).map(([date, name]) => ({
    date,
    name,
  }));
  return {
    versions: { terms: TERMS_VERSION, marketing: MARKETING_VERSION, makeSafe: MAKE_SAFE_VERSION },
    makeSafeCapChoicesAed: [...MAKE_SAFE_CAP_CHOICES],
    calendar: {
      workingDays: [...cal.hours.days],
      weekendDays: [0, 1, 2, 3, 4, 5, 6].filter((d) => !cal.hours.days.some((w) => w === d)),
      opens: hhmm(cal.hours.startMinute),
      closes: hhmm(cal.hours.endMinute),
      holidays,
    },
    sla: {
      emergencyAckMinutes: EMERGENCY_ACK_MINUTES,
      emergencyBackupMinutes: EMERGENCY_BACKUP_MINUTES,
      maintenance: [...Object.values(MAINTENANCE_SLA)],
    },
    emergencyTypes: RAISABLE_EMERGENCY_TYPES.map((type) => ({ type, label: EMERGENCY_TYPE_LABELS[type] })),
    acSeasonMonths: acSeasonMonths(),
    languages: [...LANGUAGES],
  };
}

// ---- Payloads (strict: unknown keys rejected, C-VAL-1) ----

/** True when the text has no control characters other than tab and new line. */
function noControlCharacters(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if ((code < 32 && code !== 9 && code !== 10) || code === 127) return false;
  }
  return true;
}

/** Plain text written by JAD+ staff: no control characters and nothing that looks like markup. */
const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(noControlCharacters, 'Use plain text only.')
    .refine((s) => !/<\s*[a-z!/?]/i.test(s), 'Use plain text only.');

const projectSchema = plainText(120);
const buildingSchema = plainText(80).nullable();
const placeFields = { project: projectSchema, building: buildingSchema };
const placeView = { project: z.string(), building: z.string().nullable() };

export const serviceCodeParam = z.strictObject({ code: z.enum(SERVICE_CODES) });
export const platformIdParam = z.strictObject({ id: idSchema });

/** POST /api/admin/services/:code/partners (S3). */
export const servicePartnersBody = z
  .strictObject({ primaryId: idSchema.nullable(), backupId: idSchema.nullable() })
  .refine((b) => b.primaryId === null || b.primaryId !== b.backupId, {
    message: 'The primary and the backup must be two different partners.',
  });

/** POST /api/admin/services/:code/listed (S1, S2). */
export const serviceListedBody = z.strictObject({ listed: z.boolean() });

const slaTargetView = z.object({
  metric: z.enum(SLA_METRICS),
  minutes: z.number(),
  clock: z.enum(['24x7', 'working']),
});

const partnerRef = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['active', 'suspended', 'ended']),
});

/** GET /api/admin/services. */
export const adminServicesResponse = z.object({
  services: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      group: z.enum(SERVICE_GROUPS),
      delivery: z.enum(['partner', 'inhouse']),
      listed: z.boolean(),
      /** Who would take a new request now (S2, S3); an unlisted service takes none. */
      routing: z.enum(['partner', 'jad', 'coming_soon']),
      primary: partnerRef.nullable(),
      backup: partnerRef.nullable(),
      sla: z.array(slaTargetView),
      plannedSla: z.string().nullable(),
    }),
  ),
});
export type AdminServices = z.infer<typeof adminServicesResponse>;

/** GET /api/admin/buildings. */
export const adminBuildingsResponse = z.object({
  buildings: z.array(
    z.object({
      ...placeView,
      units: z.number(),
      openRequests: z.number(),
      contacts: z.number(),
      currentNotices: z.number(),
    }),
  ),
});
export type AdminBuildings = z.infer<typeof adminBuildingsResponse>;

export const projectQuery = z.strictObject({ project: projectSchema });

/** POST /api/admin/building-contacts (E12): a name and a phone and/or email; the role is a plain label. */
export const buildingContactBody = z
  .strictObject({
    ...placeFields,
    name: plainText(80),
    role: plainText(60).nullable(),
    phone: phoneSchema.nullable(),
    email: emailSchema.nullable(),
  })
  .refine((b) => b.phone !== null || b.email !== null, { message: 'Give a phone number or an email.' });

/** GET /api/admin/building-contacts?project= (viewing is audited: personal data). */
export const buildingContactsResponse = z.object({
  contacts: z.array(
    z.object({
      id: z.string(),
      ...placeView,
      name: z.string(),
      role: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      createdAt: z.number(),
    }),
  ),
});
export type BuildingContacts = z.infer<typeof buildingContactsResponse>;

/** POST /api/admin/notices (V1). Times are UTC milliseconds; endsAt null = until withdrawn. */
export const noticeBody = z
  .strictObject({
    ...placeFields,
    kind: z.enum(NOTICE_KINDS),
    title: plainText(80),
    body: plainText(1000),
    startsAt: z.number().int().positive(),
    endsAt: z.number().int().positive().nullable(),
  })
  .refine((b) => b.endsAt === null || b.endsAt > b.startsAt, { message: 'The end must be after the start.' });

export const adminNoticesQuery = z.strictObject({
  project: projectSchema.optional(),
  state: z.enum(['live', 'all']).optional(),
});

const noticeView = z.object({
  id: z.string(),
  ...placeView,
  kind: z.enum(NOTICE_KINDS),
  title: z.string(),
  body: z.string(),
  startsAt: z.number(),
  endsAt: z.number().nullable(),
  state: z.enum(['upcoming', 'current', 'ended', 'withdrawn']),
});

/** GET /api/admin/notices. */
export const adminNoticesResponse = z.object({
  notices: z.array(noticeView.extend({ createdAt: z.number(), withdrawnAt: z.number().nullable() })),
});
export type AdminNotices = z.infer<typeof adminNoticesResponse>;

/** GET /api/me/notices (owners and tenants): current and soon-starting notices for their buildings. */
export const residentNoticesResponse = z.object({ notices: z.array(noticeView) });
export type ResidentNotices = z.infer<typeof residentNoticesResponse>;

/** PUT /api/admin/guide: create or replace one section of the home guide for a project or building. */
export const guideSectionBody = z.strictObject({
  ...placeFields,
  section: z.enum(GUIDE_SECTIONS),
  title: plainText(80),
  body: plainText(2000),
});

const guideSectionView = z.object({
  id: z.string(),
  ...placeView,
  section: z.enum(GUIDE_SECTIONS),
  title: z.string(),
  body: z.string(),
  updatedAt: z.number(),
});

/** GET /api/admin/guide?project=. */
export const adminGuideResponse = z.object({ sections: z.array(guideSectionView) });
export type AdminGuide = z.infer<typeof adminGuideResponse>;

/** GET /api/me/guide: per place of the resident's units, the merged sections. */
export const residentGuideResponse = z.object({
  places: z.array(z.object({ ...placeView, sections: z.array(guideSectionView) })),
});
export type ResidentGuide = z.infer<typeof residentGuideResponse>;

/** GET /api/admin/offer-interests?state= (N2; viewing is audited). */
export const offerInterestsQuery = z.strictObject({ state: z.enum(['open', 'all']).optional() });

export const offerInterestsResponse = z.object({
  interests: z.array(
    z.object({
      id: z.string(),
      postId: z.string(),
      /** The offer's title when the owner tapped "I'm interested"; null if it was not recorded. */
      title: z.string().nullable(),
      owner: z.object({
        userId: z.string(),
        name: z.string().nullable(),
        sfContactId: z.string().nullable(),
      }),
      at: z.number(),
      handledAt: z.number().nullable(),
      withdrawnAt: z.number().nullable(),
    }),
  ),
});
export type OfferInterests = z.infer<typeof offerInterestsResponse>;

const staffRef = z.object({ userId: z.string(), name: z.string().nullable() });

/** GET /api/admin/on-call/weeks?from= (E6, E7): the next 8 weeks with names, and who may be on call. */
export const onCallWeeksResponse = z.object({
  weeks: z.array(
    z.object({
      weekStarting: z.string(),
      current: z.boolean(),
      first: staffRef.nullable(),
      second: staffRef.nullable(),
    }),
  ),
  candidates: z.array(staffRef.extend({ canBeFirst: z.boolean(), canBeSecond: z.boolean() })),
});
export type OnCallWeeks = z.infer<typeof onCallWeeksResponse>;

/** GET /api/admin/settings. */
export const platformSettingsResponse = z.object({
  versions: z.object({ terms: z.string(), marketing: z.string(), makeSafe: z.string() }),
  makeSafeCapChoicesAed: z.array(z.number()),
  calendar: z.object({
    workingDays: z.array(z.number()),
    weekendDays: z.array(z.number()),
    opens: z.string(),
    closes: z.string(),
    holidays: z.array(z.object({ date: z.string(), name: z.string() })),
  }),
  sla: z.object({
    emergencyAckMinutes: z.number(),
    emergencyBackupMinutes: z.number(),
    maintenance: z.array(slaTargetView),
  }),
  emergencyTypes: z.array(z.object({ type: z.enum(RAISABLE_EMERGENCY_TYPES), label: z.string() })),
  acSeasonMonths: z.array(z.number()),
  languages: z.array(z.enum(LANGUAGES)),
});
export type PlatformSettings = z.infer<typeof platformSettingsResponse>;
