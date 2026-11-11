/** Monthly statements of managed units (ADR 0034): O4, C-AZ-2, C-UPL-1, C-AUD-1. */
import { inboxResponse, ownerManagedUnitsResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { ownerRecord } from './harness.js';
import { rows } from './emergency-world.js';
import { get, managedWorld, setManaged, type ManagedWorld } from './managed-world.js';
import { pdf } from './reports-world.js';

const upload = (
  w: ManagedWorld,
  id: string,
  token: string,
  month: string,
  body: Uint8Array,
  type = 'application/pdf',
) =>
  w.h.request(`/api/partner/managed-units/${id}/statements?month=${month}`, {
    method: 'POST',
    token,
    headers: { 'content-type': type },
    body,
  });

describe('monthly statements (O4)', () => {
  it('O4/C-UPL-1: the managing office uploads one PDF per month of the arrangement; the owner is told', async () => {
    const w = await managedWorld();
    const id = await setManaged(w);
    expect((await upload(w, id, w.harbor, '2026-11', pdf())).status).toBe(201);
    expect((await upload(w, id, w.harbor, '2026-12', pdf())).status).toBe(400);
    expect((await upload(w, id, w.harbor, '2026-10', pdf())).status).toBe(400);
    expect((await upload(w, id, w.harbor, '2026-11', new TextEncoder().encode('not a pdf'))).status).toBe(
      415,
    );
    expect((await upload(w, id, w.harbor, '2026-11', pdf(), 'image/png')).status).toBe(415);
    expect((await upload(w, id, w.otherTeam, '2026-11', pdf())).status).toBe(404);
    expect((await upload(w, id, w.ownerToken, '2026-11', pdf())).status).toBe(403);
    const big = await upload(w, id, w.harbor, '2026-11', pdf(20 * 1024 * 1024 + 1));
    expect(big.status).toBe(413);
    const items = inboxResponse.parse(await (await get(w, '/api/me/inbox', w.ownerToken)).json()).items;
    expect(items.map((i) => i.kind)).toContain('statement_ready');
    expect(rows(w, 'SELECT r2_key, byte_size FROM managed_statements')).toEqual([
      { r2_key: expect.stringMatching(/^managed\/.+\/statements\/.+\.pdf$/) as unknown, byte_size: 600 },
    ]);
  });

  it('O4/C-AZ-2: the owner reads them in My unit; downloads are audited; tenants and others cannot', async () => {
    const w = await managedWorld();
    const id = await setManaged(w);
    await upload(w, id, w.harbor, '2026-11', pdf());
    // A correction for the same month replaces it in the list; the first stays as evidence.
    await upload(w, id, w.harbor, '2026-11', pdf(700));
    const mine = ownerManagedUnitsResponse.parse(
      await (await get(w, '/api/owner/managed-units', w.ownerToken)).json(),
    );
    expect(mine.units).toHaveLength(1);
    const unit = mine.units[0];
    expect(unit).toMatchObject({ providerName: 'Harbor Property Management (demo)', current: true });
    expect(unit?.statements).toHaveLength(1);
    const sid = unit?.statements[0]?.id ?? '';
    const path = `/api/managed-units/${id}/statements/${sid}/file`;
    const file = await get(w, path, w.ownerToken);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect((await file.arrayBuffer()).byteLength).toBe(700);
    expect((await get(w, path, w.harbor)).status).toBe(200);
    expect((await get(w, path, w.viewer)).status).toBe(200);
    expect((await get(w, path, w.tenantToken)).status).toBe(403);
    expect((await get(w, path, w.otherTeam)).status).toBe(404);
    // Another owner (of another unit) gets "not found".
    w.h.salesforce.set(
      'email:other.owner@example.com',
      ownerRecord('other.owner@example.com', ['a0X000000000777AAA']),
    );
    await w.h.addUser({ email: 'other.owner@example.com', roles: [] });
    const other = await w.h.signIn('other.owner@example.com');
    expect((await get(w, path, other)).status).toBe(404);
    expect(
      ownerManagedUnitsResponse.parse(await (await get(w, '/api/owner/managed-units', other)).json()).units,
    ).toEqual([]);
    expect(
      rows(w, "SELECT actor_role FROM audit_log WHERE action = 'managed_statement_downloaded' ORDER BY seq"),
    ).toEqual([{ actor_role: 'owner' }, { actor_role: 'partner_admin' }, { actor_role: 'jad_viewer' }]);
  });
});
