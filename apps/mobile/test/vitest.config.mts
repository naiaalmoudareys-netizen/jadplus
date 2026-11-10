// Unit tests for the app's plain TypeScript logic (API client, session, formatting). Screens are thin and
// are checked by running the app; React Native modules are never imported by tested files.
// Run from apps/mobile (pnpm does), so paths are relative to it.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
