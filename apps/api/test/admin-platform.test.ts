/** JAD+ Admin platform, services and buildings (ADR 0025): S1-S3, E12, C-AZ-1, C-PD-2, C-AUD-1. */
import {
  GUIDE_SECTIONS,
  NOTICE_KINDS,
  adminBuildingsResponse,
  adminServicesResponse,
  buildingContactsResponse,
  servicesResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, addUser, insert, migratedDb } from './db.js';
import { leak, raise, rows, world, type World } from './emergency-world.js';

const post = (w: World, path: string, token: string, json: object) =>
  w.h.request(path, { method: 'POST', token, json });

async function staff(w: World): Promise<{ admin: string; viewer: string }> {
  await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  await w.h.addUser({ email: 'viewer@jadplus.ae', roles: ['jad_viewer'] });
  return {
    admin: await w.h.signIn('demo@jadplus.ae', 'console'),
    viewer: await w.h.signIn('viewer@jadplus.ae', 'console'),
  };
}

const services = async (w: World, token: string) =>
  adminServicesResponse.parse(await (await w.h.request('/api/admin/services', { token })).json()).services;

const audits = (w: World, action: string) =>
  rows(w, 'SELECT target_id, detail FROM audit_log WHERE action = ? ORDER BY seq', action) as {
    target_id: string;
    detail: string | null;
  }[];

describe('JAD+ Admin: services and partners', () => {
  it('S1/S3: the 12 services with listed flag, routing, primary and backup; viewers read, residents cannot', async () => {
    const w = await world();
    const { viewer } = await staff(w);
    const list = await services(w, viewer);
    expect(list).toHaveLength(12);
    const maintenance = list.find((s) => s.code === 'maintenance');
    expect(maintenance).toMatchObject({
      listed: true,
      routing: 'partner',
      primary: { id: 'p-primary', status: 'active' },
      backup: { id: 'p-backup' },
    });
    expect(maintenance?.sla.map((t) => t.metric)).toContain('emergency_ack');
    expect(list.find((s) => s.code === 'mortgage')).toMatchObject({ routing: 'coming_soon', primary: null });
    expect(list.find((s) => s.code === 'leasing')).toMatchObject({ routing: 'jad', delivery: 'inhouse' });
    expect((await w.h.request('/api/admin/services', { token: w.ownerToken })).status).toBe(403);
    expect((await w.h.request('/api/admin/services', { token: w.primaryToken })).status).toBe(403);
    const change = await post(w, '/api/admin/services/maintenance/listed', viewer, { listed: false });
    expect(change.status).toBe(403);
  });

  it('S3: swapping primary and backup ends the old rows, keeps history and is audited', async () => {
    const w = await world();
    const { admin } = await staff(w);
    const res = await post(w, '/api/admin/services/maintenance/partners', admin, {
      primaryId: 'p-backup',
      backupId: 'p-primary',
    });
    expect(res.status).toBe(200);
    const maintenance = (await services(w, admin)).find((s) => s.code === 'maintenance');
    expect([maintenance?.primary?.id, maintenance?.backup?.id]).toEqual(['p-backup', 'p-primary']);
    expect(rows(w, 'SELECT id FROM service_partners WHERE ended_at = ?', NOW)).toHaveLength(2);
    expect(rows(w, 'SELECT id FROM service_partners')).toHaveLength(4);
    expect(audits(w, 'service_partners_set')).toEqual([
      { target_id: 'maintenance', detail: JSON.stringify({ primary: 'p-backup', backup: 'p-primary' }) },
    ]);
    // Saving the same pair again changes nothing.
    await post(w, '/api/admin/services/maintenance/partners', admin, {
      primaryId: 'p-backup',
      backupId: 'p-primary',
    });
    expect(rows(w, 'SELECT id FROM service_partners')).toHaveLength(4);
  });

  it('S2/S3: same partner twice, a suspended partner or an in-house service are refused; no partner = "coming soon"', async () => {
    const w = await world();
    const { admin } = await staff(w);
    const set = (code: string, primaryId: string | null, backupId: string | null) =>
      post(w, `/api/admin/services/${code}/partners`, admin, { primaryId, backupId });
    expect((await set('maintenance', 'p-primary', 'p-primary')).status).toBe(400);
    w.h.sqlite
      .prepare(
        "UPDATE partners SET status = 'suspended', status_reason = 'Insurance lapsed' WHERE id = 'p-backup'",
      )
      .run();
    expect((await set('maintenance', 'p-backup', null)).status).toBe(422);
    expect((await set('leasing', 'p-primary', null)).status).toBe(422);
    expect((await set('unknown-service', null, null)).status).toBe(404);
    expect((await set('maintenance', null, null)).status).toBe(200);
    const app = servicesResponse.parse(
      await (await w.h.request('/api/services', { token: w.ownerToken })).json(),
    );
    expect(app.services.find((s) => s.code === 'maintenance')?.routing).toBe('coming_soon');
  });

  it('S1: an unlisted service disappears from the app, and the change is audited', async () => {
    const w = await world();
    const { admin } = await staff(w);
    expect((await post(w, '/api/admin/services/golden-visa/listed', admin, { listed: false })).status).toBe(
      200,
    );
    const app = servicesResponse.parse(
      await (await w.h.request('/api/services', { token: w.ownerToken })).json(),
    );
    expect(app.services.map((s) => s.code)).not.toContain('golden-visa');
    expect((await services(w, admin)).find((s) => s.code === 'golden-visa')?.listed).toBe(false);
    expect(audits(w, 'service_listed_changed')).toEqual([
      { target_id: 'golden-visa', detail: JSON.stringify({ listed: false }) },
    ]);
  });
});

describe('JAD+ Admin: buildings and building management contacts', () => {
  it("E12: buildings from owners' units with unit and open request counts", async () => {
    const w = await world();
    const { viewer } = await staff(w);
    expect((await raise(w, leak)).status).toBe(201);
    const res = await w.h.request('/api/admin/buildings', { token: viewer });
    const { buildings } = adminBuildingsResponse.parse(await res.json());
    expect(buildings).toEqual([
      {
        project: 'JAD 288',
        building: 'Building B',
        units: 1,
        openRequests: 1,
        contacts: 0,
        currentNotices: 0,
      },
    ]);
  });

  it('E12/C-PD-2: contacts are encrypted at rest, shown to staff on an audited read, limited per building', async () => {
    const w = await world();
    const { admin, viewer } = await staff(w);
    const contact = {
      project: 'JAD 288',
      building: 'Building B',
      name: 'Rania Facility',
      role: 'Facility manager',
      phone: '050 000 0000',
      email: 'fm@example.com',
    };
    const added = await post(w, '/api/admin/building-contacts', admin, contact);
    expect(added.status).toBe(201);
    const { id } = await added.json<{ id: string }>();
    const stored = JSON.stringify(rows(w, 'SELECT * FROM building_contacts'), (_k, v: unknown) =>
      v instanceof Uint8Array ? new TextDecoder('latin1').decode(v) : v,
    );
    expect(stored).not.toContain('Rania');
    expect(stored).not.toContain('500000000');
    expect(stored).not.toContain('fm@example.com');

    const read = await w.h.request('/api/admin/building-contacts?project=JAD%20288', { token: viewer });
    const { contacts } = buildingContactsResponse.parse(await read.json());
    expect(contacts).toEqual([
      {
        id,
        project: 'JAD 288',
        building: 'Building B',
        name: 'Rania Facility',
        role: 'Facility manager',
        phone: '+971500000000',
        email: 'fm@example.com',
        createdAt: NOW,
      },
    ]);
    expect(audits(w, 'building_contacts_viewed')).toHaveLength(1);
    const trail = JSON.stringify(rows(w, 'SELECT detail FROM audit_log')) + w.h.logs.join('\n');
    expect(trail).not.toContain('Rania');
    expect(trail).not.toContain('fm@example.com');

    expect((await post(w, '/api/admin/building-contacts', viewer, contact)).status).toBe(403);
    expect(
      (await post(w, '/api/admin/building-contacts', admin, { ...contact, building: 'Nowhere Tower' }))
        .status,
    ).toBe(422);
    for (let i = 0; i < 4; i += 1) await post(w, '/api/admin/building-contacts', admin, contact);
    expect((await post(w, '/api/admin/building-contacts', admin, contact)).status).toBe(422);

    const del = await w.h.request(`/api/admin/building-contacts/${id}`, { method: 'DELETE', token: admin });
    expect(del.status).toBe(200);
    expect(rows(w, 'SELECT id FROM building_contacts WHERE id = ?', id)).toEqual([]);
    expect(audits(w, 'building_contact_removed')).toEqual([{ target_id: id, detail: null }]);
    expect(
      (await w.h.request(`/api/admin/building-contacts/${id}`, { method: 'DELETE', token: admin })).status,
    ).toBe(404);
  });
});

describe('schema mirrors packages/shared (no drift)', () => {
  it('V1: every notice kind and guide section is accepted, and nothing else; notices cannot be deleted', () => {
    const db = migratedDb();
    addUser(db, 'u-admin');
    const place = { project: 'JAD 288', building: '', title: 't', body: 'b' };
    const notice = (id: string, kind: string) => () => {
      insert(db, 'building_notices', {
        id,
        ...place,
        kind,
        starts_at: NOW,
        created_at: NOW,
        created_by: 'u-admin',
      });
    };
    const section = (id: string, name: string) => () => {
      insert(db, 'home_guide_sections', {
        id,
        ...place,
        section: name,
        updated_at: NOW,
        updated_by: 'u-admin',
      });
    };
    for (const kind of NOTICE_KINDS) expect(notice(`n-${kind}`, kind)).not.toThrow();
    for (const name of GUIDE_SECTIONS) expect(section(`g-${name}`, name)).not.toThrow();
    expect(notice('n-x', 'fire')).toThrow(/CHECK/);
    expect(section('g-x', 'pool')).toThrow(/CHECK/);
    expect(() => db.prepare('DELETE FROM building_notices').run()).toThrow(/evidence/);
  });
});
