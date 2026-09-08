import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The core is synchronous (ADR-005) and so are the tests — parallelism only across files.
    pool: 'forks',
    /**
     * Capped deliberately, and the cap is free.
     *
     * Most of this suite spawns the built binary as a real process, often dozens
     * of times per file. Vitest defaults to one fork per core, so on a loaded
     * machine the forks starve each other: measured 2026-09-08, the same green
     * suite produced 3–7 failures per run, every one of them
     * "Test timed out in 5000ms" after the test had sat there for ~18 minutes.
     * Nothing was wrong with the code — the files pass in seconds when run alone.
     *
     * Capping costs nothing because the bottleneck is process spawning, not fork
     * parallelism: 2 → 18 s, 4 → 16 s, 6 → 17 s, all 428 passing. Four matches
     * the performance cores here and is at or above what CI runners give us, so
     * it is not a cap there at all.
     */
    poolOptions: { forks: { maxForks: 4 } },
    // Tests that spawn the real binary need it built first; relying on a
    // leftover dist/ makes the suite pass for the wrong reason.
    globalSetup: ['test/setup/build.ts'],
  },
});
