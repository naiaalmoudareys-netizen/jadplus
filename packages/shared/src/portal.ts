/**
 * The owner's own residence data for the owner app (R1, O1, N1-N3; docs/DESIGN.md): units, payment plan,
 * receipts, construction updates and news. Salesforce is the system of record (JADPortalApi.owner through the
 * finance worker); JAD+ passes it through to the owner and stores none of it.
 *
 * Data minimisation: of Salesforce's answer JAD+ keeps only what these screens show. Passport/Emirates ID
 * documents, nationality and desk requests in that answer are dropped here and never reach the app.
 */
import { z } from 'zod';

const num = z.number().nullable().catch(null);
const str = z.string().max(2000).nullable().catch(null);
/** Salesforce dates are YYYY-MM-DD; anything else is treated as missing. */
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);
const list = <T extends z.ZodType>(item: T) => z.array(item).max(500).catch([]);

/** The parts of JADPortalApi.owner's answer JAD+ reads. Unknown fields are ignored (not passed on). */
export const salesforceOwnerAnswer = z.object({
  person: z.object({ name: str, first_name: str, email: str, mobile: str }).nullable().catch(null),
  deals: list(
    z.object({
      id: z.string().max(18),
      ref: str,
      stage: str,
      role: str,
      price: num,
      discount: num,
      unit: z
        .object({
          name: str,
          number: str,
          type: str,
          bedrooms: z.union([z.string(), z.number()]).nullable().catch(null),
          bathrooms: num,
          floor: str,
          building: str,
          internal_area: num,
          balcony_area: num,
          total_area: num,
          view: str,
          parking: num,
          project: str,
          completion: str,
          address: str,
        })
        .nullable()
        .catch(null),
      instalments: list(z.object({ name: str, seq: num, amount: num, paid: num, due: date, desc: str })),
      charges: list(z.object({ name: str, amount: num, paid: num, due: date })),
      receipts: list(z.object({ id: str, name: str, for: str, amount: num, paid_on: date, method: str })),
      penalties: list(z.object({ name: str, for: str, start: date, amount: num, outstanding: num })),
    }),
  ),
  updates: list(
    z.object({
      id: z.string().max(64),
      title: str,
      date: date,
      percent: num,
      stage: str,
      details: str,
      handover: str,
      project: str,
      building: str,
    }),
  ),
  posts: list(
    z.object({
      id: z.string().max(64),
      type: str,
      title: str,
      summary: str,
      body: str,
      date: date,
      pinned: z.boolean().catch(false),
      expires: date,
      link: str,
      project: str,
      unit: z
        .object({
          name: str,
          type: str,
          bedrooms: z.union([z.string(), z.number()]).nullable().catch(null),
          total_area: num,
          floor: str,
          view: str,
          project: str,
          price: num,
          offer_price: num,
        })
        .nullable()
        .optional()
        .catch(null),
    }),
  ),
});
export type SalesforceOwnerAnswer = z.infer<typeof salesforceOwnerAnswer>;

const unitFacts = z.object({
  name: z.string(),
  number: z.string().nullable(),
  type: z.string().nullable(),
  bedrooms: z.string().nullable(),
  bathrooms: z.number().nullable(),
  floor: z.string().nullable(),
  building: z.string().nullable(),
  internalArea: z.number().nullable(),
  balconyArea: z.number().nullable(),
  totalArea: z.number().nullable(),
  view: z.string().nullable(),
  parking: z.number().nullable(),
  project: z.string().nullable(),
  completion: z.string().nullable(),
  address: z.string().nullable(),
});

const money = z.object({
  name: z.string(),
  amount: z.number(),
  paid: z.number(),
  due: z.string().nullable(),
});

/** GET /api/owner/portal: what the owner app shows (R1, O1, N1-N3). */
export const ownerPortalResponse = z.object({
  /** "demo" until Salesforce is connected; the app then says "Demo data". */
  source: z.enum(['demo', 'salesforce']),
  person: z.object({
    name: z.string().nullable(),
    firstName: z.string().nullable(),
    email: z.string().nullable(),
    mobile: z.string().nullable(),
  }),
  deals: z.array(
    z.object({
      id: z.string(),
      ref: z.string().nullable(),
      stage: z.string().nullable(),
      role: z.string().nullable(),
      price: z.number(),
      discount: z.number(),
      unit: unitFacts.nullable(),
      instalments: z.array(
        z.object({
          name: z.string(),
          seq: z.number().nullable(),
          amount: z.number(),
          paid: z.number(),
          due: z.string().nullable(),
          description: z.string().nullable(),
        }),
      ),
      charges: z.array(money),
      receipts: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          for: z.string().nullable(),
          amount: z.number(),
          paidOn: z.string().nullable(),
          method: z.string().nullable(),
        }),
      ),
      penalties: z.array(
        z.object({
          name: z.string(),
          for: z.string().nullable(),
          start: z.string().nullable(),
          outstanding: z.number(),
        }),
      ),
    }),
  ),
  updates: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      date: z.string().nullable(),
      percent: z.number().nullable(),
      stage: z.string().nullable(),
      details: z.string().nullable(),
      handover: z.string().nullable(),
      project: z.string().nullable(),
      building: z.string().nullable(),
    }),
  ),
  posts: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      summary: z.string().nullable(),
      body: z.string().nullable(),
      date: z.string(),
      pinned: z.boolean(),
      expires: z.string().nullable(),
      link: z.string().nullable(),
      project: z.string().nullable(),
      offer: z
        .object({
          unitName: z.string().nullable(),
          type: z.string().nullable(),
          bedrooms: z.string().nullable(),
          totalArea: z.number().nullable(),
          floor: z.string().nullable(),
          view: z.string().nullable(),
          project: z.string().nullable(),
          price: z.number().nullable(),
          offerPrice: z.number().nullable(),
        })
        .nullable(),
    }),
  ),
  /** U11: payments happen on JAD Global's payment site, never in JAD+. */
  payUrl: z.string(),
  /** N2: offers this owner has already said they are interested in. */
  interestedOfferIds: z.array(z.string()),
});
export type OwnerPortalAnswer = z.infer<typeof ownerPortalResponse>;
/** What a data source (Salesforce or demo) provides; the API adds the owner's own interests. */
export type OwnerPortal = Omit<OwnerPortalAnswer, 'interestedOfferIds'>;
export type OwnerDeal = OwnerPortal['deals'][number];
export type OwnerPost = OwnerPortal['posts'][number];
export type ConstructionUpdate = OwnerPortal['updates'][number];

/** Only https links are passed to the app (a post link opens in the browser). */
function safeLink(link: string | null): string | null {
  return link !== null && /^https:\/\/[^\s]+$/.test(link) ? link : null;
}

const text = (v: string | number | null): string | null => (v === null ? null : String(v));

/**
 * Turns Salesforce's answer into the app's shape, keeping only what the screens show. `today` (Dubai date)
 * fills a post with no date, as Salesforce does with the record's creation date.
 */
export function fromSalesforce(
  raw: SalesforceOwnerAnswer,
  payUrl: string,
  today: string,
): Omit<OwnerPortal, 'source'> {
  return {
    person: {
      name: raw.person?.name ?? null,
      firstName: raw.person?.first_name ?? null,
      email: raw.person?.email ?? null,
      mobile: raw.person?.mobile ?? null,
    },
    deals: raw.deals.map((d) => ({
      id: d.id,
      ref: d.ref,
      stage: d.stage,
      role: d.role,
      price: d.price ?? 0,
      discount: d.discount ?? 0,
      unit:
        d.unit === null
          ? null
          : {
              name: d.unit.name ?? d.ref ?? 'Unit',
              number: d.unit.number,
              type: d.unit.type,
              bedrooms: text(d.unit.bedrooms),
              bathrooms: d.unit.bathrooms,
              floor: d.unit.floor,
              building: d.unit.building,
              internalArea: d.unit.internal_area,
              balconyArea: d.unit.balcony_area,
              totalArea: d.unit.total_area,
              view: d.unit.view,
              parking: d.unit.parking,
              project: d.unit.project,
              completion: d.unit.completion,
              address: d.unit.address,
            },
      instalments: d.instalments.map((i, k) => ({
        name: i.name ?? `Instalment ${k + 1}`,
        seq: i.seq,
        amount: i.amount ?? 0,
        paid: i.paid ?? 0,
        due: i.due,
        description: i.desc,
      })),
      charges: d.charges.map((c) => ({
        name: c.name ?? 'Charge',
        amount: c.amount ?? 0,
        paid: c.paid ?? 0,
        due: c.due,
      })),
      receipts: d.receipts
        .filter((r) => r.id !== null)
        .map((r) => ({
          id: r.id ?? '',
          name: r.name ?? 'Receipt',
          for: r.for,
          amount: r.amount ?? 0,
          paidOn: r.paid_on,
          method: r.method,
        })),
      penalties: d.penalties.map((p) => ({
        name: p.name ?? 'Late payment fee',
        for: p.for,
        start: p.start,
        outstanding: p.outstanding ?? 0,
      })),
    })),
    updates: raw.updates.map((u) => ({
      id: u.id,
      title: u.title ?? 'Construction update',
      date: u.date,
      percent: u.percent,
      stage: u.stage,
      details: u.details,
      handover: u.handover,
      project: u.project,
      building: u.building,
    })),
    posts: raw.posts.map((p) => ({
      id: p.id,
      type: p.type ?? 'News',
      title: p.title ?? '',
      summary: p.summary,
      body: p.body,
      date: p.date ?? today,
      pinned: p.pinned,
      expires: p.expires,
      link: safeLink(p.link),
      project: p.project,
      offer:
        p.unit === null || p.unit === undefined
          ? null
          : {
              unitName: p.unit.name,
              type: p.unit.type,
              bedrooms: text(p.unit.bedrooms),
              totalArea: p.unit.total_area,
              floor: p.unit.floor,
              view: p.unit.view,
              project: p.unit.project,
              price: p.unit.price,
              offerPrice: p.unit.offer_price,
            },
    })),
    payUrl,
  };
}
