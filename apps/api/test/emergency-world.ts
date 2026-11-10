/**
 * A fictional world for emergency tests: an owner with a let unit, a tenant, a primary and a backup
 * partner for maintenance, each with one technician.
 */
import { NOW, SF_UNIT } from './db.js';
import { harness, type Harness } from './harness.js';

export interface World {
  readonly h: Harness;
  readonly owner: string;
  readonly tenant: string;
  readonly ownerToken: string;
  readonly tenantToken: string;
  readonly primaryToken: string;
  readonly backupToken: string;
}

export const EMAILS = {
  owner: 'layla.haddad@example.com',
  tenant: 'omar.tenant@example.com',
  primaryTech: 'tech.one@example.com',
  backupTech: 'tech.two@example.com',
} as const;

export async function world(
  opts: { primaryStatus?: 'active' | 'suspended'; withPartners?: boolean } = {},
): Promise<World> {
  const h = harness();
  const owner = await h.addUser({ email: EMAILS.owner, roles: ['owner'] });
  const tenant = await h.addUser({ email: EMAILS.tenant, roles: ['tenant'] });
  const primaryTech = await h.addUser({ email: EMAILS.primaryTech, roles: [['partner', 'p-primary']] });
  const backupTech = await h.addUser({ email: EMAILS.backupTech, roles: [['partner', 'p-backup']] });
  const db = h.sqlite;
  db.prepare("UPDATE partners SET name = 'Primary Fixers LLC' WHERE id = 'p-primary'").run();
  db.prepare("UPDATE partners SET name = 'Backup Fixers LLC' WHERE id = 'p-backup'").run();
  if (opts.primaryStatus === 'suspended') {
    db.prepare(
      "UPDATE partners SET status = 'suspended', status_reason = 'Insurance lapsed' WHERE id = 'p-primary'",
    ).run();
  }
  const tech = db.prepare(
    'INSERT INTO technicians (id, partner_id, user_id, created_at) VALUES (?, ?, ?, ?)',
  );
  tech.run('t-primary', 'p-primary', primaryTech, NOW);
  tech.run('t-backup', 'p-backup', backupTech, NOW);
  if (opts.withPartners !== false) {
    const sp = db.prepare(
      "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES (?, 'maintenance', ?, ?, ?)",
    );
    sp.run('sp-1', 'p-primary', 'primary', NOW);
    sp.run('sp-2', 'p-backup', 'backup', NOW);
  }
  db.prepare(
    `INSERT INTO tenancies (id, sf_unit_id, owner_user_id, tenant_user_id, starts_on, ends_on, status, invited_at, accepted_at, created_by)
     VALUES ('ten-1', ?, ?, ?, '2026-01-01', '2026-12-31', 'active', ?, ?, ?)`,
  ).run(SF_UNIT, owner, tenant, NOW, NOW, owner);

  return {
    h,
    owner,
    tenant,
    ownerToken: await h.signIn(EMAILS.owner),
    tenantToken: await h.signIn(EMAILS.tenant),
    primaryToken: await h.signIn(EMAILS.primaryTech),
    backupToken: await h.signIn(EMAILS.backupTech),
  } satisfies World;
}

export function raise(w: World, json: Record<string, unknown>, token = w.tenantToken): Promise<Response> {
  return w.h.request('/api/emergencies', { method: 'POST', token, json });
}

export const leak = {
  tenancyId: 'ten-1',
  type: 'water_leak',
  description: 'Water coming through the ceiling.',
};

export function rows(w: World, sql: string, ...params: (string | number)[]): unknown[] {
  return w.h.sqlite.prepare(sql).all(...params);
}
