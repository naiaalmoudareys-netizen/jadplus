/**
 * Demo data for a developer's LOCAL database only (never preview or production): a fictional partner with
 * one technician, a fictional owner with two units, and one open demo emergency (added only when none is open;
 * older ones and kinds no longer offered are closed, ADR 0017), so the app can be tried end to end. Run: pnpm --filter @jadplus/api db:seed:local (after db:migrate:local).
 *
 * People are obviously fictional (CLAUDE.md "People"). Personal fields are encrypted with the local keys from
 * .dev.vars, exactly as the API stores them; the SQL file is written under .wrangler/ (git-ignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blindIndex, encryptField, importKeys, toHex } from '../src/crypto.ts';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, '.wrangler', 'demo-seed.sql');

function devVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of readFileSync(join(ROOT, '.dev.vars'), 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) vars[match[1]] = match[2];
  }
  return vars;
}

const vars = devVars();
if (vars.ENVIRONMENT !== 'local') throw new Error('Demo data is for ENVIRONMENT=local only.');
const keys = await importKeys(vars.INDEX_KEY ?? '', vars.DATA_KEY ?? '');
const now = Date.now();

const hex = (bytes: Uint8Array) => `X'${toHex(bytes)}'`;
const text = (s: string | null) => (s === null ? 'NULL' : `'${s.replace(/'/g, "''")}'`);

async function user(id: string, email: string, name: string): Promise<string> {
  const emailHash = hex(await blindIndex(keys, 'email', email));
  const emailEnc = hex(await encryptField(keys, email, `users.email:${id}`));
  const nameEnc = hex(await encryptField(keys, name, `users.name:${id}`));
  return `INSERT OR IGNORE INTO users (id, email_hash, email_enc, name_enc, created_at, updated_at)
  VALUES (${text(id)}, ${emailHash}, ${emailEnc}, ${nameEnc}, ${now}, ${now});`;
}

const UNIT = 'a0XDEMO0000000001A';
const UNIT_2 = 'a0XDEMO0000000002A';
const OPEN = "status NOT IN ('closed', 'cancelled')";
const run = now.toString(36).toUpperCase().slice(-6);
const requestId = `demo-req-${run}`;
const sql = [
  await user('demo-tech', 'demo@jadplus.ae', 'Sami Demo'),
  await user('demo-owner', 'layla.haddad@example.com', 'Layla Haddad'),
  // The web console (ADR 0023): a JAD+ Admin and the demo partner's office manager, local only.
  await user('demo-admin', 'admin.demo@jadplus.ae', 'Admin Demo'),
  await user('demo-office', 'office.demo@jadplus.ae', 'Office Demo'),
  `INSERT OR IGNORE INTO partners (id, name, created_at, updated_at) VALUES ('demo-partner', 'Demo Fixers LLC', ${now}, ${now});`,
  `INSERT OR IGNORE INTO user_roles (id, user_id, role, partner_id, granted_at) VALUES
    ('demo-grant-tech', 'demo-tech', 'partner', 'demo-partner', ${now}),
    ('demo-grant-owner', 'demo-owner', 'owner', NULL, ${now}),
    ('demo-grant-admin', 'demo-admin', 'jad_admin', NULL, ${now}),
    ('demo-grant-office', 'demo-office', 'partner_admin', 'demo-partner', ${now});`,
  `INSERT OR IGNORE INTO technicians (id, partner_id, user_id, created_at) VALUES ('demo-tech-1', 'demo-partner', 'demo-tech', ${now});`,
  `INSERT OR IGNORE INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES ('demo-sp', 'maintenance', 'demo-partner', 'primary', ${now});`,
  `INSERT OR IGNORE INTO partner_documents (id, partner_id, kind, r2_key, expires_on, uploaded_at, uploaded_by) VALUES
    ('demo-doc-1', 'demo-partner', 'trade_licence', 'demo/licence.pdf', '2027-12-31', ${now}, 'demo-owner'),
    ('demo-doc-2', 'demo-partner', 'insurance', 'demo/insurance.pdf', '2027-12-31', ${now}, 'demo-owner');`,
  // The same two units as the demo owner portal (src/portal/demo.ts), so My unit and New request agree.
  `INSERT INTO owner_units (user_id, sf_unit_id, sf_deal_id, unit_name, project, building, address, deal_role, synced_at)
    VALUES ('demo-owner', '${UNIT}', '006DEMO0000000001A', '1204-J188', 'J188', NULL, 'Al Jaddaf, Dubai', 'Buyer', ${now}),
           ('demo-owner', '${UNIT_2}', '006DEMO0000000002A', '506-JAD288-C', 'JAD 288', 'Block C', 'Jumeirah Garden City, Dubai', 'Buyer', ${now})
    ON CONFLICT (user_id, sf_unit_id) DO UPDATE SET unit_name = excluded.unit_name, project = excluded.project,
      building = excluded.building, address = excluded.address, synced_at = excluded.synced_at;`,
  `UPDATE users SET owner_synced_at = ${now} WHERE id = 'demo-owner';`,
  // ADR 0017: emergencies are water leak and AC failure only; demo requests of other kinds are closed.
  `UPDATE requests SET status = 'cancelled', close_reason = 'cancelled_by_jad', next_due_at = NULL, next_due_kind = NULL,
    updated_at = ${now}, status_changed_at = ${now}, version = version + 1
    WHERE emergency_type IS NOT NULL AND emergency_type NOT IN ('water_leak', 'ac_failure') AND ${OPEN};`,
  // One open demo emergency at a time: older open ones are closed, and a new one is added only if none is open.
  `UPDATE requests SET status = 'cancelled', close_reason = 'cancelled_by_jad', next_due_at = NULL, next_due_kind = NULL,
    updated_at = ${now}, status_changed_at = ${now}, version = version + 1
    WHERE owner_user_id = 'demo-owner' AND is_emergency = 1 AND ${OPEN}
      AND id <> (SELECT id FROM requests WHERE owner_user_id = 'demo-owner' AND is_emergency = 1 AND ${OPEN}
                 ORDER BY created_at DESC LIMIT 1);`,
  `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, raised_by_user_id, raised_by_role, description,
    is_emergency, emergency_type, fault_source, status, partner_id, next_due_at, next_due_kind, created_at, updated_at, status_changed_at)
    SELECT ${text(requestId)}, 'JAD-D${run.slice(-5)}', 'maintenance', '${UNIT}', 'demo-owner', 'demo-owner', 'owner',
      'Water coming through the kitchen ceiling.', 1, 'water_leak', 'unit', 'assigned', 'demo-partner',
      ${now + 15 * 60_000}, 'emergency_ack', ${now}, ${now}, ${now}
    WHERE NOT EXISTS (SELECT 1 FROM requests WHERE owner_user_id = 'demo-owner' AND is_emergency = 1 AND ${OPEN});`,
  `INSERT INTO request_events (id, request_id, at, actor_user_id, actor_role, kind, to_status, partner_id)
    SELECT '${requestId}-e1', ${text(requestId)}, ${now}, 'demo-owner', 'owner', 'created', 'submitted', NULL
    WHERE EXISTS (SELECT 1 FROM requests WHERE id = ${text(requestId)})
    UNION ALL
    SELECT '${requestId}-e2', ${text(requestId)}, ${now}, NULL, 'system', 'assigned', NULL, 'demo-partner'
    WHERE EXISTS (SELECT 1 FROM requests WHERE id = ${text(requestId)});`,
];

mkdirSync(join(ROOT, '.wrangler'), { recursive: true });
writeFileSync(OUT, `${sql.join('\n')}\n`);
