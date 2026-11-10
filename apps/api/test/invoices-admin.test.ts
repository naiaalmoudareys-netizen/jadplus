/** Partner invoices for JAD+ Admin and the overdue reminder (ADR 0026 §3-4). C-AZ-1, C-AUD-1. */
import { adminInvoicesResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { encryptField, importKeys } from '../src/crypto.js';
import { runInvoiceClock } from '../src/invoices/clock.js';
import { NOW } from './db.js';
import { TEST_DATA_KEY, TEST_INDEX_KEY } from './harness.js';
import { rows, world } from './emergency-world.js';
import { DAY, backdate, get, issued, job, office, post } from './invoices-world.js';

describe('overdue invoices (ADR 0026 §3)', () => {
  it('the owner is reminded once when an issued invoice is overdue', async () => {
    const w = await world();
    const token = await office(w);
    await issued(w, token, job(w, 'r1'));
    expect(await runInvoiceClock(w.h.env.DB, NOW + 14 * DAY)).toEqual({ overdue: 0 });
    expect(await runInvoiceClock(w.h.env.DB, NOW + 15 * DAY)).toEqual({ overdue: 1 });
    expect(await runInvoiceClock(w.h.env.DB, NOW + 16 * DAY)).toEqual({ overdue: 0 });
    const items = rows(w, "SELECT user_id, data FROM inbox WHERE kind = 'invoice_overdue'") as {
      user_id: string;
      data: string;
    }[];
    expect(items).toEqual([
      {
        user_id: w.owner,
        data: JSON.stringify({ amountAed: 420, dueOn: '2026-11-23', invoiceNumber: 'INV-PF-0001', days: 1 }),
      },
    ]);
  });
});

describe('JAD+ Admin sees every invoice (ADR 0026 §4)', () => {
  it('ageing, by partner and by owner, owner names decrypted and the viewing audited', async () => {
    const w = await world();
    const token = await office(w);
    const backup = await office(w, 'p-backup', 'office.two@example.com');
    const keys = await importKeys(TEST_INDEX_KEY, TEST_DATA_KEY);
    w.h.sqlite
      .prepare('UPDATE users SET name_enc = ? WHERE id = ?')
      .run(await encryptField(keys, 'Layla Haddad', `users.name:${w.owner}`), w.owner);
    backdate(w, await issued(w, token, job(w, 'r1')), 20);
    const other = await issued(w, backup, job(w, 'r2', { partner: 'p-backup', quoteFils: 20_000 }));
    await post(w, `/api/partner/invoices/${other}/paid`, backup, { paidOn: '2026-11-09', method: 'cash' });
    await w.h.addUser({ email: 'viewer@example.com', roles: ['jad_viewer'] });
    const viewer = await w.h.signIn('viewer@example.com', 'console');

    const body = adminInvoicesResponse.parse(await (await get(w, '/api/admin/invoices', viewer)).json());
    expect(body.invoices).toHaveLength(2);
    expect(body.invoices.find((i) => i.ref === 'JAD-R1')).toMatchObject({
      ownerName: 'Layla Haddad',
      partnerName: 'Primary Fixers LLC',
      ageDays: 20,
      ageing: '15-30',
      overdue: true,
    });
    expect(body.ageing).toEqual([
      { bucket: '0-14', count: 0, totalFils: 0 },
      { bucket: '15-30', count: 1, totalFils: 42_000 },
      { bucket: '31-60', count: 0, totalFils: 0 },
      { bucket: '60+', count: 0, totalFils: 0 },
    ]);
    expect(body.byPartner).toEqual([
      {
        partnerId: 'p-primary',
        partnerName: 'Primary Fixers LLC',
        count: 1,
        outstandingFils: 42_000,
        overdueFils: 42_000,
        paidFils: 0,
      },
      {
        partnerId: 'p-backup',
        partnerName: 'Backup Fixers LLC',
        count: 1,
        outstandingFils: 0,
        overdueFils: 0,
        paidFils: 21_000,
      },
    ]);
    expect(body.byOwner).toEqual([
      {
        ownerUserId: w.owner,
        ownerName: 'Layla Haddad',
        count: 2,
        outstandingFils: 42_000,
        overdueFils: 42_000,
        paidFils: 21_000,
      },
    ]);
    const overdueOnly = adminInvoicesResponse.parse(
      await (await get(w, '/api/admin/invoices?overdue=true', viewer)).json(),
    );
    expect(overdueOnly.invoices.map((i) => i.ref)).toEqual(['JAD-R1']);
    const byPartner = adminInvoicesResponse.parse(
      await (await get(w, '/api/admin/invoices?partnerId=p-backup&status=paid', viewer)).json(),
    );
    expect(byPartner.invoices.map((i) => i.ref)).toEqual(['JAD-R2']);

    const audit = rows(
      w,
      "SELECT action, target_id, detail FROM audit_log WHERE action IN ('invoices_viewed', 'person_viewed')",
    ) as {
      action: string;
      target_id: string;
      detail: string | null;
    }[];
    expect(audit.filter((a) => a.action === 'invoices_viewed')).toHaveLength(3);
    expect(audit.filter((a) => a.action === 'person_viewed').every((a) => a.target_id === w.owner)).toBe(
      true,
    );
    expect(JSON.stringify(audit)).not.toContain('Layla');
  });

  it('C-AZ-1: partners and residents cannot open the admin list; bad filters are refused', async () => {
    const w = await world();
    const token = await office(w);
    expect((await get(w, '/api/admin/invoices', token)).status).toBe(403);
    expect((await get(w, '/api/admin/invoices', w.ownerToken)).status).toBe(403);
    await w.h.addUser({ email: 'admin@example.com', roles: ['jad_admin'] });
    const admin = await w.h.signIn('admin@example.com', 'console');
    expect((await get(w, '/api/admin/invoices?overdue=yes', admin)).status).toBe(400);
    expect((await get(w, '/api/admin/invoices?extra=1', admin)).status).toBe(400);
  });
});
