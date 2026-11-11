/**
 * A fictional world for managed units (ADR 0034): the emergency world's owner, tenant (ten-1) and maintenance
 * partners, plus a JAD Global property management team ("Harbor Property Management (demo)") and another JAD
 * Global team, each with an office, an outside "VIP" maintenance company, and JAD+ staff. Fictional people only.
 */
import { DEFAULT_CALENDAR, dubaiDate, preferredDays } from '@jadplus/shared';
import { NOW, SF_UNIT } from './db.js';
import { world, type World } from './emergency-world.js';

export interface ManagedWorld extends World {
  readonly harbor: string;
  readonly harborUser: string;
  readonly otherTeam: string;
  readonly primaryOffice: string;
  readonly admin: string;
  readonly viewer: string;
}

export const TODAY = dubaiDate(NOW);
export const DAY = preferredDays(TODAY, DEFAULT_CALENDAR)[0] ?? '';

export async function managedWorld(): Promise<ManagedWorld> {
  const w = await world();
  const { h } = w;
  const db = h.sqlite;
  const harborUser = await h.addUser({
    email: 'harbor.pm.office@example.com',
    roles: [['partner_admin', 'p-harbor']],
  });
  await h.addUser({ email: 'other.team.office@example.com', roles: [['partner_admin', 'p-other']] });
  await h.addUser({ email: 'primary.office@example.com', roles: [['partner_admin', 'p-primary']] });
  await h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  await h.addUser({ email: 'viewer@jadplus.ae', roles: ['jad_viewer'] });
  db.prepare(
    "UPDATE partners SET name = 'Harbor Property Management (demo)', kind = 'jad_group' WHERE id = 'p-harbor'",
  ).run();
  db.prepare(
    "UPDATE partners SET name = 'Harbor Real Estate (demo)', kind = 'jad_group' WHERE id = 'p-other'",
  ).run();
  db.prepare(
    "INSERT INTO partners (id, name, created_at, updated_at) VALUES ('p-vip', 'VIP Care LLC (demo)', ?, ?)",
  ).run(NOW, NOW);
  db.prepare(
    "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES ('sp-pm', 'property-management', 'p-harbor', 'primary', ?)",
  ).run(NOW);
  return {
    ...w,
    harborUser,
    harbor: await h.signIn('harbor.pm.office@example.com', 'console'),
    otherTeam: await h.signIn('other.team.office@example.com', 'console'),
    primaryOffice: await h.signIn('primary.office@example.com', 'console'),
    admin: await h.signIn('demo@jadplus.ae', 'console'),
    viewer: await h.signIn('viewer@jadplus.ae', 'console'),
  };
}

export const post = (w: World, path: string, token: string, json: object = {}): Promise<Response> =>
  w.h.request(path, { method: 'POST', token, json });
export const put = (w: World, path: string, token: string, json: object): Promise<Response> =>
  w.h.request(path, { method: 'PUT', token, json });
export const get = (w: World, path: string, token: string): Promise<Response> => w.h.request(path, { token });

/** JAD+ Admin sets the world's unit as managed by Harbor; returns the arrangement id. */
export async function setManaged(w: ManagedWorld, over: object = {}): Promise<string> {
  const res = await post(w, '/api/admin/managed-units', w.admin, {
    sfUnitId: SF_UNIT,
    ownerUserId: w.owner,
    providerId: 'p-harbor',
    since: TODAY,
    until: null,
    ...over,
  });
  if (res.status !== 201) throw new Error(`set managed failed: ${String(res.status)}`);
  return (await res.json<{ id: string }>()).id;
}

/** The tenant (ten-1) raises a repair; returns the request id. */
export async function tenantRepair(w: World): Promise<string> {
  const res = await post(w, '/api/requests', w.tenantToken, {
    tenancyId: 'ten-1',
    serviceCode: 'maintenance',
    description: 'Bedroom AC is noisy.',
    preferredDate: DAY,
    preferredSlot: 'afternoon',
  });
  if (res.status !== 201) throw new Error(`raise failed: ${String(res.status)}`);
  return (await res.json<{ requestId: string }>()).requestId;
}
