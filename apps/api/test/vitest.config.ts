/**
 * Vitest config for the API. Tests run in Node; migration tests use Node's built-in SQLite
 * (docs/adr/0002-data-model.md). Its "experimental" notice is silenced so test output stays warning-free.
 */
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: join(import.meta.dirname, '..'),
    include: ['test/**/*.test.ts'],
    execArgv: ['--disable-warning=ExperimentalWarning'],
  },
});
