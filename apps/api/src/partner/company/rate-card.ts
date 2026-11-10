/**
 * Rate card (ADR 0025; S9, P1), partner_admin, own company only:
 *
 * - GET  /api/partner/rate-card          the card in force, accepted cards still to start, and change requests
 * - POST /api/partner/rate-card/changes  propose a new card {items, effectiveFrom}: at least 60 days ahead, no
 *                                        raise while the current card's 12 months run, one request at a time
 *
 * JAD+ Admin checks the request against market quotes and records who approved it in writing
 * (apps/api/src/admin/partner-extras.ts). An accepted card is in force from its date for 12 months.
 */
import {
  aedToFils,
  dubaiDate,
  raisesPrices,
  rateCardChangeBody,
  rateCardValidUntil,
  rateChangeProblem,
  type RATE_UNITS,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { decryptField, newId, toBytes, type Keys } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { parseJsonBody } from '../../validate.js';
import { audit, companyOf } from './common.js';

type Unit = (typeof RATE_UNITS)[number];

export interface RateCardItem {
  readonly serviceCode: string;
  readonly item: string;
  readonly unit: Unit;
  readonly priceFils: number;
}

export interface RateCard {
  readonly changeId: string;
  readonly effectiveFrom: string;
  readonly validUntil: string;
  readonly items: RateCardItem[];
}

/** Encryption contexts of the free text JAD+ Admin writes on a change (C-PD-2). */
export const rateReasonContext = (id: string): string => `rate_card_changes.reason:${id}`;
export const rateApproverContext = (id: string): string => `rate_card_changes.approved_by:${id}`;

export async function cardItems(db: D1Database, changeId: string): Promise<RateCardItem[]> {
  const { results } = await db
    .prepare(
      'SELECT service_code, item, unit, price_fils FROM rate_card_items WHERE change_id = ? ORDER BY line',
    )
    .bind(changeId)
    .all<{ service_code: string; item: string; unit: Unit; price_fils: number }>();
  return results.map((i) => ({
    serviceCode: i.service_code,
    item: i.item,
    unit: i.unit,
    priceFils: i.price_fils,
  }));
}

/** The partner's accepted cards: the one in force today (null when none) and those still to start. */
export async function acceptedCards(
  db: D1Database,
  partnerId: string,
  today: string,
): Promise<{ readonly current: RateCard | null; readonly upcoming: RateCard[] }> {
  const { results } = await db
    .prepare(
      `SELECT id, effective_from, valid_until FROM rate_card_changes WHERE partner_id = ? AND status = 'accepted'
       ORDER BY effective_from DESC, decided_at DESC`,
    )
    .bind(partnerId)
    .all<{ id: string; effective_from: string; valid_until: string }>();
  const load = async (r: (typeof results)[number]): Promise<RateCard> => ({
    changeId: r.id,
    effectiveFrom: r.effective_from,
    validUntil: r.valid_until,
    items: await cardItems(db, r.id),
  });
  const started = results.find((r) => r.effective_from <= today);
  const current = started !== undefined && started.valid_until >= today ? await load(started) : null;
  const upcoming = await Promise.all(
    results
      .filter((r) => r.effective_from > today)
      .reverse()
      .map(load),
  );
  return { current, upcoming };
}

/** The reason JAD+ gave, decrypted, or null. */
export async function rateReason(keys: Keys, id: string, enc: unknown): Promise<string | null> {
  return enc === null ? null : decryptField(keys, toBytes(enc), rateReasonContext(id));
}

export function registerRateCard(r: Hono<AppEnv>): void {
  const office = requireRole('partner_admin');

  r.get('/rate-card', office, async (c) => {
    const partnerId = companyOf(c);
    const db = c.env.DB;
    const { current, upcoming } = await acceptedCards(db, partnerId, dubaiDate(c.get('now')));
    const { results } = await db
      .prepare(
        `SELECT ch.id, ch.status, ch.effective_from, ch.proposed_at, ch.decided_at, ch.reason_enc,
           (SELECT count(*) FROM rate_card_items i WHERE i.change_id = ch.id) AS items
         FROM rate_card_changes ch WHERE ch.partner_id = ? ORDER BY ch.proposed_at DESC LIMIT 50`,
      )
      .bind(partnerId)
      .all<{
        id: string;
        status: 'pending' | 'accepted' | 'rejected';
        effective_from: string;
        proposed_at: number;
        decided_at: number | null;
        reason_enc: unknown;
        items: number;
      }>();
    const keys = c.get('keys');
    const changes = await Promise.all(
      results.map(async (ch) => ({
        id: ch.id,
        status: ch.status,
        effectiveFrom: ch.effective_from,
        proposedAt: ch.proposed_at,
        decidedAt: ch.decided_at,
        reason: await rateReason(keys, ch.id, ch.reason_enc),
        items: ch.items,
      })),
    );
    return c.json({ current, upcoming, changes });
  });

  r.post('/rate-card/changes', office, async (c) => {
    const body = await parseJsonBody(c, rateCardChangeBody);
    const partnerId = companyOf(c);
    const db = c.env.DB;
    const now = c.get('now');
    const today = dubaiDate(now);
    const items = body.items.map((i) => ({
      serviceCode: i.serviceCode,
      item: i.item,
      unit: i.unit,
      priceFils: aedToFils(i.priceAed),
    }));
    const { current } = await acceptedCards(db, partnerId, today);
    const problem = rateChangeProblem(
      body.effectiveFrom,
      today,
      raisesPrices(items, current?.items ?? []),
      current?.validUntil ?? null,
    );
    if (problem !== null) throw new ApiError(409, problem);
    const waiting = await db
      .prepare("SELECT id FROM rate_card_changes WHERE partner_id = ? AND status = 'pending'")
      .bind(partnerId)
      .first<{ id: string }>();
    if (waiting !== null) throw new ApiError(409, 'A rate card change is already waiting for JAD+.');
    const id = newId();
    const validUntil = rateCardValidUntil(body.effectiveFrom);
    await db.batch([
      db
        .prepare(
          `INSERT INTO rate_card_changes (id, partner_id, effective_from, valid_until, proposed_by, proposed_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, partnerId, body.effectiveFrom, validUntil, c.get('auth').userId, now),
      ...items.map((i, n) =>
        db
          .prepare(
            'INSERT INTO rate_card_items (change_id, line, service_code, item, unit, price_fils) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .bind(id, n + 1, i.serviceCode, i.item, i.unit, i.priceFils),
      ),
      audit(c, 'rate_card_change_proposed', 'rate_card_change', id, {
        items: items.length,
        effectiveFrom: body.effectiveFrom,
      }),
    ]);
    return c.json({ id, status: 'pending', effectiveFrom: body.effectiveFrom, validUntil }, 201);
  });
}
