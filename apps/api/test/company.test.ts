/**
 * Keeps the demo-company generator (scripts/company, `pnpm db:demo:company`) working as the API changes: a short
 * run of three simulated days must drive every set-up step and the first requests without a single refused call,
 * and export SQL that loads into a freshly migrated database. The data must also read true: upcoming investor
 * sessions never clash, every account has accepted the current terms (L1) before "now", and residents write
 * about routine repairs while awake.
 */
import { TERMS_VERSION } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { buildCompany } from '../scripts/company/generate.js';
import { dataSql, resetSql } from '../scripts/company/export.js';
import { migratedDb } from './db.js';
import { NOW } from './db.js';
import { TEST_DATA_KEY, TEST_INDEX_KEY } from './harness.js';

describe('demo company generator', () => {
  it('runs three simulated days and exports SQL that loads into a migrated database', async () => {
    const company = await buildCompany({
      indexKey: TEST_INDEX_KEY,
      dataKey: TEST_DATA_KEY,
      end: NOW,
      days: 3,
      seed: 7,
    });
    expect(company.owners.every((o) => o.userId !== '')).toBe(true);
    expect(company.requests.length).toBeGreaterThan(3);

    const target = migratedDb();
    target.exec(resetSql(target));
    target.exec(dataSql(company.w.db));
    const count = (table: string) =>
      (target.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    expect(count('requests')).toBe(company.requests.length);
    expect(count('partners')).toBe(9);
    expect(count('audit_log')).toBeGreaterThan(50);

    const db = company.w.db;
    // Education sessions, upcoming ones included: a different day each, so they can never clash.
    const sessions = db
      .prepare('SELECT starts_at FROM education_sessions WHERE cancelled_at IS NULL')
      .all() as { starts_at: number }[];
    expect(sessions.filter((x) => x.starts_at > NOW).length).toBeGreaterThanOrEqual(2);
    const days = sessions.map((x) => new Date(x.starts_at + 4 * 3_600_000).toISOString().slice(0, 10));
    expect(new Set(days).size).toBe(days.length);

    // L1: nobody lands on "Before you start": every account accepted the current terms before now.
    const missing = db
      .prepare(
        `SELECT COUNT(*) AS n FROM users u WHERE NOT EXISTS (SELECT 1 FROM consents k WHERE k.user_id = u.id
           AND k.kind = 'terms' AND k.version = ? AND k.accepted = 1 AND k.at < ?)`,
      )
      .get(TERMS_VERSION, NOW) as { n: number };
    expect(missing.n).toBe(0);

    // Residents write about routine repairs between 08:00 and 21:00 Dubai time (emergencies at any hour).
    const late = db
      .prepare(
        `SELECT COUNT(*) AS n FROM request_messages m JOIN requests r ON r.id = m.request_id
         WHERE r.is_emergency = 0 AND m.author_role IN ('owner', 'tenant')
           AND ((m.at + 14400000) % 86400000) NOT BETWEEN 28800000 AND 75600000`,
      )
      .get() as { n: number };
    expect(late.n).toBe(0);
  }, 120_000);
});
