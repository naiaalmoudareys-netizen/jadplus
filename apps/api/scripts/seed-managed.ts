/**
 * Demo data for managed units (O4; ADR 0034), part of the LOCAL demo seed (seed-local.ts): the demo owner's second
 * unit (506-JAD288-C) is managed by the fictional "Harbor Property Management (demo)" under complimentary
 * management for one year, with one monthly statement for last month. The statement is the SAMPLE PDF the demo
 * uses elsewhere (src/portal/sample-pdf.ts); it is written to .wrangler/ (git-ignored) and put in the LOCAL R2
 * bucket by the db:seed:local script. Added once (INSERT OR IGNORE). The first unit (1204-J188) stays run by the
 * owner, so inviting a tenant from the app can still be tried there.
 */
import { createHash } from 'node:crypto';
import { toHex } from '../src/crypto.ts';
import { samplePdf } from '../src/portal/sample-pdf.ts';

const DAY = 86_400_000;
const DUBAI_OFFSET = 4 * 3_600_000;
const dubaiDate = (at: number): string => new Date(at + DUBAI_OFFSET).toISOString().slice(0, 10);

/** Where the statement lives in R2; db:seed:local uploads the file to this key in the local bucket. */
export const DEMO_STATEMENT_KEY = 'demo/managed/statement-sample.pdf';

/** The SQL for the arrangement and its statement, and the statement PDF (seed-local.ts writes it to .wrangler/). */
export function managedSeed(now: number, unit: string): { readonly sql: string[]; readonly pdf: Uint8Array } {
  const today = dubaiDate(now);
  // From the first day of last month, for one year; last month's statement is then within the arrangement.
  const lastMonth = dubaiDate(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`) - DAY).slice(0, 7);
  const since = `${lastMonth}-01`;
  const until = `${String(Number(since.slice(0, 4)) + 1)}${since.slice(4, 8)}${since.slice(8)}`;
  const pdf = samplePdf(`Monthly statement ${lastMonth}`);
  const sha = toHex(createHash('sha256').update(pdf).digest());
  const sql = [
    `INSERT OR IGNORE INTO managed_units (id, sf_unit_id, owner_user_id, provider_id, source, request_id, since, until, set_at, set_by)
      VALUES ('demo-managed-1', '${unit}', 'demo-owner', 'demo-harbor-pm', 'complimentary', NULL, '${since}', '${until}',
        ${String(now - 30 * DAY)}, 'demo-admin');`,
    `INSERT OR IGNORE INTO managed_statements (id, managed_unit_id, month, r2_key, byte_size, sha256, uploaded_by, uploaded_at)
      SELECT 'demo-statement-1', 'demo-managed-1', '${lastMonth}', '${DEMO_STATEMENT_KEY}', ${String(pdf.length)},
        X'${sha}', 'demo-harbor-pm-office', ${String(now - 2 * DAY)}
      WHERE EXISTS (SELECT 1 FROM managed_units WHERE id = 'demo-managed-1');`,
  ];
  return { sql, pdf };
}
