/**
 * Handover (O2; ADR 0033), furnishing and interior design (O5; ADR 0034) and investor education (O5; ADR 0033):
 * the handover team ticks the checklist and books the key collection; Casa Interiors quotes and delivers on a
 * date (sometimes moved); Atelier Nine moves a design through its stages; Harbor Real Estate runs investor
 * sessions, marks attendance and sends the book.
 */
import { dubaiDate } from '@jadplus/shared';
import { get, post, put } from './actors.js';
import { holder, provider, tech, type Company, type Owner } from './company.js';
import { invoiceStory } from './invoices.js';
import { SLOTS, arrive, book, confirmAndRate, finish, type Party } from './jobs.js';
import { DAY, HOUR, MIN, addDays, dubaiTime } from './sim.js';

async function raise(c: Company, x: Party, serviceCode: string, description: string): Promise<string> {
  const days = await c.sim.preferredDays();
  const { requestId } = await post<{ requestId: string }>(c.w, x.owner.actor, '/api/requests', {
    sfUnitId: x.unitId,
    serviceCode,
    description,
    preferredDate: days[c.r.int(0, 3)] ?? days[0] ?? '',
    preferredSlot: c.r.pick(SLOTS),
  });
  c.requests.push(requestId);
  return requestId;
}

/** The next Monday-Friday date on or after `date`. */
function workingDay(date: string): string {
  let d = date;
  while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = addDays(d, 1);
  return d;
}

const STEPS = ['final_payment', 'documents', 'snagging', 'utilities', 'service_charges'] as const;
const STEP_NOTES: Readonly<Record<string, string | null>> = {
  final_payment: 'Final payment received, thank you.',
  documents: 'Handover pack ready to sign at key collection.',
  snagging: null,
  utilities: 'DEWA and cooling accounts are active.',
  service_charges: 'Service charges for this year are settled.',
};

/** A handover; `steps` of the five paperwork steps get done, then (if all) keys `keyInDays` after the last. */
export async function handover(
  c: Company,
  x: Party,
  steps: number,
  keyInDays: number | null,
  gapDays = 5,
): Promise<void> {
  const id = await raise(c, x, 'handover', 'My unit is complete, please guide me through the handover.');
  const pm = provider(c, 'pm');
  await c.sim.wait(c.r.int(2, 20) * HOUR);
  const { id: checklist } = await post<{ id: string }>(c.w, pm.office, '/api/partner/handovers', {
    requestId: id,
  });
  for (const step of STEPS.slice(0, steps)) {
    await c.sim.wait(c.r.int(1, gapDays) * DAY);
    await post(c.w, pm.office, `/api/partner/handovers/${checklist}/steps`, {
      step,
      done: true,
      note: STEP_NOTES[step] ?? null,
    });
  }
  if (steps < STEPS.length || keyInDays === null) return;
  const date = workingDay(addDays(dubaiDate(c.sim.now), keyInDays));
  const slot = c.r.pick(SLOTS);
  await put(c.w, pm.office, `/api/partner/handovers/${checklist}/appointment`, { date, slot });
  const t = tech(pm, c.r.int(0, 1));
  const start = await book(c, pm, id, t, date, slot);
  await arrive(c, id, t, start);
  await c.sim.wait(50 * MIN);
  await post(c.w, pm.office, `/api/partner/handovers/${checklist}/steps`, {
    step: 'keys_collected',
    done: true,
    note: 'Keys and access cards handed over.',
  });
  await finish(c, id, t);
  await confirmAndRate(c, x, id, 'confirm');
}

/** Furnishing: quote, approval, a delivery date (moved once in `moved`), delivery and installation. */
export async function furnishing(c: Company, x: Party, moved: boolean): Promise<void> {
  const id = await raise(c, x, 'furnishing', 'Full furniture package for a rental, modern style.');
  const p = holder(c, id);
  await c.sim.wait(c.r.int(4, 30) * HOUR);
  await post(c.w, p.office, `/api/partner/jobs/${id}/quote`, {
    amountAed: c.r.pick([28_000, 39_000]),
    scope: 'Furniture package with delivery, assembly and removal of packaging.',
  });
  await c.sim.wait(c.r.int(6, 48) * HOUR);
  const q = c.w.db.prepare("SELECT id FROM quotes WHERE request_id = ? AND status = 'pending'").get(id) as {
    id: string;
  };
  await post(c.w, x.owner.actor, `/api/requests/${id}/quote-decision`, {
    quoteId: q.id,
    decision: 'approve',
  });
  let date = workingDay(addDays(dubaiDate(c.sim.now), c.r.int(7, 14)));
  const slot = c.r.pick(SLOTS);
  await c.sim.wait(c.r.int(2, 20) * HOUR);
  await put(c.w, p.office, `/api/partner/jobs/${id}/delivery`, { date, slot, reason: null });
  if (moved) {
    await c.sim.wait(c.r.int(2, 4) * DAY);
    date = workingDay(addDays(date, 4));
    await put(c.w, p.office, `/api/partner/jobs/${id}/delivery`, {
      date,
      slot,
      reason: 'The sofa arrives late from the supplier.',
    });
  }
  await c.sim.until(dubaiTime(date, 7));
  const t = tech(p, 0);
  const start = await book(c, p, id, t, date, slot);
  await arrive(c, id, t, start);
  await finish(c, id, t);
  c.sim.spawn(c.sim.now + c.r.int(2, 30) * HOUR, () => invoiceStory(c, x, id, p));
  await confirmAndRate(c, x, id, 'confirm');
}

const DESIGN = ['concept', 'design_approved', 'fit_out', 'handover'] as const;

/** Interior design through `reach` stages (4 = finished and confirmed). */
export async function design(c: Company, x: Party, reach: number): Promise<void> {
  const id = await raise(
    c,
    x,
    'interior-design',
    'Design for the living room and master bedroom, warm and calm.',
  );
  const p = holder(c, id);
  await c.sim.wait(c.r.int(1, 4) * DAY);
  await post(c.w, p.office, `/api/partner/jobs/${id}/quote`, {
    amountAed: c.r.pick([18_500, 26_000, 34_000]),
    scope: 'Concept, 3D views, procurement and fit-out supervision.',
  });
  await c.sim.wait(c.r.int(1, 3) * DAY);
  const q = c.w.db.prepare("SELECT id FROM quotes WHERE request_id = ? AND status = 'pending'").get(id) as {
    id: string;
  };
  await post(c.w, x.owner.actor, `/api/requests/${id}/quote-decision`, {
    quoteId: q.id,
    decision: 'approve',
  });
  const t = tech(p, 0);
  for (const [i, stage] of DESIGN.slice(0, reach).entries()) {
    await c.sim.wait(c.r.int(4, 10) * DAY);
    if (stage === 'fit_out') {
      const start = await book(c, p, id, t, new Date(c.sim.now + DAY).toISOString().slice(0, 10), 'morning');
      await arrive(c, id, t, start);
    }
    await post(c.w, p.office, `/api/partner/jobs/${id}/project-stage`, {
      stage,
      note: i === 0 ? 'Mood boards shared with the owner.' : null,
    });
  }
  if (reach < DESIGN.length) return;
  await finish(c, id, t);
  c.sim.spawn(c.sim.now + c.r.int(2, 30) * HOUR, () => invoiceStory(c, x, id, p));
  await confirmAndRate(c, x, id, 'confirm');
}

/** Whether an investor session (not cancelled) is already set on this Dubai date. */
function sessionOn(c: Company, date: string): boolean {
  const row = c.w.db
    .prepare(
      'SELECT 1 AS yes FROM education_sessions WHERE cancelled_at IS NULL AND starts_at >= ? AND starts_at < ?',
    )
    .get(dubaiTime(date, 0), dubaiTime(date, 24));
  return row !== undefined;
}

/**
 * An investor session `inDays` after it is announced (moved on to the next free working day, so two sessions
 * never share a day), at `hour` (Dubai); owners take seats; attendance is marked after it.
 */
export async function session(
  c: Company,
  seats: number,
  takers: readonly Owner[],
  inDays: number,
  title: string,
  hour = 18,
): Promise<void> {
  const re = provider(c, 're').office;
  let date = workingDay(addDays(dubaiDate(c.sim.now), inDays));
  while (sessionOn(c, date)) date = workingDay(addDays(date, 1));
  const online = c.r.chance(0.3);
  const startsAt = dubaiTime(date, hour);
  const { id } = await post<{ id: string }>(c.w, re, '/api/partner/education/sessions', {
    title,
    description: 'A practical evening with the JAD Global team, with time for your questions.',
    startsAt,
    endsAt: startsAt + 90 * MIN,
    mode: online ? 'online' : 'in_person',
    place: online ? 'https://meet.example.com/jadplus-demo' : 'JAD Global office, Business Bay, Dubai',
    seats,
  });
  for (const o of takers.slice(0, seats)) {
    await c.sim.wait(c.r.int(2, 30) * HOUR);
    if (c.sim.now >= startsAt - 3 * HOUR) break;
    await post(c.w, o.actor, `/api/education/sessions/${id}/seat`);
  }
  await c.sim.until(startsAt + 2 * HOUR);
  const { bookings } = await get<{ bookings: { id: string; cancelledAt: number | null }[] }>(
    c.w,
    re,
    `/api/partner/education/sessions/${id}/bookings`,
  );
  for (const b of bookings) {
    if (b.cancelledAt === null)
      await post(c.w, re, `/api/partner/education/bookings/${b.id}/attendance`, {
        attended: c.r.chance(0.8),
      });
  }
}

/** An owner asks for the investor book; the office sends most within days. */
export async function investorBook(c: Company, o: Owner, send: boolean): Promise<void> {
  const { id } = await post<{ id: string }>(c.w, o.actor, '/api/education/book');
  if (!send) return;
  await c.sim.wait(c.r.int(1, 5) * DAY);
  await post(c.w, provider(c, 're').office, `/api/partner/education/books/${id}/sent`);
}
