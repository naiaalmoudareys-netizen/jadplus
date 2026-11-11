/** Snag lists and the free re-inspection (ADR 0032): O3, S4, C-UPL-1, C-AZ-1, C-AZ-2, C-AUD-1. */
import { snagListResponse, snagsToFixResponse, requestDetailResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { rows } from './emergency-world.js';
import { jpegWithLocation } from './fixtures.js';
import { inspect, pdf, post, raiseReport, reportWorld, upload, type ReportWorld } from './reports-world.js';

const HOUR = 3_600_000;
const jpeg = () => jpegWithLocation() as Uint8Array<ArrayBuffer>;

const list = async (w: ReportWorld, id: string, token: string) =>
  snagListResponse.parse(await (await w.h.request(`/api/requests/${id}/snags`, { token })).json());

const addSnag = async (w: ReportWorld, id: string, title: string, token = w.inspectorOffice) => {
  const res = await post(w, `/api/requests/${id}/snags`, token, { title, room: 'Kitchen' });
  return { status: res.status, id: res.status === 201 ? (await res.json<{ id: string }>()).id : '' };
};

const fix = (w: ReportWorld, id: string, snag: string, token: string) =>
  upload(w, `/api/requests/${id}/snags/${snag}/fix`, token, jpeg(), 'image/jpeg');

const decide = (w: ReportWorld, id: string, snag: string, confirm: boolean) =>
  post(w, `/api/requests/${id}/snags/${snag}/decision`, w.ownerToken, { confirm });

/** A professional snagging request inspected, with two snags listed and the report uploaded. */
async function reported(w: ReportWorld): Promise<{ id: string; a: string; b: string }> {
  const id = await raiseReport(w, 'snagging');
  await inspect(w, id, w.inspectorOffice, 't-inspector');
  const a = (await addSnag(w, id, 'Cracked tile')).id;
  const b = (await addSnag(w, id, 'Door does not close', w.inspectorTech)).id;
  expect(
    (await upload(w, `/api/requests/${id}/report`, w.inspectorOffice, pdf(), 'application/pdf')).status,
  ).toBe(201);
  return { id, a, b };
}

describe('listing snags (O3)', () => {
  it('O3: the inspector lists snags with a photo during the inspection; the owner sees them with the report', async () => {
    const w = await reportWorld();
    const id = await raiseReport(w, 'snagging');
    expect((await addSnag(w, id, 'Too early')).status).toBe(409);
    await inspect(w, id, w.inspectorOffice, 't-inspector');
    const snag = await addSnag(w, id, 'Scratched window, call +971 50 000 0000');
    expect(snag.status).toBe(201);
    const photo = await upload(
      w,
      `/api/requests/${id}/snags/${snag.id}/photo`,
      w.inspectorTech,
      jpeg(),
      'image/jpeg',
    );
    expect(photo.status).toBe(201);
    expect(
      (await upload(w, `/api/requests/${id}/snags/${snag.id}/photo`, w.inspectorTech, jpeg(), 'image/jpeg'))
        .status,
    ).toBe(409);
    const mistake = await addSnag(w, id, 'Listed by mistake');
    expect((await post(w, `/api/requests/${id}/snags/${mistake.id}/remove`, w.inspectorOffice)).status).toBe(
      200,
    );
    // Before the report the owner sees nothing yet.
    expect((await list(w, id, w.ownerToken)).snags).toEqual([]);
    expect((await list(w, id, w.inspectorOffice)).canAdd).toBe(true);
    await upload(w, `/api/requests/${id}/report`, w.inspectorOffice, pdf(), 'application/pdf');
    const owner = await list(w, id, w.ownerToken);
    expect(owner.snags).toHaveLength(1);
    expect(owner.snags[0]).toMatchObject({ room: 'Kitchen', status: 'open', hasPhoto: true });
    // ADR 0009: contact details never reach the owner.
    expect(owner.snags[0]?.title).not.toContain('000 0000');
    expect(owner).toMatchObject({ canAdd: false, canFix: false, canDecide: true });
    // The request stays open while snags are fixed.
    expect(rows(w, 'SELECT status, next_due_at FROM requests WHERE id = ?', id)).toEqual([
      { status: 'in_progress', next_due_at: null },
    ]);
    const view = await w.h.request(`/api/requests/${id}/snags/${snag.id}/photo/snag`, {
      token: w.ownerToken,
    });
    expect(view.status).toBe(200);
    expect(String.fromCharCode(...new Uint8Array(await view.arrayBuffer()))).not.toContain('GPS');
    expect((await addSnag(w, id, 'After the report')).status).toBe(409);
  });

  it('C-AZ-1/C-AZ-2: tenants never; another partner cannot tell the list exists', async () => {
    const w = await reportWorld();
    const { id, a } = await reported(w);
    expect((await w.h.request(`/api/requests/${id}/snags`, { token: w.tenantToken })).status).toBe(403);
    expect((await w.h.request(`/api/requests/${id}/snags`, { token: w.primaryToken })).status).toBe(404);
    expect((await fix(w, id, a, w.primaryToken)).status).toBe(404);
    expect((await fix(w, id, a, w.valuerOffice)).status).toBe(404);
    expect((await addSnag(w, id, 'Sneaky', w.primaryToken)).status).toBe(404);
    expect(
      (await w.h.request(`/api/requests/${id}/snags/${a}/photo/snag`, { token: w.primaryToken })).status,
    ).toBe(404);
    // JAD+ staff read the list but change nothing here.
    expect(await list(w, id, w.viewer)).toMatchObject({ canAdd: false, canFix: false, canDecide: false });
    expect((await fix(w, id, a, w.admin)).status).toBe(403);
    expect((await decide(w, id, a, true)).status).toBe(409);
  });
});

describe('fixing, confirming and reopening (O3)', () => {
  it('O3: the handover team fixes with a photo; the owner confirms one and reopens the other', async () => {
    const w = await reportWorld();
    const { id, a, b } = await reported(w);
    // The handover team (developer side) sees the snags waiting for it, without the request itself.
    const todo = snagsToFixResponse.parse(
      await (await w.h.request('/api/partner/snags', { token: w.handoverOffice })).json(),
    );
    expect(todo.snags.map((s) => s.id).sort()).toEqual([a, b].sort());
    expect((await w.h.request(`/api/requests/${id}`, { token: w.handoverOffice })).status).toBe(404);
    expect((await w.h.request(`/api/requests/${id}/report`, { token: w.handoverOffice })).status).toBe(404);
    expect((await list(w, id, w.handoverOffice)).canFix).toBe(true);

    expect(
      (await upload(w, `/api/requests/${id}/snags/${a}/fix`, w.handoverOffice, pdf(), 'image/jpeg')).status,
    ).toBe(415);
    expect((await fix(w, id, a, w.handoverOffice)).status).toBe(200);
    expect((await fix(w, id, a, w.inspectorOffice)).status).toBe(409);
    expect((await fix(w, id, b, w.inspectorTech)).status).toBe(200);
    expect(
      (await w.h.request(`/api/requests/${id}/snags/${a}/photo/fix`, { token: w.ownerToken })).status,
    ).toBe(200);

    expect((await decide(w, id, a, true)).status).toBe(200);
    expect((await decide(w, id, a, false)).status).toBe(409);
    expect((await decide(w, id, b, false)).status).toBe(200);
    const after = await list(w, id, w.ownerToken);
    expect(after.snags.map((s) => [s.status, s.reopenCount, s.hasFixPhoto])).toEqual([
      ['confirmed', 0, true],
      ['open', 1, false],
    ]);
    expect(
      rows(w, 'SELECT kind, actor_role, partner_id FROM snag_events WHERE snag_id = ? ORDER BY rowid', b),
    ).toEqual([
      { kind: 'added', actor_role: 'partner', partner_id: 'p-inspector' },
      { kind: 'fixed', actor_role: 'partner', partner_id: 'p-inspector' },
      { kind: 'reopened', actor_role: 'owner', partner_id: null },
    ]);
    expect(
      rows(
        w,
        "SELECT count(*) AS n FROM audit_log WHERE action IN ('snag_fixed', 'snag_confirmed', 'snag_reopened')",
      ),
    ).toEqual([{ n: 4 }]);
  });
});

describe('the free re-inspection (O3, S4)', () => {
  it('O3/S4: once all snags are fixed, once only; booked within 48 h, its report closes the journey', async () => {
    const w = await reportWorld();
    const { id, a, b } = await reported(w);
    const ask = () => post(w, `/api/requests/${id}/reinspection`, w.ownerToken);
    await fix(w, id, a, w.handoverOffice);
    expect((await ask()).status).toBe(409); // b is still open
    await fix(w, id, b, w.handoverOffice);
    expect((await post(w, `/api/requests/${id}/reinspection`, w.tenantToken)).status).toBe(403);
    expect((await ask()).status).toBe(200);
    expect(rows(w, 'SELECT status, next_due_kind, next_due_at FROM requests WHERE id = ?', id)).toEqual([
      { status: 'reopened', next_due_kind: 'reinspection_booking', next_due_at: w.h.clock + 48 * HOUR },
    ]);
    expect((await ask()).status).toBe(409);
    expect(() =>
      w.h.sqlite
        .prepare('UPDATE report_requests SET reinspection_requested_at = 1 WHERE request_id = ?')
        .run(id),
    ).toThrow(/re-inspection/);

    await inspect(w, id, w.inspectorOffice, 't-inspector');
    expect(rows(w, 'SELECT is_repeat FROM visits WHERE request_id = ? ORDER BY rowid', id)).toEqual([
      { is_repeat: 0 },
      { is_repeat: 0 },
    ]);
    expect(rows(w, 'SELECT next_due_kind FROM requests WHERE id = ?', id)).toEqual([
      { next_due_kind: 'reinspection_report' },
    ]);
    const res = await upload(w, `/api/requests/${id}/report`, w.inspectorOffice, pdf(), 'application/pdf');
    expect(await res.json()).toMatchObject({ kind: 'reinspection', status: 'completed' });
    const detail = requestDetailResponse.parse(
      await (await w.h.request(`/api/requests/${id}`, { token: w.ownerToken })).json(),
    );
    expect(detail.actions).toEqual(['confirm_done']);
    expect((await post(w, `/api/requests/${id}/confirm`, w.ownerToken, { done: true })).status).toBe(200);
    expect(rows(w, 'SELECT status, close_reason FROM requests WHERE id = ?', id)).toEqual([
      { status: 'closed', close_reason: 'confirmed' },
    ]);
    // Closed: nothing can be fixed or decided any more.
    expect((await list(w, id, w.ownerToken)).canDecide).toBe(false);
  });
});
