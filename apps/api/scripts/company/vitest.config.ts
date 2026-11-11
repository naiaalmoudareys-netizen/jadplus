/**
 * Runs the demo-company generator (generate.task.ts) with the same TypeScript loading as the API tests, so it can
 * drive the real app in memory. Used by `pnpm db:demo:company` only; `pnpm test` never runs it.
 */
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: join(import.meta.dirname, '..', '..'),
    include: ['scripts/company/generate.task.ts'],
    execArgv: ['--disable-warning=ExperimentalWarning'],
    testTimeout: 900_000,
  },
});
