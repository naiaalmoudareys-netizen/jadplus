/**
 * Test database: a fresh in-memory SQLite with every migration in apps/api/migrations applied in order,
 * exactly as `wrangler d1 migrations apply` does. Foreign keys are on, as they always are in D1.
 * Fixtures use fictional data only (CLAUDE.md "People").
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of migrationFiles()) db.exec(readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8'));
  return db;
}

export const NOW = Date.UTC(2026, 10, 9, 8, 0, 0);
export const SF_UNIT = 'a0X000000000001AAA';
const BYTES32 = new Uint8Array(32);

type Row = Record<string, string | number | Uint8Array | null>;

/** Insert one row; column names come from test code only, never from input. */
export function insert(db: DatabaseSync, table: string, row: Row): void {
  const cols = Object.keys(row);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  db.prepare(sql).run(...Object.values(row));
}

export function addUser(db: DatabaseSync, id: string): void {
  insert(db, 'users', {
    id,
    email_hash: new TextEncoder().encode(`hash-${id}`),
    email_enc: new TextEncoder().encode(`cipher-${id}`),
    created_at: NOW,
    updated_at: NOW,
  });
}

/** A minimal world: owner, tenant, admin, one partner with a technician, one service, one tenancy. */
export function seedWorld(db: DatabaseSync): void {
  for (const id of ['u-owner', 'u-tenant', 'u-admin', 'u-tech']) addUser(db, id);
  insert(db, 'partners', { id: 'p-1', name: 'Fictional Fixers LLC', created_at: NOW, updated_at: NOW });
  insert(db, 'technicians', { id: 't-1', partner_id: 'p-1', user_id: 'u-tech', created_at: NOW });
  insert(db, 'tenancies', {
    id: 'ten-1',
    sf_unit_id: SF_UNIT,
    owner_user_id: 'u-owner',
    tenant_user_id: 'u-tenant',
    starts_on: '2026-01-01',
    ends_on: '2026-12-31',
    status: 'active',
    invited_at: NOW,
    accepted_at: NOW,
    created_by: 'u-owner',
  });
}

export function requestRow(overrides: Row = {}): Row {
  return {
    id: 'req-1',
    ref: 'JAD-0001',
    service_code: 'maintenance',
    sf_unit_id: SF_UNIT,
    owner_user_id: 'u-owner',
    tenancy_id: 'ten-1',
    raised_by_user_id: 'u-tenant',
    raised_by_role: 'tenant',
    description: 'Kitchen tap dripping.',
    is_emergency: 0,
    status: 'submitted',
    created_at: NOW,
    updated_at: NOW,
    status_changed_at: NOW,
    ...overrides,
  };
}

export { BYTES32 };
