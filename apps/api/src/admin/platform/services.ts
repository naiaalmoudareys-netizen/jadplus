/**
 * Services and their providers (S1-S4, P6; ADR 0025, 0030).
 * - GET  /api/admin/services                  the 12 services: listed, delivery, flow, routing now, providers,
 *                                             SLA targets and the first deadline of a new request (S4)
 * - POST /api/admin/services/:code/partners   set the primary and backup provider (S3): outside partners for a
 *                                             partner service, JAD Global teams for an in-house one (ADR 0030)
 * - POST /api/admin/services/:code/listed     show or hide a service in the app (S1, S2)
 * Requests already raised keep their provider; the change applies to new requests and escalations.
 */
import {
  changedRanks,
  choosePartner,
  firstResponseTarget,
  providerFits,
  providerKindFor,
  serviceCodeParam,
  serviceListedBody,
  servicePartnersBody,
  serviceRouting,
  serviceSlaTargets,
  type AdminServices,
  type PartnerRank,
  type ProviderKind,
  type ServiceFlow,
  type ServiceGroup,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { newId } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { servicePartners } from '../../requests/store.js';
import { parseJsonBody, parseParams } from '../../validate.js';
import { CHANGERS, READERS, audit } from './common.js';

/** S4: the plan's targets for the other services, shown as text until those services are wired (phase C/D). */
const PLANNED_SLA: Readonly<Record<string, string>> = {
  snagging: 'Booking within 48 h, report within 24 h of the inspection, free re-inspection.',
  leasing: 'Listing within 3 working days.',
  resale: 'Valuation and sales plan within 3 working days.',
  valuation: 'Valuation report within 3 working days.',
  mortgage: 'First call within 1 working day.',
  'golden-visa': 'Eligibility answer within 2 working days.',
  furnishing: 'Quote within 2 working days, delivery date in writing.',
  'interior-design': 'Proposal within 5 working days.',
  education: 'Next course date given on request.',
};

interface ServiceRow {
  code: string;
  name: string;
  grp: ServiceGroup;
  delivery: 'partner' | 'inhouse';
  flow: ServiceFlow;
  listed: number;
}

async function loadService(db: D1Database, code: string): Promise<ServiceRow> {
  const row = await db
    .prepare('SELECT code, name, grp, delivery, flow, listed FROM services WHERE code = ?')
    .bind(code)
    .first<ServiceRow>();
  if (row === null) throw new ApiError(404, 'Not found.');
  return row;
}

/** An active provider of the kind the service takes (ADR 0030), or 422. */
async function requireFittingProvider(db: D1Database, service: ServiceRow, id: string | null): Promise<void> {
  if (id === null) return;
  const row = await db
    .prepare('SELECT status, kind FROM partners WHERE id = ?')
    .bind(id)
    .first<{ status: string; kind: ProviderKind }>();
  if (row?.status !== 'active') throw new ApiError(422, 'Choose an active partner.');
  if (!providerFits(service.delivery, row.kind)) {
    throw new ApiError(
      422,
      service.delivery === 'inhouse'
        ? 'This service is delivered by a JAD Global team: choose one.'
        : 'This service is delivered by an outside partner: choose one.',
    );
  }
}

export function platformServiceRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/services', requireRole(...READERS), async (c) => {
    const db = c.env.DB;
    const { results } = await db
      .prepare('SELECT code, name, grp, delivery, flow, listed FROM services ORDER BY sort_order, name')
      .all<ServiceRow>();
    const services: AdminServices['services'] = [];
    for (const s of results) {
      const { primary, backup } = await servicePartners(db, s.code);
      const fit = <P extends { kind: ProviderKind }>(p: P | null) =>
        p !== null && providerFits(s.delivery, p.kind) ? p : null;
      const takes = choosePartner(fit(primary), fit(backup));
      const first = firstResponseTarget(s.code);
      services.push({
        code: s.code,
        name: s.name,
        group: s.grp,
        delivery: s.delivery,
        flow: s.flow,
        providerKind: providerKindFor(s.delivery),
        listed: s.listed === 1,
        routing: serviceRouting(s.delivery, takes !== null),
        primary,
        backup,
        sla: [...serviceSlaTargets(s.code)],
        plannedSla: PLANNED_SLA[s.code] ?? null,
        firstResponse:
          first === null
            ? null
            : { kind: first.kind, minutes: first.minutes, clock: first.clock, text: first.text },
      });
    }
    return c.json({ services });
  });

  r.post('/services/:code/partners', requireRole(...CHANGERS), async (c) => {
    const { code } = parseParams(c, serviceCodeParam);
    const body = await parseJsonBody(c, servicePartnersBody);
    const db = c.env.DB;
    const now = c.get('now');
    const service = await loadService(db, code);
    await requireFittingProvider(db, service, body.primaryId);
    await requireFittingProvider(db, service, body.backupId);
    const current = await servicePartners(db, code);
    const next: Record<PartnerRank, string | null> = { primary: body.primaryId, backup: body.backupId };
    const ranks = changedRanks(
      { primary: current.primary?.id ?? null, backup: current.backup?.id ?? null },
      next,
    );
    if (ranks.length > 0) {
      // All changed ranks end before any new row starts, so swapping primary and backup never collides with the
      // "one current rank per partner" index. A concurrent change breaks an index and the whole batch rolls back.
      const end = ranks.map((rank) =>
        db
          .prepare(
            'UPDATE service_partners SET ended_at = ? WHERE service_code = ? AND rank = ? AND ended_at IS NULL',
          )
          .bind(now, code, rank),
      );
      const start = ranks.flatMap((rank) => {
        const partnerId = next[rank];
        return partnerId === null
          ? []
          : [
              db
                .prepare(
                  'INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES (?, ?, ?, ?, ?)',
                )
                .bind(newId(), code, partnerId, rank, now),
            ];
      });
      try {
        await db.batch([
          ...end,
          ...start,
          audit(c, 'service_partners_set', 'service', code, { primary: next.primary, backup: next.backup }),
        ]);
      } catch (err) {
        if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
          throw new ApiError(409, 'The partners changed meanwhile. Reload and try again.');
        }
        throw err;
      }
    }
    const after = await servicePartners(db, code);
    return c.json({ code, primary: after.primary, backup: after.backup });
  });

  r.post('/services/:code/listed', requireRole(...CHANGERS), async (c) => {
    const { code } = parseParams(c, serviceCodeParam);
    const { listed } = await parseJsonBody(c, serviceListedBody);
    const db = c.env.DB;
    const service = await loadService(db, code);
    if ((service.listed === 1) !== listed) {
      await db.batch([
        db.prepare('UPDATE services SET listed = ? WHERE code = ?').bind(listed ? 1 : 0, code),
        audit(c, 'service_listed_changed', 'service', code, { listed }),
      ]);
    }
    return c.json({ code, listed });
  });

  return r;
}
