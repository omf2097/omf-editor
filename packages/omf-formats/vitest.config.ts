import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Each worker is a Node process of a few hundred MB; the default (one per
    // core) can exhaust a laptop's memory. VITEST_MAX_WORKERS overrides it.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 8),
    testTimeout: 60_000,
  },
});
