/**
 * Routine maintenance requests (ADR 0012, 0018, 0019, 0021): an owner or tenant asks for a repair; a tenant's
 * request waits for the owner (or the property manager on a managed unit, A1); the partner office books a visit;
 * the technician comes, sometimes quotes, sometimes finds nobody home; the owner decides on money; the resident
 * confirms, reopens or leaves it to the auto-close, and rates. JAD+ Admin steps in on a few.
 */
import { post } from './actors.js';
import { holder, provider, tech, type Company } from './company.js';
import { invoiceStory } from './invoices.js';
import { SLOTS, arrive, book, chat, confirmAndRate, finish, photo, resident, type Party } from './jobs.js';
import { DAY, HOUR, MIN, addDays } from './sim.js';

export const ROUTINE_VARIANTS = [
  'simple',
  'simple',
  'simple',
  'auto',
  'quote',
  'quote',
  'quote_revised',
  'quote_declined',
  'quote_expired',
  'no_access',
  'reopened',
  'cancelled',
  'arranged',
  'moved',
  'jad_cancelled',
] as const;
export type RoutineVariant = (typeof ROUTINE_VARIANTS)[number] | 'declined_by_owner' | 'waiting_owner';

const ISSUES = [
  'Kitchen tap is dripping all the time.',
  'Bathroom extractor fan makes a loud noise.',
  'Bedroom AC is not cooling well.',
  'Water heater takes very long to heat up.',
  'Two ceiling lights in the living room stopped working.',
  'Balcony door does not lock properly.',
  'Toilet keeps running after flushing.',
  'Washing machine drain is slow and smells.',
  'Kitchen cabinet door hinge is broken.',
  'Small crack and damp patch on the bathroom ceiling.',
  'Power socket in the bedroom sparks when used.',
  'AC thermostat display is blank.',
] as const;

const SCOPES = [
  ['Replace the mixer tap and both flexible hoses.', 380],
  ['Replace the AC fan motor and re-gas the unit.', 1450],
  ['Replace the 80-litre water heater element and thermostat.', 650],
  ['Re-seal the shower tray and replace the silicone.', 420],
  ['Replace the balcony door lock cylinder and adjust the frame.', 560],
  ['Rewire and replace the damaged socket and back box.', 300],
] as const;

async function owner(c: Company, x: Party, id: string, decision: 'approve' | 'decline'): Promise<void> {
  const managedId = x.owner.managed.get(x.unitId);
  const path =
    managedId === undefined
      ? `/api/requests/${id}/approval`
      : `/api/partner/managed-units/${managedId}/requests/${id}/approval`;
  await post(c.w, managedId === undefined ? x.owner.actor : provider(c, 'pm').office, path, { decision });
}

async function quoteDecision(
  c: Company,
  x: Party,
  id: string,
  decision: 'approve' | 'decline',
): Promise<void> {
  const row = c.w.db
    .prepare(
      "SELECT id FROM quotes WHERE request_id = ? AND status = 'pending' ORDER BY revision DESC LIMIT 1",
    )
    .get(id) as { id: string } | undefined;
  if (row === undefined) throw new Error('No pending quote');
  await c.sim.wait(c.r.int(2, 40) * HOUR);
  await post(c.w, x.owner.actor, `/api/requests/${id}/quote-decision`, { quoteId: row.id, decision });
}

/** Quote after the first look; returns false when the job ends with the quote (declined twice or expired). */
async function quoted(c: Company, x: Party, id: string, v: RoutineVariant): Promise<boolean> {
  const p = holder(c, id);
  const [scope, price] = c.r.pick(SCOPES);
  await c.sim.wait(c.r.int(20, 60) * MIN);
  await post(c.w, p.office, `/api/partner/jobs/${id}/quote`, { amountAed: price, scope });
  if (v === 'quote_expired') return false;
  if (v === 'quote_revised' || v === 'quote_declined') {
    await quoteDecision(c, x, id, 'decline');
    await c.sim.wait(c.r.int(2, 20) * HOUR);
    await post(c.w, p.office, `/api/partner/jobs/${id}/quote`, {
      amountAed: Math.round(price * 0.85),
      scope: `${scope} Revised: our own spare part, labour discounted.`,
    });
    if (v === 'quote_declined') {
      await quoteDecision(c, x, id, 'decline');
      return false;
    }
  }
  await quoteDecision(c, x, id, 'approve');
  return true;
}

export async function routine(c: Company, x: Party, v: RoutineVariant): Promise<void> {
  const days = await c.sim.preferredDays();
  const date = days[c.r.int(0, 2)] ?? days[0] ?? '';
  const slot = c.r.pick(SLOTS);
  const { requestId: id, awaitingOwner } = await post<{ requestId: string; awaitingOwner: boolean }>(
    c.w,
    x.raiser,
    '/api/requests',
    {
      ...(x.tenancyId === null ? { sfUnitId: x.unitId } : { tenancyId: x.tenancyId }),
      serviceCode: 'maintenance',
      description: c.r.pick(ISSUES),
      preferredDate: date,
      preferredSlot: slot,
    },
  );
  c.requests.push(id);
  if (c.r.chance(0.5)) await photo(c, x.raiser, id);
  if (awaitingOwner) {
    if (v === 'waiting_owner') return;
    await c.sim.wait(c.r.int(1, 20) * HOUR);
    if (v === 'cancelled') {
      // A tenant can withdraw a request only until it is approved.
      await post(c.w, x.raiser, `/api/requests/${id}/close`, { reason: 'cancel' });
      return;
    }
    await owner(c, x, id, v === 'declined_by_owner' ? 'decline' : 'approve');
    if (v === 'declined_by_owner') return;
  }
  if (v === 'cancelled' || v === 'arranged' || v === 'jad_cancelled') {
    await c.sim.wait(c.r.int(1, 6) * HOUR);
    if (v === 'jad_cancelled') {
      await post(c.w, c.admin, `/api/admin/requests/${id}/cancel`, {
        reason: 'Raised twice for the same fault; the other request is being handled.',
      });
    } else {
      const who = v === 'arranged' ? x.owner.actor : resident(c, x);
      await post(c.w, who, `/api/requests/${id}/close`, {
        reason: v === 'arranged' ? 'arranged_myself' : 'cancel',
      });
    }
    return;
  }
  if (v === 'moved') {
    await c.sim.wait(c.r.int(1, 3) * HOUR);
    await post(c.w, c.admin, `/api/admin/requests/${id}/reassign`, {
      partnerId: provider(c, 'gulf').id,
      reason: 'Demo Fixers has no AC technician free this week; moved to the backup partner.',
    });
  }
  const p = holder(c, id);
  // Most offices answer well inside the 4 working hours; a few are late.
  await c.sim.wait(c.r.chance(0.85) ? c.r.int(20, 180) * MIN : c.r.int(6, 26) * HOUR);
  const t = tech(p, c.r.int(0, 9));
  let start = await book(c, p, id, t, date, slot);
  if (c.r.chance(0.5)) chat(c, id, x.raiser, t.actor);
  if (v === 'no_access') {
    await c.sim.until(start + 25 * MIN);
    const photoId = await photo(c, t.actor, id);
    await post(c.w, t.actor, `/api/partner/jobs/${id}/no-access`, { photoId });
    await c.sim.wait(c.r.int(1, 4) * HOUR);
    start = await book(c, p, id, t, addDays(date, 1), slot);
  }
  await arrive(c, id, t, start);
  if (v.startsWith('quote')) {
    if (!(await quoted(c, x, id, v))) return;
    await c.sim.wait(c.r.int(1, 6) * HOUR);
    const later = new Date(c.sim.now + c.r.int(1, 4) * DAY).toISOString().slice(0, 10);
    start = await book(c, p, id, t, later, c.r.pick(SLOTS));
    await arrive(c, id, t, start);
  }
  await finish(c, id, t);
  if (v.startsWith('quote')) c.sim.spawn(c.sim.now + c.r.int(2, 30) * HOUR, () => invoiceStory(c, x, id, p));
  if (v === 'reopened') {
    await c.sim.wait(c.r.int(5, 30) * HOUR);
    await post(c.w, resident(c, x), `/api/requests/${id}/confirm`, { done: false });
    await post(c.w, resident(c, x), `/api/requests/${id}/messages`, {
      body: 'Still leaking a little after one day, sorry.',
    });
    await c.sim.wait(c.r.int(2, 8) * HOUR);
    const again = new Date(c.sim.now + DAY).toISOString().slice(0, 10);
    start = await book(c, p, id, t, again, c.r.pick(SLOTS));
    await arrive(c, id, t, start);
    await finish(c, id, t);
  }
  await confirmAndRate(c, x, id, v === 'auto' ? 'auto' : 'confirm');
}
