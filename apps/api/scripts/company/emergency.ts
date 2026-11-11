/**
 * Emergencies (E1-E8, E12; ADR 0017): a water leak, or an AC failure in the hot months (May-October only). The
 * primary partner's technician acknowledges within minutes, comes, may make it safe within the owner's limit,
 * and finishes. Some are not acknowledged in time: the escalation sweep moves them to the backup partner, and
 * further to JAD+ on-call. One is reclassified by JAD+ as routine.
 */
import { dubaiDate } from '@jadplus/shared';
import { post } from './actors.js';
import { holder, tech, type Company } from './company.js';
import { chat, confirmAndRate, finish, photo, type Party } from './jobs.js';
import { HOUR, MIN } from './sim.js';

export type EmergencyVariant = 'normal' | 'backup' | 'on_call' | 'open_now' | 'reclassified';

const LEAKS = [
  'Water is coming through the kitchen ceiling.',
  'Pipe under the bathroom sink burst, water on the floor.',
  'Water leaking from the AC unit onto the bedroom floor.',
  'Water heater is leaking heavily in the utility cupboard.',
] as const;
const AC = ['AC stopped completely, the flat is very hot.', 'AC blowing hot air in every room.'] as const;

function acSeason(now: number): boolean {
  const month = Number(dubaiDate(now).slice(5, 7));
  return month >= 5 && month <= 10;
}

export async function emergency(
  c: Company,
  x: Party,
  v: EmergencyVariant,
  building = c.r.chance(0.15),
): Promise<void> {
  const ac = acSeason(c.sim.now) && c.r.chance(0.4);
  const { requestId: id } = await post<{ requestId: string }>(c.w, x.raiser, '/api/emergencies', {
    ...(x.tenancyId === null ? { sfUnitId: x.unitId } : { tenancyId: x.tenancyId }),
    type: ac ? 'ac_failure' : 'water_leak',
    faultSource: building ? 'building' : 'unit',
    description: ac ? c.r.pick(AC) : c.r.pick(LEAKS),
  });
  c.requests.push(id);
  const raisedAt = c.sim.now;
  if (c.r.chance(0.4)) await photo(c, x.raiser, id);
  if (v === 'open_now') return;
  if (v === 'reclassified') {
    await c.sim.wait(8 * MIN);
    await post(c.w, c.admin, `/api/admin/requests/${id}/reclassify`, {
      reason: 'Spoke to the resident: a slow drip into a bucket, no damage. Handled as a routine repair.',
    });
    const p = holder(c, id);
    await c.sim.wait(2 * HOUR);
    const t = tech(p, c.r.int(0, 9));
    const day = new Date(c.sim.now + 26 * HOUR).toISOString().slice(0, 10);
    await post(c.w, p.office, `/api/partner/jobs/${id}/visit`, {
      technicianId: t.id,
      windowStart: Date.parse(`${day}T06:00:00Z`),
      windowEnd: Date.parse(`${day}T08:00:00Z`),
    });
    await c.sim.until(Date.parse(`${day}T06:20:00Z`));
    await post(c.w, t.actor, `/api/partner/jobs/${id}/start`);
    await finish(c, id, t);
    await confirmAndRate(c, x, id, 'confirm');
    return;
  }
  if (v === 'on_call') {
    // Neither partner answers: moved to the backup at 30 minutes, to JAD+ on-call 15 minutes later.
    await c.sim.until(raisedAt + 50 * MIN);
    await post(c.w, c.admin, `/api/admin/requests/${id}/notes`, {
      text: 'On-call: called the resident, water is off at the main valve. Chasing the backup partner now.',
      ownerCalled: true,
    });
    await c.sim.until(raisedAt + 62 * MIN);
  } else {
    await c.sim.until(raisedAt + (v === 'backup' ? 36 : c.r.int(3, 13)) * MIN);
  }
  const p = holder(c, id);
  const t = tech(p, c.r.int(0, 9));
  const arrival = c.sim.now + c.r.int(20, 45) * MIN;
  await post(c.w, t.actor, `/api/partner/jobs/${id}/acknowledge`, {
    technicianId: t.id,
    arrivalWindowStart: arrival,
    arrivalWindowEnd: arrival + HOUR,
  });
  chat(c, id, x.raiser, t.actor);
  await c.sim.until(arrival + c.r.int(5, 40) * MIN);
  await post(c.w, t.actor, `/api/partner/jobs/${id}/start`);
  if (x.owner.makeSafe && !ac && c.r.chance(0.6)) {
    await c.sim.wait(30 * MIN);
    await post(c.w, t.actor, `/api/partner/jobs/${id}/make-safe`, {
      amountAed: c.r.pick([250, 300, 450]),
      scope: 'Isolated the water supply, replaced the burst flexible hose and dried the area.',
    });
  }
  await finish(c, id, t);
  await confirmAndRate(c, x, id, c.r.chance(0.8) ? 'confirm' : 'auto');
}
