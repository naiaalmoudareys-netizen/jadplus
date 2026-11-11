/**
 * Report services (O3, O6; ADR 0032): snagging (professional by Precision Snagging, soft by the handover team)
 * and valuations by Harbor Real Estate. The inspector visits, lists the snags with photos and uploads the report;
 * the handover team fixes the snags; the owner confirms each fix or reopens it, and asks for a re-inspection.
 */
import { post, upload } from './actors.js';
import { holder, provider, tech, type Company } from './company.js';
import { PHOTO_COLOURS, demoPdf, demoPhoto } from './files.js';
import { SLOTS, book, type Party } from './jobs.js';
import { DAY, HOUR, MIN } from './sim.js';

const SNAGS = [
  ['Scratch on the kitchen worktop', 'Kitchen'],
  ['Grout missing behind the toilet', 'Bathroom'],
  ['Wardrobe door not aligned', 'Bedroom 1'],
  ['Paint splashes on the skirting', 'Living room'],
  ['Balcony drain blocked with debris', 'Balcony'],
  ['Socket cover loose', 'Bedroom 2'],
  ['Silicone gap around the bathtub', 'Bathroom'],
  ['Front door closer too strong', 'Entrance'],
] as const;

async function raise(
  c: Company,
  x: Party,
  serviceCode: 'snagging' | 'valuation',
  snaggingType?: 'soft' | 'professional',
) {
  const days = await c.sim.preferredDays();
  const { requestId } = await post<{ requestId: string }>(c.w, x.owner.actor, '/api/requests', {
    sfUnitId: x.unitId,
    serviceCode,
    description:
      serviceCode === 'valuation'
        ? 'I would like an up-to-date valuation, I am thinking about selling next year.'
        : 'Please inspect the unit before I accept handover.',
    preferredDate: days[c.r.int(0, 3)] ?? days[0] ?? '',
    preferredSlot: c.r.pick(SLOTS),
    ...(snaggingType === undefined ? {} : { snaggingType }),
  });
  c.requests.push(requestId);
  return requestId;
}

const report = (c: Company, who: Parameters<typeof upload>[1], id: string, title: string) =>
  upload(c.w, who, `/api/requests/${id}/report`, demoPdf(title), 'application/pdf');

/** Inspection visit: booked within the 48-hour clock, the inspector starts on the day. */
async function inspect(c: Company, id: string): Promise<void> {
  const p = holder(c, id);
  await c.sim.wait(c.r.int(2, 30) * HOUR);
  const t = tech(p, c.r.int(0, 3));
  const day = new Date(c.sim.now + c.r.int(1, 3) * DAY).toISOString().slice(0, 10);
  const start = await book(c, p, id, t, day, 'morning');
  await c.sim.until(start + c.r.int(5, 30) * MIN);
  await post(c.w, t.actor, `/api/partner/jobs/${id}/start`);
}

export async function snagging(c: Company, x: Party, type: 'soft' | 'professional'): Promise<void> {
  const id = await raise(c, x, 'snagging', type);
  await inspect(c, id);
  const p = holder(c, id);
  const t = tech(p, 0);
  const snags: string[] = [];
  for (const [title, room] of SNAGS.slice(0, c.r.int(3, 7))) {
    const { id: snagId } = await post<{ id: string }>(c.w, t.actor, `/api/requests/${id}/snags`, {
      title,
      room,
    });
    snags.push(snagId);
    if (c.r.chance(0.7)) {
      await upload(
        c.w,
        t.actor,
        `/api/requests/${id}/snags/${snagId}/photo`,
        demoPhoto(c.r.pick(PHOTO_COLOURS)),
        'image/png',
      );
    }
  }
  await c.sim.wait(c.r.int(3, 20) * HOUR);
  await report(c, p.office, id, `${type === 'soft' ? 'Soft' : 'Professional'} snagging report`);
  // The handover team fixes the snags over the next days; the owner checks each fix.
  const fixer = provider(c, 'pm').office;
  for (const snagId of snags) {
    await c.sim.wait(c.r.int(6, 40) * HOUR);
    await upload(
      c.w,
      fixer,
      `/api/requests/${id}/snags/${snagId}/fix`,
      demoPhoto(c.r.pick(PHOTO_COLOURS)),
      'image/png',
    );
  }
  let reopened: string | null = null;
  for (const snagId of snags) {
    await c.sim.wait(c.r.int(1, 12) * HOUR);
    const confirm = reopened !== null || !c.r.chance(0.2);
    await post(c.w, x.owner.actor, `/api/requests/${id}/snags/${snagId}/decision`, { confirm });
    if (!confirm) reopened = snagId;
  }
  if (reopened !== null) {
    await c.sim.wait(c.r.int(12, 48) * HOUR);
    await upload(
      c.w,
      fixer,
      `/api/requests/${id}/snags/${reopened}/fix`,
      demoPhoto(c.r.pick(PHOTO_COLOURS)),
      'image/png',
    );
    await c.sim.wait(c.r.int(2, 20) * HOUR);
    await post(c.w, x.owner.actor, `/api/requests/${id}/snags/${reopened}/decision`, { confirm: true });
  }
  await c.sim.wait(c.r.int(2, 24) * HOUR);
  await post(c.w, x.owner.actor, `/api/requests/${id}/reinspection`);
  await inspect(c, id);
  await c.sim.wait(c.r.int(2, 6) * HOUR);
  await report(c, p.office, id, 'Re-inspection report');
  await c.sim.wait(c.r.int(4, 30) * HOUR);
  await post(c.w, x.owner.actor, `/api/requests/${id}/confirm`, { done: true });
  if (c.r.chance(0.7)) await post(c.w, x.owner.actor, `/api/requests/${id}/rating`, { stars: c.r.int(4, 5) });
}

/** A valuation: the report usually comes within three working days; `late` never comes (overdue now). */
export async function valuation(c: Company, x: Party, late: boolean): Promise<void> {
  const id = await raise(c, x, 'valuation');
  if (late) return;
  const p = holder(c, id);
  await c.sim.wait(c.r.int(20, 70) * HOUR);
  await report(c, p.office, id, 'Valuation report');
  await c.sim.wait(c.r.int(3, 40) * HOUR);
  await post(c.w, x.owner.actor, `/api/requests/${id}/confirm`, { done: true });
  if (c.r.chance(0.6)) await post(c.w, x.owner.actor, `/api/requests/${id}/rating`, { stars: c.r.int(4, 5) });
}
