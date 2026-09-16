import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The North Star instrument (T54): a maintainer script, not product code.
 *
 * It is spawned rather than imported — it is plain JavaScript outside the
 * compiled bundle, and spawning tests the entry point the weekly check-in
 * actually runs. No test here touches the network: `--search` is the only
 * mode that calls `gh`, and the log is appended from a saved search result.
 */

const SCRIPT = resolve('scripts/north-star.mjs');
const DAY = 86_400_000;
const INIT = Date.parse('2026-08-01T09:00:00.000Z');
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let counter = 0;
/** A valid ULID whose time part is `time` — ordering comes from the ULID (I2). */
function ulidAt(time: number): string {
  let t = time;
  let head = '';
  for (let i = 0; i < 10; i++) {
    head = ALPHABET[t % 32] + head;
    t = Math.floor(t / 32);
  }
  let n = counter++;
  let tail = '';
  for (let i = 0; i < 16; i++) {
    tail = ALPHABET[n % 32] + tail;
    n = Math.floor(n / 32);
  }
  return head + tail;
}

function event(time: number, actor: string, source: 'human' | 'agent' = 'human') {
  const id = ulidAt(time);
  return {
    id,
    type: 'task.created',
    entity: id,
    actor,
    ts: new Date(time).toISOString(),
    source,
    data: { title: 't' },
  };
}

function writeEvent(root: string, e: ReturnType<typeof event>): void {
  const dir = join(root, '.kadence', 'events', e.ts.slice(0, 7));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${e.id}.json`), JSON.stringify(e));
}

function writeArchive(root: string, month: string, events: ReturnType<typeof event>[]): void {
  const dir = join(root, '.kadence', 'events', 'archive');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${month}.json`), JSON.stringify(events));
}

function run(args: string[]) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

function local(root: string, now: number) {
  const r = run(['--local', root, '--json', '--now', new Date(now).toISOString()]);
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout);
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kadence-north-star-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('north-star --local', () => {
  it('counts a repository with two authors that is at least 14 days old', () => {
    writeEvent(root, event(INIT, 'ann@example.com'));
    writeEvent(root, event(INIT + 3 * DAY, 'bob@example.com'));
    writeEvent(root, event(INIT + 16 * DAY, 'bob@example.com'));

    const repo = local(root, INIT + 20 * DAY);

    expect(repo.authors).toEqual(['ann@example.com', 'bob@example.com']);
    expect(repo.ageDays).toBe(20);
    expect(repo.firstEvent).toBe('2026-08-01T09:00:00.000Z');
    expect(repo.northStar).toBe(true);
  });

  it('does not count two authors before day 14 — the repository has not reached it yet', () => {
    writeEvent(root, event(INIT, 'ann@example.com'));
    writeEvent(root, event(INIT + DAY, 'bob@example.com'));

    const repo = local(root, INIT + 10 * DAY);

    expect(repo.authors).toHaveLength(2);
    expect(repo.reachedDay14).toBe(false);
    expect(repo.northStar).toBe(false);
  });

  it('does not count a single author, however old the journal is', () => {
    writeEvent(root, event(INIT, 'ann@example.com'));
    writeEvent(root, event(INIT + 30 * DAY, 'ann@example.com'));

    const repo = local(root, INIT + 40 * DAY);

    expect(repo.reachedDay14).toBe(true);
    expect(repo.northStar).toBe(false);
  });

  it('separates authors seen by day 14 from authors still writing after it', () => {
    writeEvent(root, event(INIT, 'ann@example.com'));
    writeEvent(root, event(INIT + 2 * DAY, 'bob@example.com'));
    writeEvent(root, event(INIT + 15 * DAY, 'ann@example.com'));

    const repo = local(root, INIT + 20 * DAY);

    expect(repo.authorsByDay14).toEqual(['ann@example.com', 'bob@example.com']);
    expect(repo.authorsAfterDay14).toEqual(['ann@example.com']);
  });

  it('counts the same email as one author whether a human or an agent wrote the event', () => {
    writeEvent(root, event(INIT, 'ann@example.com', 'human'));
    writeEvent(root, event(INIT + 15 * DAY, 'Ann@Example.com ', 'agent'));

    const repo = local(root, INIT + 20 * DAY);

    expect(repo.authors).toEqual(['ann@example.com']);
    expect(repo.sources).toEqual({ human: 1, agent: 1 });
    expect(repo.northStar).toBe(false);
  });

  it('reads compacted archives, and takes init from the archived first event', () => {
    const archived = [event(INIT, 'ann@example.com'), event(INIT + DAY, 'bob@example.com')];
    writeArchive(root, '2026-08', archived);
    // The same event both archived and loose — a merge can leave that — counts once.
    writeEvent(root, archived[1]!);
    writeEvent(root, event(INIT + 45 * DAY, 'ann@example.com'));

    const repo = local(root, INIT + 50 * DAY);

    expect(repo.events).toBe(3);
    expect(repo.firstEvent).toBe('2026-08-01T09:00:00.000Z');
    expect(repo.northStar).toBe(true);
  });

  it('orders by ULID, not ts — a skewed clock does not move init (I2)', () => {
    writeEvent(root, event(INIT, 'ann@example.com'));
    const skewed = event(INIT + 5 * DAY, 'bob@example.com');
    skewed.ts = '2020-01-01T00:00:00.000Z'; // bob's clock is wrong
    writeEvent(root, skewed);

    const repo = local(root, INIT + 20 * DAY);

    expect(repo.firstEvent).toBe('2026-08-01T09:00:00.000Z');
  });

  it('skips a corrupted file and says so, rather than failing the check-in', () => {
    writeEvent(root, event(INIT, 'ann@example.com'));
    writeFileSync(join(root, '.kadence', 'events', '2026-08', 'broken.json'), '{not json');

    const repo = local(root, INIT + 20 * DAY);

    expect(repo.events).toBe(1);
    expect(repo.corrupted).toBe(1);
  });

  it('fails with a clear message when there is no journal', () => {
    const r = run(['--local', root, '--json']);

    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no \.kadence\/events/);
  });
});

describe('north-star --append', () => {
  const searchResult = {
    date: '2026-09-16',
    queries: ['path:.kadence/events'],
    candidates: 3,
    repos: [
      { repo: 'a/one', reachedDay14: true, northStar: true },
      { repo: 'b/two', reachedDay14: true, northStar: false },
      { repo: 'c/three', reachedDay14: false, northStar: false },
    ],
    notes: ['code search indexed 0 dot-directories'],
  };

  it('creates the log with a header and writes one dated row', () => {
    const log = join(root, 'north-star-log.md');
    const saved = join(root, 'run.json');
    writeFileSync(saved, JSON.stringify(searchResult));

    const r = run(['--append', '--from', saved, '--log', log]);

    expect(r.status).toBe(0);
    const text = readFileSync(log, 'utf8');
    expect(text).toMatch(/^# North Star log/m);
    expect(text).toContain('| 2026-09-16 | 3 | 2 | 1 | — | code search indexed 0 dot-directories |');
  });

  it('adds a row on a second run and never rewrites the first', () => {
    const log = join(root, 'north-star-log.md');
    const saved = join(root, 'run.json');
    writeFileSync(saved, JSON.stringify(searchResult));
    run(['--append', '--from', saved, '--log', log]);
    const first = readFileSync(log, 'utf8');

    writeFileSync(saved, JSON.stringify({ ...searchResult, date: '2026-09-23', repos: [], notes: [] }));
    run(['--append', '--from', saved, '--log', log]);
    const second = readFileSync(log, 'utf8');

    expect(second.startsWith(first)).toBe(true);
    expect(second.trimEnd().split('\n').at(-1)).toBe('| 2026-09-23 | 0 | 0 | 0 | — | — |');
  });

  it('refuses to append without a search result, so no row is invented', () => {
    const log = join(root, 'north-star-log.md');

    const r = run(['--append', '--log', log]);

    expect(r.status).toBe(2);
    expect(existsSync(log)).toBe(false);
  });
});
