import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The core is synchronous (ADR-005) and so are the tests — parallelism only across files.
    pool: 'forks',
    /**
     * Capped deliberately.
     *
     * Most of this suite spawns the built binary as a real process, often dozens
     * of times per file. Vitest defaults to one worker per core, so on a loaded
     * machine they starve each other: measured 2026-09-08, the same green suite
     * produced 3–7 failures per run, every one of them "Test timed out in
     * 5000ms" after the test had sat there for minutes. Nothing was wrong with
     * the code — every one of those files passes in seconds when run alone.
     *
     * `maxWorkers`, not `poolOptions`: Vitest 4 removed the latter, and the
     * first version of this cap was written in the old shape, so it did nothing
     * at all. The deprecation warning in a publish log is what caught it.
     *
     * Four, measured on 8 cores: wall time barely moves (16.0 s uncapped,
     * 16.8 s here), but the summed per-test duration drops from 96.6 s to
     * 59.8 s — the same tests, each starved less. That sum is what the 5 s
     * per-test budget is spent against, so it is the number that matters.
     * Two is a real cost: 29.4 s wall, nearly double.
     */
    maxWorkers: 4,
    // Tests that spawn the real binary need it built first; relying on a
    // leftover dist/ makes the suite pass for the wrong reason.
    globalSetup: ['test/setup/build.ts'],
  },
});
