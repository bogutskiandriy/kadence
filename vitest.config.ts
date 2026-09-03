import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The core is synchronous (ADR-005) and so are the tests — parallelism only across files.
    pool: 'forks',
  },
});
