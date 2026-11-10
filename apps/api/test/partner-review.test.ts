/** Daily partner check and admin review list: S6, S7, P3, C-AUD-1, C-AZ-1. */
import { describe, expect, it } from 'vitest';
import { runPartnerReview } from '../src/jobs/partner-review.js';
import { createLogger } from '../src/logger.js';
import { NOW, requestRow } from './db.js';
import { leak, raise, rows, world, type World } from './emergency-world.js';

const quiet = createLogger({}, () => undefined);
const DAY = 86_400_000;
let docs = 0;

/** Files a trade licence and insurance for a partner (expiry dates YYYY-MM-DD). */
function file(w: World, partnerId: string, licence: string, insurance: string): void {
  const add = w.h.sqlite.prepare(
    `INSERT INTO partner_documents (id, partner_id, kind, r2_key, expires_on, uploaded_at, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const [kind, expires] of [
    ['trade_licence', licence],
    ['insurance', insurance],
  ] as const) {
    docs += 1;
    add.run(`doc-${docs}`, partnerId, kind, `partners/${partnerId}/${docs}.pdf`, expires, NOW, w.owner);
  }
}

/** Both partners in good standing (documents valid for a year). */
async function goodWorld(): Promise<World> {
  const w = await world();
  file(w, 'p-primary', '2027-11-01', '2027-11-01');
  file(w, 'p-backup', '2027-11-01', '2027-11-01');
  return w;
}

const run = (w: World, at = w.h.clock) => runPartnerReview(w.h.env.DB, at, quiet);

describe('documents (S7, P3)', () => {
  it('S7: partners with valid documents are left alone', async () => {
    const w = await goodWorld();
    expect(await run(w)).toMatchObject({ partners: 2, suspended: 0, itemsOpened: 0 });
  });

  it('P3: a licence or insurance expiring within 30 days goes on the review list once', async () => {
    const w = await goodWorld();
    file(w, 'p-primary', '2027-11-01', '2026-12-01');
    // An older insurance does not count once a newer one is on file; here the newest expires soon.
    w.h.sqlite
      .prepare(
        "DELETE FROM partner_documents WHERE partner_id = 'p-primary' AND expires_on = '2027-11-01' AND kind = 'insurance'",
      )
      .run();
    await run(w);
    await run(w);
    expect(rows(w, 'SELECT partner_id, kind, dedupe_key FROM partner_review_items')).toEqual([
      {
        partner_id: 'p-primary',
        kind: 'document_expiring',
        dedupe_key: 'document_expiring:insurance:2026-12-01',
      },
    ]);
    expect(rows(w, "SELECT status FROM partners WHERE id = 'p-primary'")).toEqual([{ status: 'active' }]);
  });

  it('S7: a lapsed insurance suspends the partner, and their waiting emergency moves to the backup', async () => {
    const w = await world();
    file(w, 'p-primary', '2027-11-01', '2026-11-08');
    file(w, 'p-backup', '2027-11-01', '2027-11-01');
    await raise(w, leak);
    expect(await run(w)).toMatchObject({ suspended: 1, jobsMoved: 1 });
    expect(
      rows(w, "SELECT status, status_reason, suspended_by FROM partners WHERE id = 'p-primary'"),
    ).toEqual([{ status: 'suspended', status_reason: 'Insurance lapsed', suspended_by: 'compliance' }]);
    expect(rows(w, 'SELECT partner_id, escalation, acknowledged_at FROM requests')).toEqual([
      { partner_id: 'p-backup', escalation: 'moved_to_backup', acknowledged_at: null },
    ]);
    expect(
      rows(
        w,
        "SELECT recipient_partner_id FROM notifications WHERE template = 'emergency_new_job' ORDER BY created_at",
      ),
    ).toEqual([{ recipient_partner_id: 'p-primary' }, { recipient_partner_id: 'p-backup' }]);
    expect(
      rows(
        w,
        "SELECT action FROM audit_log WHERE actor_role = 'system' AND action <> 'owner_linked' ORDER BY seq",
      ),
    ).toEqual([{ action: 'partner_suspended' }, { action: 'partner_flagged' }, { action: 'job_reassigned' }]);
  });

  it('S7: a partner with no licence or insurance on file is suspended', async () => {
    const w = await world();
    file(w, 'p-backup', '2027-11-01', '2027-11-01');
    await run(w);
    expect(rows(w, "SELECT status_reason FROM partners WHERE id = 'p-primary'")).toEqual([
      { status_reason: 'Trade licence not on file; Insurance not on file' },
    ]);
  });

  it('S7: once renewed, a partner suspended by the check is reinstated; an admin suspension is not lifted', async () => {
    const w = await world();
    file(w, 'p-primary', '2027-11-01', '2026-11-08');
    file(w, 'p-backup', '2027-11-01', '2027-11-01');
    await run(w);
    file(w, 'p-primary', '2027-11-01', '2027-11-08');
    w.h.sqlite
      .prepare(
        "UPDATE partners SET status = 'suspended', status_reason = 'Under review', suspended_by = 'admin' WHERE id = 'p-backup'",
      )
      .run();
    expect(await run(w)).toMatchObject({ reinstated: 1 });
    expect(rows(w, 'SELECT id, status, suspended_by FROM partners ORDER BY id')).toEqual([
      { id: 'p-backup', status: 'suspended', suspended_by: 'admin' },
      { id: 'p-primary', status: 'active', suspended_by: null },
    ]);
  });

  it('S7: jobs already under way are not moved automatically; they go on the review list for an admin', async () => {
    const w = await world();
    file(w, 'p-primary', '2027-11-01', '2026-11-08');
    file(w, 'p-backup', '2027-11-01', '2027-11-01');
    w.h.sqlite
      .prepare(
        `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, tenancy_id, raised_by_user_id,
           raised_by_role, description, is_emergency, status, partner_id, created_at, updated_at, status_changed_at)
         VALUES ('req-busy', 'JAD-BUSY01', 'maintenance', ?, ?, 'ten-1', ?, 'tenant', 'Tap.', 0, 'scheduled', 'p-primary', ?, ?, ?)`,
      )
      .run(requestRow().sf_unit_id as string, w.owner, w.tenant, NOW, NOW, NOW);
    await run(w);
    expect(rows(w, "SELECT kind, detail FROM partner_review_items WHERE kind = 'open_jobs'")).toEqual([
      { kind: 'open_jobs', detail: '{"jobs":1}' },
    ]);
    expect(rows(w, "SELECT partner_id FROM requests WHERE id = 'req-busy'")).toEqual([
      { partner_id: 'p-primary' },
    ]);
  });
});

describe('scorecard flags (S6)', () => {
  function rated(w: World, n: number, stars: number, at: number): void {
    for (let i = 0; i < n; i += 1) {
      const id = `req-r${stars}-${i}`;
      w.h.sqlite
        .prepare(
          `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, tenancy_id, raised_by_user_id,
             raised_by_role, description, is_emergency, status, close_reason, partner_id, created_at, updated_at, status_changed_at)
           VALUES (?, ?, 'maintenance', 'a0X000000000001AAA', ?, 'ten-1', ?, 'tenant', 'Tap.', 0, 'closed', 'confirmed', 'p-backup', ?, ?, ?)`,
        )
        .run(id, `JAD-R${stars}${String(i).padStart(3, '0')}`, w.owner, w.tenant, NOW, NOW, NOW);
      w.h.sqlite
        .prepare(
          'INSERT INTO ratings (request_id, partner_id, stars, rated_by_user_id, at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(id, 'p-backup', stars, w.tenant, at);
    }
  }

  it('S6: an average below 4.0 over the last 30 days flags the partner for review', async () => {
    const w = await goodWorld();
    rated(w, 2, 3, NOW - 2 * DAY);
    rated(w, 1, 5, NOW - 40 * DAY); // outside the window
    await run(w);
    expect(rows(w, 'SELECT partner_id, kind, detail FROM partner_review_items')).toEqual([
      { partner_id: 'p-backup', kind: 'low_rating', detail: '{"average":3,"ratings":2}' },
    ]);
  });

  it('S6: two missed emergencies in 90 days flag the partner; a safety breach flags at once', async () => {
    const w = await goodWorld();
    await raise(w, leak);
    await raise(w, leak);
    const ids = rows(w, 'SELECT id FROM requests') as { id: string }[];
    ids.forEach(({ id }, i) => {
      w.h.sqlite
        .prepare(
          `INSERT INTO sla_outcomes (id, request_id, partner_id, metric, due_at, outcome, recorded_at)
           VALUES (?, ?, 'p-primary', 'emergency_ack', ?, 'missed', ?)`,
        )
        .run(`o-${i}`, id, NOW, NOW - i * DAY);
    });
    w.h.sqlite
      .prepare(
        `INSERT INTO partner_incidents (id, partner_id, kind, note, at) VALUES ('inc-1', 'p-backup', 'safety_breach', 'No safety gear.', ?)`,
      )
      .run(NOW);
    await run(w);
    expect(rows(w, 'SELECT partner_id, kind FROM partner_review_items ORDER BY partner_id')).toEqual([
      { partner_id: 'p-backup', kind: 'safety_breach' },
      { partner_id: 'p-primary', kind: 'missed_emergencies' },
    ]);
  });
});

describe('admin review list (S6, C-AZ-1, C-AUD-1)', () => {
  async function flagged() {
    const w = await world();
    file(w, 'p-backup', '2027-11-01', '2027-11-01');
    await run(w); // primary has no documents: suspended + review item
    const admin = await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
    await w.h.addUser({ email: 'viewer@example.com', roles: ['jad_viewer'] });
    return {
      w,
      admin,
      adminToken: await w.h.signIn('demo@jadplus.ae', 'console'),
      viewerToken: await w.h.signIn('viewer@example.com', 'console'),
    };
  }

  it('S6: JAD+ staff see the open items with the partner; partners and owners cannot', async () => {
    const { w, viewerToken } = await flagged();
    const res = await w.h.request('/api/admin/partner-review', { token: viewerToken });
    expect(res.status).toBe(200);
    const body = await res.json<{ items: { kind: string; partner: { id: string; status: string } }[] }>();
    expect(body.items).toEqual([
      expect.objectContaining({
        kind: 'suspended',
        partner: { id: 'p-primary', name: 'Primary Fixers LLC', status: 'suspended' },
      }),
    ]);
    expect((await w.h.request('/api/admin/partner-review', { token: w.primaryToken })).status).toBe(403);
    expect((await w.h.request('/api/admin/partner-review', { token: w.ownerToken })).status).toBe(403);
    expect((await w.h.request('/api/admin/partner-review?status=maybe', { token: viewerToken })).status).toBe(
      400,
    );
  });

  it('C-AUD-1: only an admin resolves an item, with a note, once; it is audited', async () => {
    const { w, admin, adminToken, viewerToken } = await flagged();
    const [item] = rows(w, 'SELECT id FROM partner_review_items') as { id: string }[];
    const path = `/api/admin/partner-review/${item?.id ?? ''}/resolve`;
    const json = { note: 'Called the partner; insurance renewal on its way.' };
    expect((await w.h.request(path, { method: 'POST', token: viewerToken, json })).status).toBe(403);
    expect((await w.h.request(path, { method: 'POST', token: adminToken, json: {} })).status).toBe(400);
    expect((await w.h.request(path, { method: 'POST', token: adminToken, json })).status).toBe(200);
    expect((await w.h.request(path, { method: 'POST', token: adminToken, json })).status).toBe(404);
    expect(rows(w, "SELECT actor_user_id FROM audit_log WHERE action = 'partner_review_resolved'")).toEqual([
      { actor_user_id: admin },
    ]);
    const open = await w.h.request('/api/admin/partner-review', { token: adminToken });
    expect((await open.json<{ items: unknown[] }>()).items).toEqual([]);
  });
});
