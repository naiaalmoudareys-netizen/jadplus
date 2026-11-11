/**
 * Keeps the demo-company generator (scripts/company, `pnpm db:demo:company`) working as the API changes: a short
 * run of three simulated days must drive every set-up step and the first requests without a single refused call,
 * and export SQL that loads into a freshly migrated database.
 */
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
  }, 120_000);
});
