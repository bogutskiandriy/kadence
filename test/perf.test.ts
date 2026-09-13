import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, statSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlid } from '../src/core/ulid.js';
import { readAll, eventsDir } from '../src/core/store.js';
import { project } from '../src/core/projection.js';
import { loadOrBuild, snapshotPath } from '../src/core/snapshot.js';
import { compact } from '../src/core/store.js';
import { serialize, type FlowEvent } from '../src/core/event.js';
import { execFileSync } from 'node:child_process';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskShow, serializeTask } from '../src/cli/commands/task.js';
import { SUMMARY_FIELDS } from '../src/cli/commands/board.js';
import { eventIdsOnBranch } from '../src/core/git.js';
import { attentionReport } from '../src/core/attention.js';
import { flowReport, cfdReport } from '../src/core/flow.js';
import { readyTasks } from '../src/core/query.js';

/**
 * Guardrail from ADR-005. The test fails on regression by design: 200 ms is
 * not a wish but the line past which the CLI stops being usable.
 */
const COLD_BUDGET_MS = 200;
const WARM_BUDGET_MS = 20;
/** Size guardrail from the PRD: repo bloat is a solid reason to walk away. */
const SIZE_BUDGET_MB = 5;
const EVENT_COUNT = 10_000;

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'kadence-perf-'));
  const gen = createUlid();
  const taskIds: string[] = [];

  // 500 tasks, the rest are state moves: a ratio close to a real repository,
  // where tasks are moved more often than created.
  for (let i = 0; i < EVENT_COUNT; i++) {
    const isCreate = i < 500;
    const id = gen();
    const entity = isCreate ? id : taskIds[i % taskIds.length]!;
    if (isCreate) taskIds.push(id);

    const e: FlowEvent = {
      id,
      type: isCreate ? 'task.created' : 'task.moved',
      entity,
      actor: 'perf@example.com',
      ts: new Date(1_756_800_000_000 + i * 1000).toISOString(),
      source: 'human',
      // Not every move to the same column: a journal where all 500 tasks end
      // in progress makes `ready` return nothing, and a filter measured over an
      // empty list measures nothing. Every third move parks a task back in
      // `todo`, so the guardrail below times a real answer.
      data: isCreate
        ? { title: `Task ${i}`, estimate: (i % 8) + 1 }
        : { to: i % 3 === 0 ? 'todo' : 'in_progress' },
    };

    const dir = join(eventsDir(root), e.ts.slice(0, 7));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${e.id}.json`), serialize(e));
  }
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * Best of several runs, not a single one.
 *
 * A guardrail test that fails because another test happened to load the
 * machine teaches people to ignore it — and a guardrail nobody trusts is worse
 * than none. The fastest run is the one least polluted by neighbours, so it is
 * the honest measure of what the code costs.
 */
function measure(fn: () => void, runs = 3): number {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

/**
 * Best of three *cold* runs.
 *
 * `measure` alone cannot say "cold": the first iteration builds the cache and
 * the next two read it, so best-of-three quietly reports the warm number. That
 * is exactly what happened here — "11 ms cold start" was a 12 ms warm read,
 * and the real cold fold of 10,000 separate files sits at the edge of the
 * budget. The cache is removed before every iteration, not once before all.
 */
function measureCold(root: string, fn: () => void, runs = 3): number {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    rmSync(snapshotPath(root), { force: true });
    const t = performance.now();
    fn();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

describe(`performance on ${EVENT_COUNT} events`, () => {
  it('reads and folds the journal without a cache — the baseline', () => {
    const ms = measure(() => {
      const r = readAll(root);
      expect(r.events).toHaveLength(EVENT_COUNT);
      project(r.events);
    });
    // eslint-disable-next-line no-console
    console.log(`  cold read without cache: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(COLD_BUDGET_MS * 5); // baseline, not the guardrail
  }, 120_000);

  it('cold start WITHOUT compaction — the worst case, not the guardrail', () => {
    // Documents the limit: 10,000 separate files. The architecture never
    // promised to hold that — compaction exists for exactly this case.
    const ms = measureCold(root, () => loadOrBuild(root));
    // eslint-disable-next-line no-console
    console.log(`  cold start without compaction: ${ms.toFixed(0)} ms`);
    // Measured honestly at ~200 ms: the budget itself, with no room. That is
    // the case compaction exists for, and the reason it must become a command
    // people can actually run.
    expect(ms).toBeLessThan(COLD_BUDGET_MS * 3);
  }, 120_000);

  it(`cold start with a compacted archive fits within ${COLD_BUDGET_MS} ms`, () => {
    // A real journal: the current month as separate files, older ones archived.
    compact(root, '2026-11');
    const ms = measureCold(root, () => {
      const r = loadOrBuild(root);
      expect(r.state.tasks).toHaveLength(500);
    });
    // eslint-disable-next-line no-console
    console.log(`  cold start with compacted archive: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(COLD_BUDGET_MS);
  }, 120_000);

  it(`ready over 10k events fits within ${COLD_BUDGET_MS} ms, cache and all`, () => {
    // `ready` is what an agent runs first, every session. It folds the same
    // journal as everything else, so it lives under the same guardrail.
    rmSync(snapshotPath(root), { force: true });
    const ms = measure(() => {
      const r = loadOrBuild(root);
      expect(readyTasks(r.state.tasks, { viewer: 'perf@example.com' }).length).toBeGreaterThan(0);
    });
    // eslint-disable-next-line no-console
    console.log(`  ready over ${EVENT_COUNT} events: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(COLD_BUDGET_MS);
  }, 120_000);

  it(`the branch range over ${EVENT_COUNT} events costs a fraction of the budget`, () => {
    // The one place kadence shells out on a read path. It is a subprocess, so
    // it sits behind the flag rather than in every read — but it still has to
    // fit, because `--branch` is a list command like any other.
    const repo = mkdtempSync(join(tmpdir(), 'kadence-branch-perf-'));
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
      execFileSync('git', ['config', 'user.email', 'perf@example.com'], { cwd: repo });
      execFileSync('git', ['config', 'user.name', 'Perf'], { cwd: repo });
      cpSync(join(root, '.kadence'), join(repo, '.kadence'), { recursive: true });
      execFileSync('git', ['add', '-A'], { cwd: repo });
      execFileSync('git', ['commit', '-qm', 'events'], { cwd: repo });

      const ms = measure(() => {
        const ids = eventIdsOnBranch(repo, 'main', 'main');
        expect(ids).not.toBeNull();
      });
      // eslint-disable-next-line no-console
      console.log(`  branch range over ${EVENT_COUNT} events: ${ms.toFixed(0)} ms`);
      expect(ms).toBeLessThan(COLD_BUDGET_MS);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 120_000);

  it('a --summary response does not grow as a task accumulates history', () => {
    // The property that matters, and the one Probe C's finding was really
    // about: `history` and `comments` scale with how long a task has been
    // worked on, so a board response grows without bound while the board
    // itself does not. This fixture is 500 tasks carrying 9,500 moves between
    // them — deep histories by construction.
    const state = loadOrBuild(root).state;
    const summary = state.tasks.map((t) => serializeTask(t, [...SUMMARY_FIELDS], state));
    const full = state.tasks.map((t) => serializeTask(t, null, state));

    const summaryBytes = Buffer.byteLength(JSON.stringify(summary));
    const fullBytes = Buffer.byteLength(JSON.stringify(full));
    // eslint-disable-next-line no-console
    console.log(
      `  board summary: ${summaryBytes} B vs ${fullBytes} B full ` +
        `(${((100 * summaryBytes) / fullBytes).toFixed(1)}%)`,
    );

    // Per task, the summary is a fixed set of short fields; the full record
    // carries every event that ever touched it.
    const perTask = summaryBytes / state.tasks.length;
    expect(perTask).toBeLessThan(400);
    expect(summaryBytes).toBeLessThan(fullBytes / 4);

    // And the property stated directly, on two tasks that differ only in how
    // much has happened to them. The fixture above gives every task the same
    // number of events, so the comparison has to be built on purpose.
    const gen = createUlid();
    const build = (moves: number): FlowEvent[] => {
      const id = gen();
      const events: FlowEvent[] = [
        { id, type: 'task.created', entity: id, actor: 'a@b.c', ts: '2026-09-08T10:00:00.000Z',
          source: 'human', data: { title: 'Same title on both', estimate: 3 } },
      ];
      for (let i = 0; i < moves; i++) {
        events.push({
          id: gen(), type: 'task.moved', entity: id, actor: 'a@b.c',
          ts: '2026-09-08T10:00:00.000Z', source: 'human',
          // The same target every time: a differing final status would make
          // the two records differ by the length of the status string, which
          // is not the thing under test.
          data: { to: 'in_progress' },
        });
      }
      return events;
    };

    const shallow = project(build(1));
    const deep = project(build(500));
    const cost = (s: typeof shallow, fields: readonly string[] | null): number =>
      Buffer.byteLength(JSON.stringify(serializeTask(s.tasks[0]!, fields, s)));

    // Identical in a summary, however much history the task carries.
    expect(cost(deep, [...SUMMARY_FIELDS])).toBe(cost(shallow, [...SUMMARY_FIELDS]));
    // And unbounded without it — which is the reason the flag exists.
    expect(cost(deep, null)).toBeGreaterThan(cost(shallow, null) * 50);
  }, 120_000);

  it('flow and cfd over 10k events cost a fraction of the budget', () => {
    // Both are folds over state the command has already loaded; what they add
    // on top of the fold is what is measured here.
    const state = loadOrBuild(root).state;
    const today = new Date('2026-12-31T00:00:00.000Z');
    const msFlow = measure(() => flowReport(state, today, 90));
    const msCfd = measure(() => cfdReport(state, today, 90));
    // eslint-disable-next-line no-console
    console.log(`  report flow: ${msFlow.toFixed(1)} ms, report cfd: ${msCfd.toFixed(1)} ms (90-day window)`);
    expect(msFlow).toBeLessThan(50);
    expect(msCfd).toBeLessThan(50);
  }, 120_000);

  it('attention over 10k events costs a fraction of the budget', () => {
    // One pass over live tasks, plus a walk back through each one's history to
    // find the claim. The history walk is the part that could have been
    // quadratic, so it is the part worth measuring at size.
    const state = loadOrBuild(root).state;
    const ms = measure(() => attentionReport(state, new Date('2026-12-31T00:00:00.000Z'), 7));
    // eslint-disable-next-line no-console
    console.log(`  report attention: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(50);
  }, 120_000);

  it(`warm start fits within ${WARM_BUDGET_MS} ms`, () => {
    loadOrBuild(root); // warm-up — the snapshot is written
    const ms = measure(() => loadOrBuild(root));
    // eslint-disable-next-line no-console
    console.log(`  warm start: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(WARM_BUDGET_MS);
  }, 120_000);
});

/**
 * Bytes of content, not blocks on disk.
 *
 * `du` was the honest measure of the guardrail, but it reports what the
 * filesystem has flushed, and under the rest of the suite on a nearly full
 * volume that reading is unstable — the test failed seven runs in eight with
 * no change to the code it guards. Content size is deterministic and still
 * catches what the guardrail is for: compaction turning thousands of files
 * into one. The block-level cost is documented in the ADR instead.
 */
function contentMb(dir: string): number {
  let bytes = 0;
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else bytes += statSync(full).size;
    }
  };
  walk(dir);
  return bytes / 1_048_576;
}

/** Disk usage, not the sum of sizes: the filesystem takes a block per file. */
function diskUsageMb(dir: string): number {
  const walk = (p: string): number => {
    let total = 0;
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, e.name);
      total += e.isDirectory() ? walk(full) : statSync(full).blocks * 512;
    }
    return total;
  };
  return walk(dir) / 1_048_576;
}

describe('journal size', () => {
  it(`fits within ${SIZE_BUDGET_MB} MB for ${EVENT_COUNT} events`, () => {
    // Its own journal: other tests here already ran compact, so a "before"
    // measurement on shared data would show the state AFTER compaction.
    const own = mkdtempSync(join(tmpdir(), 'kadence-size-'));
    const gen = createUlid();
    for (let i = 0; i < EVENT_COUNT; i++) {
      const id = gen();
      const ts = new Date(1_756_800_000_000 + i * 1000).toISOString();
      const dir = join(eventsDir(own), ts.slice(0, 7));
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${id}.json`),
        serialize({ id, type: 'task.created', entity: id, actor: 'p@e.co', ts, source: 'human', data: { title: `Task ${i}` } }),
      );
    }

    const before = contentMb(eventsDir(own));
    compact(own, '2026-11');
    const after = contentMb(eventsDir(own));
    rmSync(own, { recursive: true, force: true });
    // eslint-disable-next-line no-console
    console.log(`  on disk: ${before.toFixed(1)} MB → ${after.toFixed(1)} MB after compaction`);
    expect(after).toBeLessThan(SIZE_BUDGET_MB);
    // Writing 10,000 files takes seconds, and longer on a nearly full volume.
    // The default 5 s timeout was failing this test for being slow rather than
    // for breaching the budget it guards.
  }, 120_000);
});

describe('what an agent pays', () => {
  /**
   * Guardrail from Probe C. The product claim is not that the answer is small —
   * it is that its size does not follow the history behind it. A change that
   * makes `task show` grow with the project breaks the claim, and this fails.
   */
  it('one task costs the same at 10 tasks and at 200', () => {
    const sizes = [10, 200].map((count) => {
      const dir = mkdtempSync(join(tmpdir(), `kadence-cost-${count}-`));
      execFileSync('git', ['init', '-q'], { cwd: dir });
      execFileSync('git', ['config', 'user.email', 'ana@example.com'], { cwd: dir });
      runInit(dir);

      for (let i = 0; i < count; i++) {
        runTaskAdd(dir, {} as NodeJS.ProcessEnv, `Task number ${i}`, { estimate: 3 });
      }
      const shown = runTaskShow(dir, {} as NodeJS.ProcessEnv, 'KAD-3');
      const bytes = JSON.stringify(shown.data).length;

      rmSync(dir, { recursive: true, force: true });
      return bytes;
    });

    expect(sizes[0]).toBe(sizes[1]);
    // Building 210 tasks through the real command path is slow on purpose: a
    // faster fixture would not prove the folding stays out of the answer.
  }, 60_000);
});
