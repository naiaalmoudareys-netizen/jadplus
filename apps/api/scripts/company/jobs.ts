/**
 * Steps every visit job shares (ADR 0018, 0019), as the technician's app and the partner office's console make
 * them: book a visit, on my way, start, a completion photo, done, and the resident's confirmation and rating.
 */
import { call, post, upload, type Actor } from './actors.js';
import type { Company, Owner, Provider, Tech } from './company.js';
import { PHOTO_COLOURS, demoPhoto } from './files.js';
import { DAY, HOUR, MIN, SLOT_HOURS, dubaiTime, type Slot } from './sim.js';

export const SLOTS: readonly Slot[] = ['morning', 'midday', 'afternoon'];

/** Who raised a request and who decides on money for it. */
export interface Party {
  readonly owner: Owner;
  /** The tenant, when a tenant raised it; else the owner. */
  readonly raiser: Actor;
  readonly tenancyId: string | null;
  readonly unitId: string;
}

/** Who acts for the residents now: the tenant while their tenancy is current, else the owner (it may have ended). */
export function resident(c: Company, x: Party): Actor {
  if (x.tenancyId === null) return x.raiser;
  const today = new Date(c.sim.now + 4 * HOUR).toISOString().slice(0, 10);
  const row = c.w.db
    .prepare("SELECT 1 AS yes FROM tenancies WHERE id = ? AND status = 'active' AND ends_on >= ?")
    .get(x.tenancyId, today);
  return row === undefined ? x.owner.actor : x.raiser;
}

/** The earliest window on or after `date`/`slot` that the API accepts now (start not in the past). */
export function windowFor(c: Company, date: string, slot: Slot): { start: number; end: number } {
  let start = dubaiTime(date, SLOT_HOURS[slot]);
  if (start < c.sim.now + 30 * MIN) start = c.sim.now + 2 * HOUR - ((c.sim.now + 2 * HOUR) % (30 * MIN));
  return { start, end: start + 2 * HOUR };
}

export async function book(
  c: Company,
  p: Provider,
  id: string,
  t: Tech,
  date: string,
  slot: Slot,
): Promise<number> {
  const { start, end } = windowFor(c, date, slot);
  await post(c.w, p.office, `/api/partner/jobs/${id}/visit`, {
    technicianId: t.id,
    windowStart: start,
    windowEnd: end,
  });
  return start;
}

/** The technician's visit: on my way 30 minutes before, arrives and starts. */
export async function arrive(c: Company, id: string, t: Tech, start: number): Promise<void> {
  await c.sim.until(start - 30 * MIN);
  await post(c.w, t.actor, `/api/partner/jobs/${id}/on-my-way`);
  await c.sim.until(start + c.r.int(0, 40) * MIN);
  await post(c.w, t.actor, `/api/partner/jobs/${id}/start`);
}

export async function photo(c: Company, who: Actor, id: string): Promise<string> {
  const { id: photoId } = await upload<{ id: string }>(
    c.w,
    who,
    `/api/requests/${id}/photos`,
    demoPhoto(c.r.pick(PHOTO_COLOURS)),
    'image/png',
  );
  return photoId;
}

const DONE_NOTES = [
  'Replaced the faulty part and tested. All working.',
  'Fixed and cleaned up. Please run it for a day and tell us if anything changes.',
  'Sealed the joint and checked for further leaks. Dry now.',
  'Done. The old part is left in the utility cupboard for your reference.',
] as const;

export async function finish(c: Company, id: string, t: Tech): Promise<void> {
  await c.sim.wait(c.r.int(40, 150) * MIN);
  if (c.r.chance(0.6)) await photo(c, t.actor, id);
  await post(
    c.w,
    t.actor,
    `/api/partner/jobs/${id}/done`,
    c.r.chance(0.7) ? { note: c.r.pick(DONE_NOTES) } : {},
  );
}

const PRAISE = [
  'Quick and tidy, thank you.',
  'Technician was polite and explained everything.',
  'Good job, arrived on time.',
  'Took a while to get a slot but the work is good.',
  'Had to ask twice, but fixed in the end.',
] as const;

/** The resident confirms (or leaves it to the 72-hour auto-close) and usually rates. */
export async function confirmAndRate(
  c: Company,
  x: Party,
  id: string,
  mode: 'confirm' | 'auto',
): Promise<void> {
  if (mode === 'auto') {
    await c.sim.wait(73 * HOUR + 20 * MIN);
    if (c.r.chance(0.3))
      await post(c.w, resident(c, x), `/api/requests/${id}/rating`, { stars: c.r.int(3, 4) });
    return;
  }
  await c.sim.wait(c.r.int(1, 30) * HOUR);
  await post(c.w, resident(c, x), `/api/requests/${id}/confirm`, { done: true });
  if (!c.r.chance(0.75)) return;
  await c.sim.wait(c.r.int(1, 20) * MIN);
  const stars = c.r.pick([5, 5, 5, 4, 4, 4, 3] as const);
  await post(
    c.w,
    resident(c, x),
    `/api/requests/${id}/rating`,
    c.r.chance(0.5) ? { stars, comment: c.r.pick(PRAISE) } : { stars },
  );
}

const RESIDENT_NOTES = [
  'The building security will let you in, please come to the reception first.',
  'I am working from home that day, any time in the window is fine.',
  'Please bring shoe covers, the floors are new.',
  'Is it possible to come a little earlier?',
  'Thank you. The problem got worse this morning.',
] as const;
const TECH_NOTES = [
  'Noted, see you in the window.',
  'Thanks, I will bring the spare part with me.',
  'Understood, I will check with reception on arrival.',
] as const;

/** The Dubai hour of day (with minutes as a fraction) of `t`. */
function dubaiHour(t: number): number {
  return ((t + 4 * HOUR) % DAY) / HOUR;
}

/** `t` if it falls between `from` and `to` o'clock in Dubai, else `from` o'clock on the next such morning. */
export function withinHours(t: number, from: number, to: number): number {
  const h = dubaiHour(t);
  if (h >= from && h < to) return t;
  const midnight = t - h * HOUR;
  return midnight + (h < from ? 0 : DAY) + from * HOUR;
}

/** One message; a request closed meanwhile (409) or out of a tenant's sight after the tenancy ended (404) takes none. */
function say(c: Company, who: Actor, id: string, body: string): Promise<unknown> {
  return call(c.w, who, 'POST', `/api/requests/${id}/messages`, { body }, [201, 404, 409]);
}

/**
 * A short exchange on the request before the visit at `visitStart` (contact details are never written; the API
 * would remove them anyway). People write at plausible times: the resident while awake (08:00-21:00), the
 * technician in working hours (08:00-19:00), both before the technician sets off; on an emergency (`urgent`)
 * within minutes, whatever the hour.
 */
export function chat(
  c: Company,
  id: string,
  resident: Actor,
  staff: Actor | null,
  visitStart: number,
  urgent = false,
): void {
  const now = c.sim.now;
  const awake = (t: number) => dubaiHour(t) >= 8 && dubaiHour(t) < 21;
  // Moved to the next morning: a few minutes past the hour, not on the dot.
  const at = (t: number, from: number, to: number) => {
    const moved = withinHours(t, from, to);
    return moved === t ? t : moved + c.r.int(5, 40) * MIN;
  };
  let asked = urgent ? now + c.r.int(2, 8) * MIN : at(now + c.r.int(10, 120) * MIN, 8, 21);
  if (!urgent && asked > visitStart - HOUR) {
    // No quiet moment before the visit: write now if it is a waking hour, else not at all.
    if (!awake(now)) return;
    asked = now + c.r.int(5, 15) * MIN;
  }
  let answered: number | null = urgent
    ? asked + c.r.int(2, 6) * MIN
    : at(asked + c.r.int(5, 90) * MIN, 8, 19);
  if (!urgent && answered > visitStart - 45 * MIN) {
    answered = asked + c.r.int(3, 10) * MIN;
    if (!awake(answered) || answered > visitStart - 30 * MIN) answered = null;
  }
  const reply = answered;
  c.sim.spawn(asked, async () => {
    await say(c, resident, id, c.r.pick(RESIDENT_NOTES));
    if (staff === null || reply === null) return;
    await c.sim.until(reply);
    await say(c, staff, id, c.r.pick(TECH_NOTES));
  });
}
