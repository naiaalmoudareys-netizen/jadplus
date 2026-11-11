/**
 * Consultations (O4, O5, S4; ADR 0031): leasing, resale and property management by the Harbor teams, mortgage by
 * Crescent Home Finance, Golden Visa by Residency Desk. The owner agrees to share their contact details with the
 * named provider; the office calls, moves the case through its stages, and closes it as done or did not proceed.
 * A property management case that reaches "active" starts a managed unit.
 */
import { dubaiDate } from '@jadplus/shared';
import { get, post } from './actors.js';
import type { Company } from './company.js';
import { SLOTS, type Party } from './jobs.js';
import { DAY, HOUR, addDays } from './sim.js';

export type ConsultService = 'leasing' | 'resale' | 'property-management' | 'mortgage' | 'golden-visa';

const STAGES: Readonly<Record<ConsultService, readonly string[]>> = {
  mortgage: ['pre_approval', 'bank_valuation', 'offer'],
  'golden-visa': ['eligibility', 'documents', 'submitted', 'approved'],
  resale: ['valuation_plan', 'listed', 'offer', 'sold'],
  leasing: ['listed', 'viewings', 'tenant_found', 'contract'],
  'property-management': ['proposal', 'agreement_signed', 'active'],
};

const NOTES: Readonly<Record<string, string>> = {
  contact: 'Spoke with the owner and agreed the next steps.',
  listed: 'Listed on the main portals with the new photos.',
  viewings: 'Three viewings booked for this week.',
  tenant_found: 'Tenant found at the asking rent, cheques agreed.',
  contract: 'Tenancy contract signed and registered.',
  valuation_plan: 'Shared the price range from recent JAD sales.',
  offer: 'Offer received and shared with the owner.',
  sold: 'Transfer completed at the trustee office.',
  pre_approval: 'Pre-approval issued by the bank.',
  bank_valuation: 'Bank valuation booked.',
  eligibility: 'Owner qualifies on the property value.',
  documents: 'All documents received.',
  submitted: 'Application submitted.',
  approved: 'Golden Visa approved.',
  proposal: 'Management proposal sent.',
  agreement_signed: 'Management agreement signed.',
  active: 'Management has started; keys received.',
};

const ANSWERS = (c: Company, s: ConsultService): Record<string, string> => {
  switch (s) {
    case 'leasing':
      return {
        furnished: c.r.pick(['furnished', 'unfurnished', 'not_sure']),
        available_from: addDays(dubaiDate(c.sim.now), c.r.int(10, 60)),
      };
    case 'resale':
      return { timeframe: c.r.pick(['asap', 'within_3_months', 'within_6_months', 'exploring']) };
    case 'property-management':
      return { tenanted: c.r.pick(['yes', 'no']) };
    case 'mortgage':
      return {
        purpose: c.r.pick(['buying', 'refinancing']),
        amount: c.r.pick(['under_1m', '1m_3m', '3m_5m']),
      };
    case 'golden-visa':
      return { applicants: c.r.pick(['me', 'me_and_family']) };
  }
};

/**
 * One consultation. `reach` is how many stages it gets through (beyond the list = closed as done);
 * `dropped` closes it as "did not proceed" after that many stages.
 */
export async function consultation(
  c: Company,
  x: Party,
  service: ConsultService,
  reach: number,
  dropped = false,
): Promise<void> {
  const { provider } = await get<{ provider: { id: string } | null }>(
    c.w,
    x.owner.actor,
    `/api/consultations/provider/${service}`,
  );
  if (provider === null) throw new Error(`No provider for ${service}`);
  const days = await c.sim.preferredDays();
  const { requestId: id } = await post<{ requestId: string }>(c.w, x.owner.actor, '/api/consultations', {
    sfUnitId: x.unitId,
    serviceCode: service,
    answers: ANSWERS(c, service),
    ...(c.r.chance(0.4) ? { note: 'Evenings are best for a call.' } : {}),
    bestDate: days[c.r.int(0, 2)] ?? days[0] ?? '',
    bestSlot: c.r.pick(SLOTS),
    providerId: provider.id,
    consent: true,
    consentVersion: 'consult-2026-11',
  });
  c.requests.push(id);
  const office = [...c.providers.values()].find((p) => p.id === provider.id)?.office;
  if (office === undefined) throw new Error('Unknown provider office');
  if (reach < 0) return;
  await c.sim.wait(c.r.chance(0.85) ? c.r.int(1, 7) * HOUR : c.r.int(26, 40) * HOUR);
  await get(c.w, office, `/api/partner/jobs/${id}/consultation/contact`);
  await post(c.w, office, `/api/partner/jobs/${id}/consultation/contact-made`, { note: NOTES.contact });
  const stages = STAGES[service];
  for (const stage of stages.slice(0, reach)) {
    await c.sim.wait(c.r.int(1, 9) * DAY);
    await post(c.w, office, `/api/partner/jobs/${id}/consultation/stage`, {
      stage,
      note: NOTES[stage] ?? 'Updated.',
    });
  }
  if (dropped) {
    await c.sim.wait(c.r.int(2, 7) * DAY);
    await post(c.w, office, `/api/partner/jobs/${id}/consultation/close`, {
      outcome: 'did_not_proceed',
      note: 'The owner decided to wait until next year.',
    });
  } else if (reach >= stages.length) {
    await c.sim.wait(c.r.int(1, 4) * DAY);
    await post(c.w, office, `/api/partner/jobs/${id}/consultation/close`, {
      outcome: 'done',
      note: 'All done, thank you.',
    });
  } else {
    return;
  }
  await c.sim.wait(c.r.int(4, 60) * HOUR);
  if (c.r.chance(0.6)) await post(c.w, x.owner.actor, `/api/requests/${id}/confirm`, { done: true });
}
