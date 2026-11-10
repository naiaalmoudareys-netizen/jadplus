/**
 * Partner office tools with a JAD+ Admin side (ADR 0025): documents verified before they count (S7, S10), rate
 * card changes with 60 days' notice and written approval (S9, P1), scorecard (S5), feedback and export.
 * C-AZ-1/2, C-AUD-1, C-UPL-1, C-PD-2.
 */
import {
  DEFAULT_CALENDAR,
  adminPartnerDocumentsResponse,
  adminRateChangesResponse,
  dubaiDate,
  partnerDocumentsResponse,
  partnerFeedbackResponse,
  partnerScorecardResponse,
  preferredDays,
  rateCardResponse,
  requestRaisedResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT } from './db.js';
import { EMAILS, rows, world, type World } from './emergency-world.js';

const HOUR = 3_600_000;
const pdf = Uint8Array.from('%PDF-1.7 fictional test document %%EOF', (ch) => ch.charCodeAt(0));

async function signedIn(
  w: World,
  email: string,
  role: Parameters<World['h']['addUser']>[0]['roles'][number],
) {
  await w.h.addUser({ email, roles: [role] });
  return w.h.signIn(email, 'console');
}
const office = (w: World) => signedIn(w, 'office@example.com', ['partner_admin', 'p-primary']);
const admin = (w: World) => signedIn(w, 'demo@jadplus.ae', 'jad_admin');

const upload = (w: World, path: string, token: string, body: Uint8Array, type = 'application/pdf') =>
  w.h.request(path, { method: 'POST', token, body, headers: { 'content-type': type } });
const post = (w: World, path: string, token: string, json: object = {}) =>
  w.h.request(path, { method: 'POST', token, json });

describe('documents (S7, S10)', () => {
  it('S10: the office uploads a PDF; only a real PDF with its expiry date, one waiting per kind', async () => {
    const w = await world();
    const token = await office(w);
    const html = Uint8Array.from('<html>not a pdf</html>', (ch) => ch.charCodeAt(0));
    expect(
      (await upload(w, '/api/partner/documents/insurance?expiresOn=2027-11-01', token, html)).status,
    ).toBe(415);
    expect(
      (await upload(w, '/api/partner/documents/insurance?expiresOn=2027-11-01', token, pdf, 'image/png'))
        .status,
    ).toBe(415);
    expect((await upload(w, '/api/partner/documents/insurance', token, pdf)).status).toBe(400);
    expect(
      (await upload(w, '/api/partner/documents/insurance?expiresOn=2026-11-01', token, pdf)).status,
    ).toBe(400);
    expect((await upload(w, '/api/partner/documents/passport?expiresOn=2027-11-01', token, pdf)).status).toBe(
      404,
    );
    const ok = await upload(w, '/api/partner/documents/insurance?expiresOn=2027-11-01', token, pdf);
    expect(ok.status).toBe(201);
    expect(
      (await upload(w, '/api/partner/documents/insurance?expiresOn=2027-12-01', token, pdf)).status,
    ).toBe(409);
    expect((await upload(w, '/api/partner/documents/signed_sop_sla_kpi', token, pdf)).status).toBe(201);
    expect((await upload(w, '/api/partner/documents/rate_card', w.primaryToken, pdf)).status).toBe(403);

    const { documents } = partnerDocumentsResponse.parse(
      await (await w.h.request('/api/partner/documents', { token })).json(),
    );
    const insurance = documents.find((d) => d.kind === 'insurance');
    expect(insurance).toMatchObject({
      onFile: false,
      standing: 'missing',
      pending: { expiresOn: '2027-11-01' },
    });
    // C-UPL-1: no filename is kept; the file is under a key the server chose.
    const [stored] = rows(
      w,
      'SELECT r2_key, byte_size FROM partner_document_uploads WHERE kind = ?',
      'insurance',
    ) as { r2_key: string; byte_size: number }[];
    expect(stored?.r2_key).toMatch(/^partners\/p-primary\/documents\/[A-Za-z0-9_-]+\.pdf$/);
    expect(stored?.byte_size).toBe(pdf.length);
  });

  it('S7: JAD+ Admin views and accepts it; then it counts for the daily check', async () => {
    const w = await world();
    const token = await office(w);
    const { id } = await (
      await upload(w, '/api/partner/documents/insurance?expiresOn=2027-11-01', token, pdf)
    ).json<{ id: string }>();
    const adminToken = await admin(w);
    const list = adminPartnerDocumentsResponse.parse(
      await (await w.h.request('/api/admin/partner-documents', { token: adminToken })).json(),
    );
    expect(list.uploads.map((u) => [u.id, u.partnerName, u.kind])).toEqual([
      [id, 'Primary Fixers LLC', 'insurance'],
    ]);
    const file = await w.h.request(`/api/admin/partner-documents/${id}/file`, { token: adminToken });
    expect(file.headers.get('cache-control')).toContain('no-store');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdf);
    expect((await w.h.request(`/api/admin/partner-documents/${id}/file`, { token })).status).toBe(403);

    const viewer = await signedIn(w, 'viewer@jadplus.ae', 'jad_viewer');
    expect(
      (await post(w, `/api/admin/partner-documents/${id}/verify`, viewer, { decision: 'accept' })).status,
    ).toBe(403);
    const ok = await post(w, `/api/admin/partner-documents/${id}/verify`, adminToken, { decision: 'accept' });
    expect(await ok.json()).toEqual({ id, status: 'accepted' });
    expect(
      (await post(w, `/api/admin/partner-documents/${id}/verify`, adminToken, { decision: 'accept' })).status,
    ).toBe(404);
    expect(
      rows(w, 'SELECT kind, expires_on FROM partner_documents WHERE partner_id = ?', 'p-primary'),
    ).toEqual([{ kind: 'insurance', expires_on: '2027-11-01' }]);
    const { documents } = partnerDocumentsResponse.parse(
      await (await w.h.request('/api/partner/documents', { token })).json(),
    );
    expect(documents.find((d) => d.kind === 'insurance')).toMatchObject({
      onFile: true,
      expiresOn: '2027-11-01',
      standing: 'valid',
      pending: null,
    });
    expect(
      rows(w, "SELECT action, detail FROM audit_log WHERE action LIKE 'partner_document_%' ORDER BY seq"),
    ).toEqual([
      {
        action: 'partner_document_uploaded',
        detail: JSON.stringify({ kind: 'insurance', bytes: pdf.length }),
      },
      { action: 'partner_document_viewed', detail: null },
      { action: 'partner_document_accepted', detail: JSON.stringify({ kind: 'insurance' }) },
    ]);
  });

  it('S7: a rejection says why; the reason is stored encrypted and shown to the office', async () => {
    const w = await world();
    const token = await office(w);
    const { id } = await (
      await upload(w, '/api/partner/documents/trade_licence?expiresOn=2027-05-01', token, pdf)
    ).json<{ id: string }>();
    const adminToken = await admin(w);
    expect(
      (await post(w, `/api/admin/partner-documents/${id}/verify`, adminToken, { decision: 'reject' })).status,
    ).toBe(400);
    const reason = 'The licence number is not readable.';
    await post(w, `/api/admin/partner-documents/${id}/verify`, adminToken, { decision: 'reject', reason });
    const stored = rows(w, 'SELECT reason_enc FROM partner_document_uploads WHERE id = ?', id) as {
      reason_enc: Uint8Array;
    }[];
    expect(new TextDecoder().decode(stored[0]?.reason_enc)).not.toContain('readable');
    const { documents } = partnerDocumentsResponse.parse(
      await (await w.h.request('/api/partner/documents', { token })).json(),
    );
    expect(documents.find((d) => d.kind === 'trade_licence')?.lastRejected?.reason).toBe(reason);
  });
});

describe('rate card (S9, P1)', () => {
  const items = [{ serviceCode: 'maintenance', item: 'AC service', unit: 'per_visit', priceAed: 150 }];

  it('P1: 60 days notice, one request at a time; accepted by JAD+ with the written approver', async () => {
    const w = await world();
    const token = await office(w);
    const early = await post(w, '/api/partner/rate-card/changes', token, {
      items,
      effectiveFrom: '2026-12-01',
    });
    expect(early.status).toBe(409);
    const sent = await post(w, '/api/partner/rate-card/changes', token, {
      items,
      effectiveFrom: '2027-01-08',
    });
    expect(sent.status).toBe(201);
    const { id, validUntil } = await sent.json<{ id: string; validUntil: string }>();
    expect(validUntil).toBe('2028-01-07');
    expect(
      (await post(w, '/api/partner/rate-card/changes', token, { items, effectiveFrom: '2027-02-01' })).status,
    ).toBe(409);

    const adminToken = await admin(w);
    const pending = adminRateChangesResponse.parse(
      await (await w.h.request('/api/admin/rate-card-changes', { token: adminToken })).json(),
    );
    expect(pending.changes[0]?.items).toEqual([
      {
        serviceCode: 'maintenance',
        item: 'AC service',
        unit: 'per_visit',
        priceFils: 15_000,
        currentPriceFils: null,
      },
    ]);
    expect(
      (await post(w, `/api/admin/rate-card-changes/${id}`, adminToken, { decision: 'accept' })).status,
    ).toBe(400);
    const ok = await post(w, `/api/admin/rate-card-changes/${id}`, adminToken, {
      decision: 'accept',
      approvedBy: 'Marketing Director',
    });
    expect(await ok.json()).toEqual({ id, status: 'accepted' });
    const card = rateCardResponse.parse(
      await (await w.h.request('/api/partner/rate-card', { token })).json(),
    );
    expect(card.current).toBeNull();
    expect(card.upcoming.map((c) => c.effectiveFrom)).toEqual(['2027-01-08']);
    const accepted = adminRateChangesResponse.parse(
      await (await w.h.request('/api/admin/rate-card-changes?status=accepted', { token: adminToken })).json(),
    );
    expect(accepted.changes[0]?.approvedBy).toBe('Marketing Director');
  });

  it('P1: once in force, prices cannot rise for 12 months; lowering them is fine', async () => {
    const w = await world();
    let token = await office(w);
    const { id } = await (
      await post(w, '/api/partner/rate-card/changes', token, { items, effectiveFrom: '2027-01-08' })
    ).json<{ id: string }>();
    await post(w, `/api/admin/rate-card-changes/${id}`, await admin(w), {
      decision: 'accept',
      approvedBy: 'GM',
    });
    w.h.clock = Date.UTC(2027, 0, 10, 8);
    token = await w.h.signIn('office@example.com', 'console');
    const card = rateCardResponse.parse(
      await (await w.h.request('/api/partner/rate-card', { token })).json(),
    );
    expect(card.current?.items[0]?.priceFils).toBe(15_000);
    const raise = await post(w, '/api/partner/rate-card/changes', token, {
      items: [{ ...items[0], priceAed: 175 }],
      effectiveFrom: '2027-03-15',
    });
    expect(raise.status).toBe(409);
    expect(await raise.json()).toEqual({
      error: 'Prices are fixed until 2028-01-07. A raise can start after that date.',
    });
    const lower = await post(w, '/api/partner/rate-card/changes', token, {
      items: [{ ...items[0], priceAed: 140 }],
      effectiveFrom: '2027-03-15',
    });
    expect(lower.status).toBe(201);
  });
});

async function finishedAndRated(w: World, comment: string): Promise<{ id: string; ref: string }> {
  const res = await post(w, '/api/requests', w.ownerToken, {
    sfUnitId: SF_UNIT,
    serviceCode: 'maintenance',
    description: 'Kitchen tap is dripping.',
    preferredDate: preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0],
    preferredSlot: 'morning',
  });
  const { requestId: id, ref } = requestRaisedResponse.parse(await res.json());
  await post(w, `/api/partner/jobs/${id}/visit`, w.primaryToken, {
    technicianId: 't-primary',
    windowStart: NOW + HOUR,
    windowEnd: NOW + 3 * HOUR,
  });
  await post(w, `/api/partner/jobs/${id}/start`, w.primaryToken);
  await post(w, `/api/partner/jobs/${id}/done`, w.primaryToken);
  await post(w, `/api/requests/${id}/confirm`, w.ownerToken, { done: true });
  await post(w, `/api/requests/${id}/rating`, w.ownerToken, { stars: 4, comment });
  return { id, ref };
}

describe('scorecard, feedback, export (S5, S8)', () => {
  it('S5: the month’s scorecard from real data; JAD+ Admin sees the same', async () => {
    const w = await world();
    await finishedAndRated(w, 'Quick and tidy.');
    const token = await office(w);
    const card = partnerScorecardResponse.parse(
      await (await w.h.request('/api/partner/scorecard?month=2026-11', { token })).json(),
    );
    expect(card).toMatchObject({
      partnerId: 'p-primary',
      jobsDone: 1,
      onTimePercent: 100,
      rating: { average: 4, count: 1, stars: [0, 0, 0, 1, 0] },
      repeatVisits: 0,
      meets: { onTime: true, rating: true, repeatVisits: true },
    });
    expect(card.averageResponseMinutes).not.toBeNull();
    const adminToken = await admin(w);
    const seen = await w.h.request('/api/admin/partners/p-primary/scorecard?month=2026-11', {
      token: adminToken,
    });
    expect(partnerScorecardResponse.parse(await seen.json())).toEqual(card);
    expect((await w.h.request('/api/admin/partners/nobody/scorecard', { token: adminToken })).status).toBe(
      404,
    );
    expect((await w.h.request('/api/partner/scorecard?month=2026-1', { token })).status).toBe(400);
    expect((await w.h.request('/api/partner/scorecard', { token: w.primaryToken })).status).toBe(403);
  });

  it('S8: feedback shows the comment, service and date, never who wrote it or where', async () => {
    const w = await world();
    await finishedAndRated(w, 'Call me on +971 50 000 0000 next time.');
    const token = await office(w);
    const body = partnerFeedbackResponse.parse(
      await (await w.h.request('/api/partner/feedback', { token })).json(),
    );
    expect(body.feedback).toHaveLength(1);
    expect(Object.keys(body.feedback[0] ?? {}).sort()).toEqual(['comment', 'date', 'service', 'stars']);
    expect(body.feedback[0]?.comment).not.toContain('000 0000');
  });

  it('S5: the CSV export lists the month’s jobs without personal data, and is audited', async () => {
    const w = await world();
    const { ref } = await finishedAndRated(w, 'Fine.');
    const token = await office(w);
    const res = await w.h.request('/api/partner/export.csv?month=2026-11', { token });
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="jadplus-jobs-2026-11.csv"');
    const lines = (await res.text()).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Reference,Service,Project,Building,Raised,Finished,Status,SLA met,Rating');
    expect(lines[1]?.startsWith(`${ref},`)).toBe(true);
    expect(lines[1]).toContain(',JAD 288,Building B,2026-11-09 12:00,2026-11-09 12:00,');
    expect(lines[1]).toMatch(/,Yes,4$/);
    const csv = lines.join('\n');
    expect(csv).not.toContain(EMAILS.owner);
    expect(csv).not.toContain('JAD288-11');
    expect(rows(w, "SELECT detail FROM audit_log WHERE action = 'partner_jobs_exported'")).toEqual([
      { detail: JSON.stringify({ month: '2026-11', rows: 1 }) },
    ]);
  });
});
