/**
 * Building help lines (E12; ADR 0029): JAD+ Admin sets the security and building management numbers per building
 * or project; owners and tenants read those of their own homes. C-AZ-1, C-AZ-2, C-PD-2, C-AUD-1.
 */
import {
  BUILDING_LINE_KINDS,
  adminBuildingLinesResponse,
  residentBuildingLinesResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, insert, migratedDb, seedWorld } from './db.js';
import { rows, world, type World } from './emergency-world.js';
import { ownerRecord } from './harness.js';

const B = { project: 'JAD 288', building: 'Building B' };
const PROJECT = { project: 'JAD 288', building: null };
const OTHER = { project: 'J188', building: null };
const SECURITY = '+971 4 000 0000';
const MANAGEMENT = '+971 50 000 0000';

type Setup = World & { admin: string; viewer: string; otherOwner: string };

async function setup(): Promise<Setup> {
  const w = await world();
  await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  await w.h.addUser({ email: 'viewer@jadplus.ae', roles: ['jad_viewer'] });
  // Another owner, whose only unit Salesforce places in another project (synced at sign-in).
  const email = 'other.owner@example.com';
  await w.h.addUser({ email, roles: ['owner'] });
  const record = ownerRecord(email, ['a0X000000000008AAA']);
  w.h.salesforce.set(`email:${email}`, {
    ...record,
    units: record.units.map((u) => ({ ...u, unitName: '1204-J188', project: 'J188', building: null })),
  });
  return {
    ...w,
    admin: await w.h.signIn('demo@jadplus.ae', 'console'),
    viewer: await w.h.signIn('viewer@jadplus.ae', 'console'),
    otherOwner: await w.h.signIn('other.owner@example.com'),
  };
}

const put = (w: World, token: string, json: object) =>
  w.h.request('/api/admin/building-lines', { method: 'PUT', token, json });

const line = (place: object, kind: string, phone: string, hours: string | null = '24/7') => ({
  ...place,
  kind,
  phone,
  hours,
});

const mine = async (w: World, token: string) =>
  residentBuildingLinesResponse.parse(await (await w.h.request('/api/me/building-lines', { token })).json())
    .places;

describe('building help lines: JAD+ Admin (E12)', () => {
  it('E12/C-AUD-1: JAD+ Admin sets and changes a line; one row per kind and place; audited without the number', async () => {
    const w = await setup();
    const first = await put(w, w.admin, line(B, 'security', '04 000 0000'));
    expect(first.status).toBe(201);
    const { id } = await first.json<{ id: string }>();
    const again = await put(w, w.admin, line(B, 'security', SECURITY, 'Sun-Thu 8:00-17:00'));
    expect(again.status).toBe(200);
    expect((await again.json<{ id: string }>()).id).toBe(id);
    expect(rows(w, 'SELECT id FROM building_lines')).toHaveLength(1);

    const read = adminBuildingLinesResponse.parse(
      await (await w.h.request('/api/admin/building-lines?project=JAD%20288', { token: w.viewer })).json(),
    ).lines;
    expect(read).toEqual([
      { id, ...B, kind: 'security', phone: '+97140000000', hours: 'Sun-Thu 8:00-17:00', updatedAt: NOW },
    ]);

    // C-PD-2: stored as ciphertext, never as the number.
    const stored = rows(w, 'SELECT phone_enc FROM building_lines') as { phone_enc: Uint8Array }[];
    const cipher = new TextDecoder('latin1').decode(stored[0]?.phone_enc ?? new Uint8Array());
    expect(cipher).not.toContain('97140000000');
    const audits = rows(
      w,
      "SELECT detail FROM audit_log WHERE action = 'building_line_set' ORDER BY seq",
    ) as {
      detail: string;
    }[];
    expect(audits).toHaveLength(2);
    for (const a of audits) expect(a.detail).not.toMatch(/0000/);
    expect(JSON.parse(audits[1]?.detail ?? '{}')).toEqual({
      project: 'JAD 288',
      building: 'Building B',
      kind: 'security',
      hours: 'Sun-Thu 8:00-17:00',
      changed: true,
    });
    expect(w.h.logs.join('\n')).not.toMatch(/97140000000/);

    expect(
      (await w.h.request(`/api/admin/building-lines/${id}`, { method: 'DELETE', token: w.viewer })).status,
    ).toBe(403);
    expect(
      (await w.h.request(`/api/admin/building-lines/${id}`, { method: 'DELETE', token: w.admin })).status,
    ).toBe(200);
    expect(
      (await w.h.request(`/api/admin/building-lines/${id}`, { method: 'DELETE', token: w.admin })).status,
    ).toBe(404);
    expect(rows(w, 'SELECT id FROM building_lines')).toEqual([]);
    expect(rows(w, "SELECT target_id FROM audit_log WHERE action = 'building_line_removed'")).toEqual([
      { target_id: id },
    ]);
  });

  it('E12/C-AZ-1: only JAD+ Admin changes, for a known place, with a real number and plain hours', async () => {
    const w = await setup();
    expect((await put(w, w.viewer, line(B, 'security', SECURITY))).status).toBe(403);
    expect((await put(w, w.ownerToken, line(B, 'security', SECURITY))).status).toBe(403);
    expect((await put(w, w.primaryToken, line(B, 'security', SECURITY))).status).toBe(403);
    expect(
      (await put(w, w.admin, line({ project: 'Unknown', building: null }, 'security', SECURITY))).status,
    ).toBe(422);
    expect((await put(w, w.admin, line(B, 'security', 'call us'))).status).toBe(400);
    expect((await put(w, w.admin, line(B, 'reception', SECURITY))).status).toBe(400);
    expect((await put(w, w.admin, line(B, 'security', SECURITY, '<b>24/7</b>'))).status).toBe(400);
    expect((await put(w, w.admin, { ...line(B, 'security', SECURITY), extra: true })).status).toBe(400);
    expect(
      (await w.h.request('/api/admin/building-lines?project=JAD%20288', { token: w.ownerToken })).status,
    ).toBe(403);
    expect(rows(w, 'SELECT id FROM building_lines')).toEqual([]);
  });
});

describe('building help lines: residents (E12)', () => {
  it("E12: owners and tenants see their building's own line, else the project's; nothing from elsewhere", async () => {
    const w = await setup();
    expect((await put(w, w.admin, line(PROJECT, 'security', '+971 4 000 0001'))).status).toBe(201);
    expect((await put(w, w.admin, line(B, 'security', SECURITY))).status).toBe(201);
    expect((await put(w, w.admin, line(PROJECT, 'management', MANAGEMENT, null))).status).toBe(201);
    expect((await put(w, w.admin, line(OTHER, 'management', '+971 4 000 0002'))).status).toBe(201);

    for (const token of [w.ownerToken, w.tenantToken]) {
      expect(await mine(w, token)).toEqual([
        {
          ...B,
          security: { phone: '+97140000000', hours: '24/7' },
          management: { phone: '+971500000000', hours: null },
        },
      ]);
    }
  });

  it("E12/C-AZ-2: another owner never sees this building's lines; partners and staff are refused", async () => {
    const w = await setup();
    expect((await put(w, w.admin, line(B, 'security', SECURITY))).status).toBe(201);
    expect(await mine(w, w.otherOwner)).toEqual([{ ...OTHER, security: null, management: null }]);
    expect((await w.h.request('/api/me/building-lines', { token: w.primaryToken })).status).toBe(403);
    expect((await w.h.request('/api/me/building-lines', { token: w.admin })).status).toBe(403);
  });
});

describe('schema mirrors packages/shared (no drift)', () => {
  it('E12: every line kind in building-lines.ts is accepted by migration 0026, and nothing else', () => {
    const db = migratedDb();
    seedWorld(db);

    const add = (kind: string) => {
      insert(db, 'building_lines', {
        id: `l-${kind}`,
        project: 'JAD 288',
        building: '',
        kind,
        phone_enc: new Uint8Array([1]),
        hours: null,
        updated_at: NOW,
        updated_by: 'u-admin',
      });
    };
    for (const kind of BUILDING_LINE_KINDS) {
      expect(() => {
        add(kind);
      }).not.toThrow();
    }
    expect(() => {
      add('reception');
    }).toThrow(/CHECK/);
  });
});
