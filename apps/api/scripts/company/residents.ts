/**
 * Owners and tenants of the demo company: owners join over the first two weeks (signing in as the app does, with
 * "Salesforce" answering for them), set their language, notifications and agreements, let their units to tenants
 * or hand them to the property management team, and use the desk and the offers. JAD+ Admin sets up the
 * buildings: help lines, contacts, the home guide and notices.
 */
import { dubaiDate, type OwnerLookup } from '@jadplus/shared';
import { actor, get, post, put, signIn, type Actor } from './actors.js';
import { provider, type Company, type Owner, type Tenancy } from './company.js';
import { owners as demoOwners, type DemoOwner, type DemoPerson, type DemoUnit } from './people.js';
import { DAY, HOUR, MIN, addDays } from './sim.js';

const VERSION = '2026-11-draft';
const LANGUAGES = ['en', 'en', 'en', 'en', 'ar', 'ar', 'fr', 'ru', 'zh'] as const;

function lookup(o: DemoOwner): OwnerLookup {
  return {
    found: true,
    shared: false,
    person: { contactId: `003DEMO${o.phone.slice(-10)}A`, name: o.name, email: o.email, mobile: o.phone },
    units: o.units.map((u) => ({
      unitId: u.id,
      dealId: u.dealId,
      unitName: u.name,
      project: u.project,
      building: u.building,
      address: u.address,
      role: 'Buyer' as const,
    })),
  };
}

async function join(c: Company, o: Owner): Promise<void> {
  const { w, r } = c;
  await signIn(w, o.actor);
  const row = w.db
    .prepare('SELECT user_id FROM owner_units WHERE sf_unit_id = ?')
    .get(o.person.units[0]?.id ?? '') as { user_id: string } | undefined;
  if (row === undefined) throw new Error('Owner was not linked to the unit');
  o.userId = row.user_id;
  await post(w, o.actor, '/api/me/consents', { kind: 'terms', version: VERSION, accepted: true });
  await post(w, o.actor, '/api/me/preferences', {
    language: r.pick(LANGUAGES),
    notifications: {
      payments: true,
      construction: r.chance(0.8),
      news: r.chance(0.6),
      offers: r.chance(0.5),
    },
  });
  await post(w, o.actor, '/api/me/consents', {
    kind: 'marketing',
    version: VERSION,
    accepted: r.chance(0.45),
  });
  if (o.makeSafe) {
    await post(w, o.actor, '/api/me/consents', {
      kind: 'make_safe_cap',
      version: VERSION,
      accepted: true,
      capAed: r.pick([500, 1000, 1000, 2000] as const),
    });
  }
}

/** Creates the owners (not yet signed in); `joinOwners` spreads their first sign-in over the first days. */
export function castOwners(c: Company): void {
  for (const [i, person] of demoOwners().entries()) {
    c.w.salesforce.set(`email:${person.email}`, lookup(person));
    c.w.salesforce.set(`phone:${person.phone}`, lookup(person));
    c.owners.push({
      person,
      actor: actor(person.email, 'mobile'),
      makeSafe: i % 3 !== 2,
      tenancies: [],
      managed: new Map(),
      userId: '',
    });
  }
}

export async function joinOwners(c: Company): Promise<void> {
  const [first, ...rest] = c.owners;
  if (first !== undefined) await join(c, first);
  for (const o of rest) {
    await c.sim.wait(c.r.int(1, 5) * HOUR * c.scale);
    await join(c, o);
  }
}

async function invite(
  c: Company,
  o: Owner,
  unit: DemoUnit,
  tenant: DemoPerson,
  startsOn: string,
  endsOn: string,
  accept: boolean,
) {
  const { id } = await post<{ id: string }>(c.w, o.actor, '/api/owner/tenancies', {
    sfUnitId: unit.id,
    name: tenant.name,
    email: tenant.email,
    startsOn,
    endsOn,
  });
  const t: Tenancy = { id, unit, tenant: actor(tenant.email, 'mobile') };
  if (accept) {
    await c.sim.wait(c.r.int(1, 30) * HOUR * c.scale);
    await post(c.w, t.tenant, `/api/tenant/tenancies/${id}/accept`);
    o.tenancies.push(t);
  }
  return t;
}

/** Owners 2-11 let their first unit; one tenancy ends soon, one ends during the quarter. */
export async function letUnits(c: Company): Promise<void> {
  const tenants = c.tenantPeople;
  for (let i = 0; i < 10; i += 1) {
    const o = c.owners[i + 1];
    const tenant = tenants[i];
    const unit = o?.person.units[0];
    if (o === undefined || tenant === undefined || unit === undefined) continue;
    await c.sim.wait(c.r.int(3, 20) * HOUR * c.scale);
    const today = dubaiDate(c.sim.now);
    const startsOn = addDays(today, -c.r.int(0, 28));
    const endsOn =
      i === 0 ? dubaiDate(c.sim.end + 18 * DAY) : i === 1 ? addDays(today, 40) : addDays(startsOn, 364);
    await invite(c, o, unit, tenant, startsOn, endsOn, true);
  }
}

/** Two days before "now", owner 12 invites a tenant who has not accepted yet. */
export async function lateInvite(c: Company): Promise<void> {
  const o = c.owners[12];
  const tenant = c.tenantPeople[10];
  const unit = o?.person.units[0];
  if (o === undefined || tenant === undefined || unit === undefined) return;
  const today = dubaiDate(c.sim.now);
  await invite(c, o, unit, tenant, addDays(today, 10), addDays(today, 375), false);
}

/** JAD+ Admin hands eight units to Harbor Property Management; it lets two of them itself. */
export async function manageUnits(c: Company): Promise<string[]> {
  const pm = provider(c, 'pm');
  const ids: string[] = [];
  const since = addDays(dubaiDate(c.sim.now), -40);
  for (let i = 13; i < 21; i += 1) {
    const o = c.owners[i];
    const unit = o?.person.units[0];
    if (o === undefined || unit === undefined) continue;
    const { id } = await post<{ id: string }>(c.w, c.admin, '/api/admin/managed-units', {
      sfUnitId: unit.id,
      ownerUserId: o.userId,
      providerId: pm.id,
      since,
      until: addDays(since, 365),
    });
    o.managed.set(unit.id, id);
    ids.push(id);
  }
  for (const [k, managedId] of ids.slice(0, 2).entries()) {
    const o = c.owners[13 + k];
    const unit = o?.person.units[0];
    const tenant = c.tenantPeople[11 + k];
    if (o === undefined || unit === undefined || tenant === undefined) continue;
    const today = dubaiDate(c.sim.now);
    const { id } = await post<{ id: string }>(
      c.w,
      pm.office,
      `/api/partner/managed-units/${managedId}/tenancies`,
      {
        sfUnitId: unit.id,
        name: tenant.name,
        email: tenant.email,
        startsOn: addDays(today, -5),
        endsOn: addDays(today, 360),
      },
    );
    const t: Tenancy = { id, unit, tenant: actor(tenant.email, 'mobile') };
    await post(c.w, t.tenant, `/api/tenant/tenancies/${id}/accept`);
    o.tenancies.push(t);
  }
  return ids;
}

const DESK_TYPES = [
  'SPA',
  'Stamped Statement of Account',
  'NOC',
  'Reservation Form',
  'Oqood or Title Deed copy',
] as const;

/** Over the quarter, owners ask the desk for documents and contact changes; JAD+ Admin answers most. */
export async function deskStory(c: Company, o: Owner, admin: Actor): Promise<void> {
  const contact = c.r.chance(0.25);
  const { id } = await post<{ id: string }>(
    c.w,
    o.actor,
    '/api/owner/desk-requests',
    contact
      ? {
          type: 'Update my contact details',
          dealId: null,
          details: 'Please update my postal address to the new one I gave at the office.',
        }
      : { type: c.r.pick(DESK_TYPES), dealId: c.r.chance(0.5) ? 'DEMODEAL0000000001' : 'DEMODEAL0000000002' },
  );
  const fate = c.r.next();
  if (fate < 0.15) return;
  await c.sim.wait(c.r.int(2, 30) * HOUR);
  if (fate < 0.3) {
    await post(c.w, admin, `/api/admin/desk-requests/${id}`, {
      status: 'In progress',
      reply: 'We are preparing this for you.',
    });
    return;
  }
  if (fate < 0.38) {
    await post(c.w, admin, `/api/admin/desk-requests/${id}`, {
      status: 'Cancelled',
      reply: 'This was already sent to you by email last week.',
    });
    return;
  }
  await post(c.w, admin, `/api/admin/desk-requests/${id}`, { status: 'In progress' });
  await c.sim.wait(c.r.int(1, 4) * DAY);
  await post(c.w, admin, `/api/admin/desk-requests/${id}`, {
    status: 'Completed',
    reply: contact
      ? 'Your details are updated.'
      : 'Your document is ready to collect at the JAD Global office.',
  });
}

/** An owner taps "I'm interested" on the exclusive offer; JAD+ Admin follows up on most. */
export async function offerStory(c: Company, o: Owner): Promise<void> {
  const res = await post<{ id: string }>(c.w, o.actor, '/api/owner/offers/demo-p1/interest');
  if (c.r.chance(0.35)) return;
  await c.sim.wait(c.r.int(4, 48) * HOUR);
  await post(c.w, c.admin, `/api/admin/offer-interests/${res.id}/handled`);
}

/** Building help lines, contacts and the home guide (E12, V1), once the projects have owners. */
export async function buildings(c: Company): Promise<void> {
  const a = c.admin;
  const lines: [string, string, string, string][] = [
    ['J188', 'security', '+971500000901', '24/7'],
    ['J188', 'management', '+971500000902', 'Sun-Fri 8:00-18:00'],
    ['JAD 288', 'security', '+971500000903', '24/7'],
    ['JAD 288', 'management', '+971500000904', 'Mon-Sat 9:00-17:00'],
  ];
  for (const [project, kind, phone, hours] of lines) {
    await put(c.w, a, '/api/admin/building-lines', { project, building: null, kind, phone, hours });
  }
  await post(c.w, a, '/api/admin/building-contacts', {
    project: 'J188',
    building: null,
    name: 'Facilities Desk (demo)',
    role: 'Facility management',
    phone: '+971500000905',
    email: null,
  });
  await post(c.w, a, '/api/admin/building-contacts', {
    project: 'JAD 288',
    building: 'Block B',
    name: 'Block B Concierge (demo)',
    role: 'Concierge',
    phone: '+971500000906',
    email: null,
  });
  const guide: [string, string | null, string, string, string][] = [
    [
      'J188',
      null,
      'ac',
      'Air conditioning',
      'Each room has its own thermostat. Keep it at 24 degrees for the best comfort and lowest bill. Filters are cleaned by the building team every three months.',
    ],
    [
      'J188',
      null,
      'water',
      'Water and the water heater',
      'The water heater is in the utility cupboard. Switch it on 30 minutes before use. The main water valve is under the kitchen sink.',
    ],
    [
      'J188',
      null,
      'waste',
      'Waste and recycling',
      'Waste chutes are next to the lifts on every floor. Recycling bins are in the basement, level B1.',
    ],
    [
      'J188',
      null,
      'parking',
      'Parking',
      'Each unit has one numbered bay. Visitor parking is at ground level for up to four hours.',
    ],
    [
      'JAD 288',
      null,
      'access',
      'Access cards',
      'Each resident receives two access cards at handover. Ask the concierge for extra cards.',
    ],
    [
      'JAD 288',
      null,
      'amenities',
      'Pool and gym',
      'Pool and gym are open 6:00-22:00. Children under 12 must be with an adult at the pool.',
    ],
  ];
  for (const [project, building, section, title, body] of guide) {
    await put(c.w, a, '/api/admin/guide', { project, building, section, title, body });
  }
}

/** A notice later withdrawn (mid-quarter), and a live one for tomorrow (created the day before "now"). */
export async function withdrawnNotice(c: Company): Promise<void> {
  const { id } = await post<{ id: string }>(c.w, c.admin, '/api/admin/notices', {
    project: 'J188',
    building: null,
    kind: 'lift',
    title: 'Lift 2 maintenance',
    body: 'Lift 2 will be closed for its yearly safety check. Lift 1 and the service lift stay in use.',
    startsAt: c.sim.now + 2 * DAY,
    endsAt: c.sim.now + 2 * DAY + 6 * HOUR,
  });
  await c.sim.wait(20 * HOUR);
  await post(c.w, c.admin, `/api/admin/notices/${id}/withdraw`);
}

export async function liveNotice(c: Company): Promise<void> {
  const start = c.sim.end + 14 * HOUR;
  await post(c.w, c.admin, '/api/admin/notices', {
    project: 'JAD 288',
    building: 'Block B',
    kind: 'water',
    title: 'Water off for tank cleaning',
    body: 'Water will be off in Block B for the yearly tank cleaning. Please keep some water aside for the morning.',
    startsAt: start,
    endsAt: start + 5 * HOUR,
  });
  await post(c.w, c.admin, '/api/admin/notices', {
    project: 'J188',
    building: null,
    kind: 'works',
    title: 'Facade cleaning this week',
    body: 'Rope access teams clean the facade this week from 8:00 to 17:00. Please keep balcony doors closed.',
    startsAt: c.sim.now - 30 * MIN,
    endsAt: c.sim.end + 4 * DAY,
  });
}

/** The person opens the app's inbox and reads everything. */
export async function readInbox(c: Company, a: Actor): Promise<void> {
  await get(c.w, a, '/api/me/inbox');
  await post(c.w, a, '/api/me/inbox/read', { all: true });
}
