/** Furnishing delivery dates and interior design stages (ADR 0034): S4, O5, L4, C-AZ-2, C-AUD-1. */
import { inboxResponse, requestProjectResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT } from './db.js';
import { rows } from './emergency-world.js';
import { get, managedWorld, post, put, type ManagedWorld } from './managed-world.js';

/** An owner's request with the primary partner, in `status`, with a quote in `quote` state. */
function job(
  w: ManagedWorld,
  id: string,
  service: string,
  quote: 'approved' | 'pending',
  status = 'scheduled',
): void {
  const db = w.h.sqlite;
  db.prepare(
    `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, raised_by_user_id, raised_by_role,
       description, is_emergency, status, partner_id, created_at, updated_at, status_changed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'owner', 'Living room package.', 0, ?, 'p-primary', ?, ?, ?)`,
  ).run(id, `JAD-${id}`, service, SF_UNIT, w.owner, w.owner, status, NOW, NOW, NOW);
  db.prepare(
    `INSERT INTO quotes (id, request_id, partner_id, revision, amount_fils, scope, is_make_safe, status, sent_at,
       expires_at, decided_at, decided_by_user_id)
     VALUES (?, ?, 'p-primary', 1, 500000, 'Sofa, table, chairs.', 0, ?, ?, ?, ?, ?)`,
  ).run(
    `q-${id}`,
    id,
    quote,
    NOW,
    NOW + 14 * 86_400_000,
    quote === 'approved' ? NOW : null,
    quote === 'approved' ? w.owner : null,
  );
}

const project = async (w: ManagedWorld, id: string, token: string) =>
  requestProjectResponse.parse(await (await get(w, `/api/requests/${id}/project`, token)).json());

describe('furnishing delivery date (S4)', () => {
  it('S4: the provider sets the date after the approved quote; moving it needs a reason the owner sees', async () => {
    const w = await managedWorld();
    job(w, 'f1', 'furnishing', 'approved');
    expect((await project(w, 'f1', w.primaryToken)).canSetDelivery).toBe(true);
    const path = '/api/partner/jobs/f1/delivery';
    const first = { date: '2026-11-20', slot: 'morning', reason: null };
    expect((await put(w, path, w.backupToken, first)).status).toBe(404);
    expect((await put(w, path, w.ownerToken, first)).status).toBe(403);
    expect((await put(w, path, w.primaryToken, { ...first, date: '2026-11-01' })).status).toBe(400);
    expect((await put(w, path, w.primaryToken, first)).status).toBe(200);
    expect((await put(w, path, w.primaryToken, { ...first, date: '2026-11-21' })).status).toBe(400);
    const moved = await put(w, path, w.primaryOffice, {
      date: '2026-11-21',
      slot: 'afternoon',
      reason: 'Supplier delay, call me on +971 50 000 0000.',
    });
    expect(moved.status).toBe(200);
    const seen = await project(w, 'f1', w.ownerToken);
    expect(seen.delivery).toMatchObject({ date: '2026-11-21', slot: 'afternoon', moves: 1 });
    expect(seen.delivery?.reason).not.toContain('000 0000');
    expect(seen.canSetDelivery).toBe(false);
    const kinds = inboxResponse
      .parse(await (await get(w, '/api/me/inbox', w.ownerToken)).json())
      .items.map((i) => i.kind);
    expect(kinds.filter((k) => k === 'delivery_scheduled')).toHaveLength(2);
    expect(rows(w, "SELECT action FROM audit_log WHERE target_id = 'f1' ORDER BY seq")).toEqual([
      { action: 'delivery_date_set' },
      { action: 'delivery_date_moved' },
    ]);
  });

  it('L4: no delivery date before the owner approves the quote, nor on another service', async () => {
    const w = await managedWorld();
    job(w, 'f2', 'furnishing', 'pending', 'quote_sent');
    job(w, 'm1', 'maintenance', 'approved');
    const body = { date: '2026-11-20', slot: 'morning', reason: null };
    expect((await put(w, '/api/partner/jobs/f2/delivery', w.primaryToken, body)).status).toBe(409);
    expect((await put(w, '/api/partner/jobs/m1/delivery', w.primaryToken, body)).status).toBe(409);
    expect((await project(w, 'm1', w.ownerToken)).delivery).toBeNull();
    expect((await get(w, '/api/requests/f2/project', w.tenantToken)).status).toBe(403);
  });
});

describe('interior design stages (O5)', () => {
  it('O5: the office moves stages forward (skipping allowed) with a note; the owner sees the timeline', async () => {
    const w = await managedWorld();
    job(w, 'd1', 'interior-design', 'approved', 'in_progress');
    const path = '/api/partner/jobs/d1/project-stage';
    expect((await post(w, path, w.primaryToken, { stage: 'concept', note: null })).status).toBe(403);
    expect((await post(w, path, w.harbor, { stage: 'concept', note: null })).status).toBe(404);
    expect((await project(w, 'd1', w.ownerToken)).stages).toEqual([]);
    expect(
      (await post(w, path, w.primaryOffice, { stage: 'concept', note: 'Mood board shared.' })).status,
    ).toBe(200);
    expect((await post(w, path, w.primaryOffice, { stage: 'fit_out', note: null })).status).toBe(200);
    expect((await post(w, path, w.primaryOffice, { stage: 'concept', note: null })).status).toBe(400);
    const seen = await project(w, 'd1', w.ownerToken);
    expect(seen.stages.map((s) => [s.stage, s.at !== null, s.note])).toEqual([
      ['concept', true, 'Mood board shared.'],
      ['design_approved', false, null],
      ['fit_out', true, null],
      ['handover', false, null],
    ]);
    expect(seen.canMoveStage).toBe(false);
    expect((await project(w, 'd1', w.primaryOffice)).nextStages).toEqual(['handover']);
    const kinds = inboxResponse
      .parse(await (await get(w, '/api/me/inbox', w.ownerToken)).json())
      .items.map((i) => i.kind);
    expect(kinds).toContain('stage_reached');
    expect(rows(w, "SELECT count(*) AS n FROM audit_log WHERE action = 'project_stage_moved'")).toEqual([
      { n: 2 },
    ]);
  });

  it('O5: no stages before the quote is approved', async () => {
    const w = await managedWorld();
    job(w, 'd2', 'interior-design', 'pending', 'quote_sent');
    const res = await post(w, '/api/partner/jobs/d2/project-stage', w.primaryOffice, {
      stage: 'concept',
      note: null,
    });
    expect(res.status).toBe(409);
  });
});
