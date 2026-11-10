// Unit tests for the console's plain TypeScript logic (router, formatting, grouping, API client). Screens are
// thin and are checked by running the console. Run from apps/console (pnpm does).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
