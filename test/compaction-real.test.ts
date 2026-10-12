import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compact, readAll } from '../src/core/store.js';
import { project } from '../src/core/projection.js';

/**
 * Compaction on a real journal, not a synthetic one (G5, PRD R6.6, KAD-87).
 *
 * Every other compaction test writes its own events: a handful in
 * compaction.test.ts, ten thousand identical moves in perf.test.ts. Neither has
 * what a journal accumulates by living — documents with revisions, decisions
 * that supersede, claims contested and released, events for a task that
 * arrives later in ULID order. The largest real journal there is is this
 * repository's own, so that is what gets compacted: a copy, all of it, every
 * month into its archive, and then held to the state it folded to before.
 */

const SOURCE = resolve('.kadence');
const CLI = resolve('dist/cli.js');
let dir: string;

/** Every event file under the source and its size: proof it was not touched. */
function sourceFiles(): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[full] = statSync(full).size;
    }
  };
  walk(join(SOURCE, 'events'));
  return out;
}

function run(args: string[]): { stdout: string; stderr: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

let before: Record<string, number>;

beforeAll(() => {
  before = sourceFiles();
  dir = mkdtempSync(join(tmpdir(), 'kadence-compact-real-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  // The cache stays behind: it is derived (I6), and the copy must earn its
  // state from the events alone.
  cpSync(SOURCE, join(dir, '.kadence'), {
    recursive: true,
    filter: (src) => !src.endsWith('state.json'),
  });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('compacting this repository’s own journal', () => {
  it('is a journal worth the name', () => {
    // A floor, not a pin: it only grows. Below this it would no longer be the
    // test this file says it is.
    expect(readAll(dir).events.length).toBeGreaterThan(1_000);
  });

  it(
    'folds to the same state after every month is archived (I1)',
    () => {
      const read = readAll(dir);
      const folded = JSON.stringify(project(read.events));
      const board = run(['board', '--json', '--history']).stdout;
      const months = readdirSync(join(dir, '.kadence', 'events')).filter((m) => /^\d{4}-\d{2}$/.test(m));

      // Past any month a journal can hold: every month goes into its archive,
      // whatever the date the suite runs on.
      const result = compact(dir, '9999-12');

      expect(result.skipped).toEqual([]);
      expect(result.archivedMonths.sort()).toEqual(months.sort());
      expect(result.archivedEvents).toBe(read.events.length);

      const after = readAll(dir);
      expect(after.corrupted).toEqual([]);
      expect(after.events.length).toBe(read.events.length);
      expect(JSON.stringify(project(after.events))).toBe(folded);
      expect(run(['board', '--json', '--history']).stdout).toBe(board);
    },
    60_000,
  );

  it('reads cleanly to doctor afterwards, and the cache it writes agrees', () => {
    const first = JSON.parse(run(['doctor', '--json']).stdout);
    expect(first.ok).toBe(true);
    expect(first.events.damaged).toEqual([]);

    const second = JSON.parse(run(['doctor', '--json']).stdout);
    expect(second.cache).toMatchObject({ before: 'fresh', agreed: true });
  });

  it('never touched the journal it was copied from', () => {
    expect(sourceFiles()).toEqual(before);
  });
});
