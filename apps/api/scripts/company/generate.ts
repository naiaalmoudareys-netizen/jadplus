/**
 * Builds the demo company: about three months of a running JAD+ (all people fictional), produced by driving the
 * real API in memory with a simulated clock (scripts/company/sim.ts). The result is the in-memory database and file
 * store; export.ts turns them into SQL and files for the developer's LOCAL database.
 *
 * The quarter: day one is set-up (providers, documents, services, teams, rate cards); owners join over the first
 * days; units are let or handed to property management; then every day brings routine repairs and the odd
 * emergency, and through the quarter come snagging, valuations, consultations, handovers, furnishing, design,
 * investor sessions, desk requests and offers. A few moments are placed on purpose so that "today" shows each
 * case: an emergency waiting right now, one that went to the backup, one that reached JAD+ on-call, a tenant
 * request waiting more than 48 hours, an overdue valuation, keys due this week, a missing statement, a pending
 * rate card, an expiring insurance, a gap in the on-call rota.
 */
import { actor } from './actors.js';
import type { Company, Owner } from './company.js';
import { consultation, type ConsultService } from './consultations.js';
import { emergency, type EmergencyVariant } from './emergency.js';
import type { Party } from './jobs.js';
import { design, furnishing, handover, investorBook, session } from './lifestyle.js';
import { tenants } from './people.js';
import { snagging, valuation } from './reports.js';
import {
  buildings,
  castOwners,
  deskStory,
  joinOwners,
  lateInvite,
  letUnits,
  liveNotice,
  manageUnits,
  offerStory,
  withdrawnNotice,
} from './residents.js';
import { rng } from './rng.js';
import { ROUTINE_VARIANTS, routine, type RoutineVariant } from './routine.js';
import { leave, statements, weekly } from './routines.js';
import { pendingRateCard, setupCompany } from './setup.js';
import { DAY, HOUR, MIN, Sim, addDays } from './sim.js';
import { companyWorld, type CompanyWorld } from './world.js';
import { dubaiDate } from '@jadplus/shared';

export interface CompanyOptions {
  readonly indexKey: string;
  readonly dataKey: string;
  /** The moment the simulation stops ("now" in the demo). */
  readonly end: number;
  /** How many days the company has been running. */
  readonly days: number;
  readonly seed: number;
  /** Where the app's (redacted) log lines go; dropped by default. */
  readonly logSink?: (line: string) => void;
}

/**
 * The owner's tenant, if a tenancy is current and runs at least two more weeks (read from the database: one ends
 * during the quarter). A tenancy ending mid-job is still handled: resident steps then fall to the owner (jobs.ts).
 */
function currentTenancy(c: Company, o: Owner): Party | null {
  const today = addDays(dubaiDate(c.sim.now), 14);
  for (const t of o.tenancies) {
    const row = c.w.db
      .prepare("SELECT 1 AS yes FROM tenancies WHERE id = ? AND status = 'active' AND ends_on >= ?")
      .get(t.id, today);
    if (row !== undefined) return { owner: o, raiser: t.tenant, tenancyId: t.id, unitId: t.unit.id };
  }
  return null;
}

function ownerParty(o: Owner, unitIndex = 0): Party {
  const unit = o.person.units[unitIndex] ?? o.person.units[0];
  if (unit === undefined) throw new Error('Owner without a unit');
  return { owner: o, raiser: o.actor, tenancyId: null, unitId: unit.id };
}

/** A party for a repair: often a tenant, else an owner of a unit they live in or keep. */
function anyParty(c: Company, preferTenant: boolean): Party {
  if (preferTenant) {
    const lets = c.owners.map((o) => currentTenancy(c, o)).filter((p): p is Party => p !== null);
    if (lets.length > 0) return c.r.pick(lets);
  }
  const o = c.r.pick(c.owners);
  return ownerParty(o, c.r.int(0, 1));
}

function spawn(c: Company, at: number, story: () => Promise<void>): void {
  if (at <= c.sim.end) c.sim.spawn(at, story);
}

function ownerAt(c: Company, i: number): Owner {
  const o = c.owners[i % c.owners.length];
  if (o === undefined) throw new Error('No owners yet');
  return o;
}

/** Owner number `i` (0 is Layla Haddad), as the party for one of their units. */
const party = (c: Company, i: number, unit = 0): Party => ownerParty(ownerAt(c, i), unit);

/** Layla Haddad, the demo owner everyone already knows: her app shows a bit of everything. */
function layla(c: Company, at: (fraction: number) => number): void {
  const L = c.owners[0];
  if (L === undefined) return;
  const E = c.sim.end;
  spawn(c, at(0.3), () => emergency(c, ownerParty(L, 0), 'normal'));
  spawn(c, at(0.5), () => routine(c, ownerParty(L, 1), 'quote'));
  spawn(c, at(0.4), () => deskStory(c, L, c.admin));
  spawn(c, at(0.45), () => offerStory(c, L));
  spawn(c, at(0.7), () => valuation(c, ownerParty(L, 1), false));
  spawn(c, E - 12 * DAY, () => consultation(c, ownerParty(L, 1), 'leasing', 1));
  spawn(c, E - 5 * DAY, () => routine(c, ownerParty(L, 0), 'quote_expired'));
  spawn(c, E - 2 * DAY, () => routine(c, ownerParty(L, 1), 'simple'));
}

function streams(c: Company, ready: number): void {
  const E = c.sim.end;
  // Daily repairs and emergencies.
  for (let day = ready; day < E; day += DAY) {
    const lastWeek = day > E - 7 * DAY;
    const repairs = c.r.int(lastWeek ? 2 : 1, lastWeek ? 4 : 2);
    for (let k = 0; k < repairs; k += 1) {
      const preferTenant = c.r.chance(0.45);
      const v: RoutineVariant =
        preferTenant && c.r.chance(0.1) ? 'declined_by_owner' : c.r.pick(ROUTINE_VARIANTS);
      spawn(c, day + c.r.int(7, 20) * HOUR + c.r.int(0, 59) * MIN, () =>
        routine(c, anyParty(c, preferTenant), v),
      );
    }
    if (c.r.chance(0.28))
      spawn(c, day + c.r.int(0, 23) * HOUR, () => emergency(c, anyParty(c, c.r.chance(0.5)), 'normal'));
    if (c.r.chance(0.25))
      spawn(c, day + c.r.int(9, 18) * HOUR, () =>
        deskStory(c, c.r.pick(c.owners), c.r.chance(0.7) ? c.admin : c.ops),
      );
  }
  const span = E - ready;
  const at = (fraction: number) => ready + Math.floor(span * fraction);
  const featured: [number, EmergencyVariant][] = [
    [at(0.25), 'backup'],
    [at(0.45), 'on_call'],
    [at(0.35), 'reclassified'],
    [E - 3 * DAY + 2 * HOUR, 'backup'],
    [E - 6 * MIN, 'open_now'],
  ];
  for (const [t, v] of featured) spawn(c, t, () => emergency(c, anyParty(c, true), v));
  // A leak from the building's riser at J188, two days ago: the facilities desk's (demo) number never answers, so
  // JAD+ Admin's undelivered alerts list shows it.
  spawn(c, E - 2 * DAY - 5 * HOUR, () => emergency(c, party(c, 4), 'normal', true));
  // Tenant requests waiting for the owner: one over 48 hours ("call the owner"), one from this morning.
  spawn(c, E - 3 * DAY, () => routine(c, anyParty(c, true), 'waiting_owner'));
  spawn(c, E - 5 * HOUR, () => routine(c, anyParty(c, true), 'waiting_owner'));

  // Snagging and valuations.
  [0.05, 0.3, 0.55, 0.8, 0.93].forEach((f, i) => {
    spawn(c, at(f), () => snagging(c, party(c, 21 + i), 'professional'));
  });
  [0.15, 0.6, 0.97].forEach((f, i) => {
    spawn(c, at(f), () => snagging(c, party(c, 26 + i), 'soft'));
  });
  [0.1, 0.35, 0.6, 0.85].forEach((f, i) => {
    spawn(c, at(f), () => valuation(c, party(c, 29 + i), false));
  });
  spawn(c, E - 6 * DAY, () => valuation(c, party(c, 33), true));

  // Consultations at every stage.
  const consults: [ConsultService, number, boolean, number][] = [
    ['leasing', 4, false, 0.05],
    ['leasing', 2, false, 0.7],
    ['leasing', 0, false, 0.95],
    ['leasing', 1, true, 0.4],
    ['resale', 4, false, 0.1],
    ['resale', 1, false, 0.8],
    ['resale', -1, false, 0.99],
    ['resale', 2, true, 0.5],
    ['property-management', 3, false, 0.2],
    ['property-management', 1, false, 0.85],
    ['property-management', 0, true, 0.6],
    ['mortgage', 3, false, 0.15],
    ['mortgage', 1, false, 0.75],
    ['mortgage', 0, true, 0.45],
    ['mortgage', -1, false, 0.98],
    ['golden-visa', 4, false, 0.1],
    ['golden-visa', 2, false, 0.7],
    ['golden-visa', 1, true, 0.3],
    ['golden-visa', 0, false, 0.96],
  ];
  consults.forEach(([service, reach, dropped, f], i) => {
    spawn(c, at(f), () => consultation(c, party(c, 3 + i, 1), service, reach, dropped));
  });

  // Handovers, furnishing, interior design.
  spawn(c, at(0.05), () => handover(c, party(c, 34), 5, 4));
  spawn(c, at(0.4), () => handover(c, party(c, 35), 3, null));
  spawn(c, E - 9 * DAY, () => handover(c, party(c, 36), 5, 7, 1));
  spawn(c, E - 6 * DAY, () => handover(c, party(c, 37), 1, null));
  spawn(c, at(0.2), () => furnishing(c, party(c, 22, 1), false));
  spawn(c, at(0.65), () => furnishing(c, party(c, 23, 1), true));
  spawn(c, E - 4 * DAY, () => furnishing(c, party(c, 24, 1), false));
  [4, 3, 2, 1].forEach((reach, i) => {
    spawn(c, at(0.1 + i * 0.22), () => design(c, party(c, 5 + i, 1), reach));
  });

  // Investor education: three past sessions, two upcoming (one full), and the book.
  const people = c.owners.slice(1);
  spawn(c, at(0.05), () => session(c, 20, people.slice(0, 9), 10, 'Investing in Dubai off-plan'));
  spawn(c, at(0.35), () =>
    session(c, 15, people.slice(9, 17), 9, 'Renting out your unit: what owners should know'),
  );
  spawn(c, at(0.65), () => session(c, 25, people.slice(17, 28), 8, 'Resale and the Dubai market'));
  spawn(c, E - 10 * DAY, () =>
    session(c, 30, [ownerAt(c, 0), ...people.slice(2, 11)], 14, 'Golden Visa and residency for investors'),
  );
  spawn(c, E - 8 * DAY, () => session(c, 6, people.slice(20, 26), 13, 'Q&A with the handover team'));
  people.slice(0, 8).forEach((o, i) => {
    spawn(c, at(0.1 + i * 0.1), () => investorBook(c, o, i % 3 !== 2));
  });
  layla(c, at);
  people.slice(10, 22).forEach((o, i) => {
    spawn(c, at(0.05 + i * 0.075), () => offerStory(c, o));
  });
}

export async function buildCompany(o: CompanyOptions): Promise<Company> {
  const start = o.end - o.days * DAY;
  const w: CompanyWorld = await companyWorld(o.indexKey, o.dataKey, start, o.logSink);
  const sim = new Sim(w, start, o.end);
  const c: Company = {
    w,
    sim,
    r: rng(o.seed),
    scale: Math.min(1, o.days / 90),
    admin: actor('admin.demo@jadplus.ae', 'console'),
    ops: actor('ops.demo@jadplus.ae', 'console'),
    viewer: actor('viewer.demo@jadplus.ae', 'console'),
    providers: new Map(),
    owners: [],
    tenantPeople: tenants(),
    requests: [],
  };
  sim.spawn(start + 9 * HOUR, async () => {
    await setupCompany(c);
    castOwners(c);
    sim.spawn(sim.now, () => weekly(c));
    await joinOwners(c);
    await buildings(c);
    await letUnits(c);
    const managed = await manageUnits(c);
    const since = addDays(dubaiDate(sim.now), -40);
    sim.spawn(sim.now, () => statements(c, managed, since));
    streams(c, sim.now);
    spawn(c, sim.now + Math.floor((o.end - sim.now) * 0.3), () => withdrawnNotice(c));
    spawn(c, o.end - DAY, () => liveNotice(c));
    spawn(c, o.end - 2 * DAY, () => lateInvite(c));
    spawn(c, o.end - 2 * DAY + 3 * HOUR, () => pendingRateCard(c));
    spawn(c, o.end - 3 * DAY, () => leave(c, 'fixers'));
    spawn(c, o.end - 12 * DAY, () => leave(c, 'gulf'));
  });
  await sim.run();
  return c;
}
