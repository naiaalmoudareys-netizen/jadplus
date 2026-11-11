/**
 * The generator's entry point for `pnpm db:demo:company` (run through scripts/company/vitest.config.ts so it loads
 * the API's TypeScript like the tests do). Reads the developer's LOCAL keys from apps/api/.dev.vars (never
 * printed), so the encrypted fields open in the local `wrangler dev`, and refuses anything but ENVIRONMENT=local.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { buildCompany } from './generate.js';
import { writeCompany } from './output.js';

const ROOT = join(import.meta.dirname, '..', '..');

function devVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of readFileSync(join(ROOT, '.dev.vars'), 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) vars[match[1]] = match[2];
  }
  return vars;
}

test('build the demo company (about 90 days)', async () => {
  const vars = devVars();
  if (vars.ENVIRONMENT !== 'local') throw new Error('The demo company is for ENVIRONMENT=local only.');
  const company = await buildCompany({
    indexKey: vars.INDEX_KEY ?? '',
    dataKey: vars.DATA_KEY ?? '',
    end: Date.now(),
    days: 90,
    seed: 20261111,
  });
  const out = writeCompany(company, join(ROOT, '.wrangler'));
  expect(out.rows).toBeGreaterThan(1000);
});
