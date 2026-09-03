import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The core is synchronous (ADR-005) and so are the tests — parallelism only across files.
    pool: 'forks',
    // Tests that spawn the real binary need it built first; relying on a
    // leftover dist/ makes the suite pass for the wrong reason.
    globalSetup: ['test/setup/build.ts'],
  },
});
