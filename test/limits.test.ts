import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_LIST_LIMIT } from '../src/agent/contract.js';

/**
 * Why a list command stops at a number.
 *
 * Not speed. An agent's tool output is cut at roughly 25k tokens, and it is cut
 * *silently*: what comes back parses, looks whole, and is missing most of the
 * board — so the agent answers on a fraction while believing it saw everything.
 * A response that always fits, always carries its real total, and says where
 * the next page starts is one an agent can act on.
 *
 * `--limit 0` is the escape hatch for a human at a terminal, where truncation
 * is visible and harmless.
 */

const CLI = resolve('dist/cli.js');
let dir: string;

function run(args: string[]): { stdout: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], {
    cwd: dir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, KADENCE_SOURCE: 'agent' },
  });
  return { stdout: r.stdout, code: r.status ?? -1 };
}
const json = (args: string[]): Record<string, unknown> => JSON.parse(run([...args, '--json']).stdout);

/** Two past the limit, so "capped" and "returned whole" cannot be confused. */
const OVER = DEFAULT_LIST_LIMIT + 2;

/**
 * Events straight to disk.
 *
 * Seeding through the CLI means one process per record, which is eleven
 * seconds for a hundred of them — slow enough to read as a product failure
 * when it is a fixture. The journal is plain files; writing them is the point.
 */
let seq = 0;
function seed(type: string, data: Record<string, unknown>): string {
  const id = `01M6${String(seq++).padStart(10, '0')}${'0'.repeat(12)}`;
  const monthDir = join(dir, '.kadence', 'events', '2026-09');
  mkdirSync(monthDir, { recursive: true });
  writeFileSync(
    join(monthDir, `${id}.json`),
    `${JSON.stringify({
      id,
      type,
      entity: id,
      actor: 'tester@example.com',
      ts: '2026-09-02T10:00:00.000Z',
      source: 'human',
      data,
    })}\n`,
  );
  return id;
}
const seedTasks = (n: number): void => {
  for (let i = 1; i <= n; i++) seed('task.created', { title: `Task ${i}` });
};

beforeEach(() => {
  seq = 0;
  dir = mkdtempSync(join(tmpdir(), 'kadence-limits-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run(['init']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('task list', () => {
  beforeEach(() => seedTasks(OVER));

  it(`returns at most ${DEFAULT_LIST_LIMIT} without being asked`, () => {
    expect((json(['task', 'list'])['tasks'] as unknown[]).length).toBe(DEFAULT_LIST_LIMIT);
  });

  it('says how many there really are, so the agent knows it saw a slice', () => {
    const r = json(['task', 'list']);
    expect(r['tasksTotal']).toBe(OVER);
    expect(r['tasksOffset']).toBe(0);
  });

  it('honours a smaller --limit', () => {
    expect((json(['task', 'list', '--limit', '5'])['tasks'] as unknown[]).length).toBe(5);
  });

  it('--limit 0 returns everything', () => {
    const r = json(['task', 'list', '--limit', '0']);
    expect((r['tasks'] as unknown[]).length).toBe(OVER);
    expect(r['tasksTotal']).toBe(OVER);
  });

  it('--offset walks to the next page, and the pages do not overlap', () => {
    const first = json(['task', 'list', '--limit', '10']);
    const second = json(['task', 'list', '--limit', '10', '--offset', '10']);
    const idOf = (r: Record<string, unknown>): string[] =>
      (r['tasks'] as Array<{ id: string }>).map((t) => t.id);

    expect(idOf(second)).toHaveLength(10);
    expect(second['tasksOffset']).toBe(10);
    expect(idOf(first).some((id) => idOf(second).includes(id))).toBe(false);
  });

  it('an offset past the end is an empty page, not an error', () => {
    const r = json(['task', 'list', '--offset', String(OVER + 50)]);
    expect(r['ok']).toBe(true);
    expect(r['tasksTotal']).toBe(OVER);
  });

  it('a negative limit is refused before any work', () => {
    const r = json(['task', 'list', '--limit', '-1']);
    expect(r['ok']).toBe(false);
    expect((r['error'] as { code: string }).code).toBe('invalid_argument');
  });

  it('counts what matched the filters, not the whole board', () => {
    const r = json(['task', 'list', '--search', 'Task 7']);
    expect(r['tasksTotal']).toBe((r['tasks'] as unknown[]).length);
    expect(r['tasksTotal']).toBeLessThan(OVER);
  });
});

describe('board', () => {
  beforeEach(() => seedTasks(OVER));

  it(`carries at most ${DEFAULT_LIST_LIMIT} tasks across every column`, () => {
    const columns = json(['board'])['columns'] as Record<string, unknown[]>;
    expect(Object.values(columns).reduce((n, c) => n + c.length, 0)).toBe(DEFAULT_LIST_LIMIT);
  });

  it('says how many tasks the board really holds', () => {
    expect(json(['board'])['tasksTotal']).toBe(OVER);
  });

  it('--limit 0 returns the whole board', () => {
    const columns = json(['board', '--limit', '0'])['columns'] as Record<string, unknown[]>;
    expect(Object.values(columns).reduce((n, c) => n + c.length, 0)).toBe(OVER);
  });
});

describe('ready', () => {
  it(`stops at ${DEFAULT_LIST_LIMIT} and reports the total`, () => {
    seedTasks(OVER);
    const r = json(['ready']);
    expect((r['tasks'] as unknown[]).length).toBe(DEFAULT_LIST_LIMIT);
    expect(r['tasksTotal']).toBe(OVER);
  });
});

describe('decision list', () => {
  it(`stops at ${DEFAULT_LIST_LIMIT} and reports the total`, () => {
    for (let i = 1; i <= OVER; i++) {
      seed('decision.recorded', { title: `Decision ${i}`, why: 'Because' });
    }
    const r = json(['decision', 'list']);
    expect((r['decisions'] as unknown[]).length).toBe(DEFAULT_LIST_LIMIT);
    expect(r['decisionsTotal']).toBe(OVER);
  });
});

describe('note list', () => {
  it(`stops at ${DEFAULT_LIST_LIMIT} and reports the total`, () => {
    for (let i = 1; i <= OVER; i++) seed('note.recorded', { text: `Note ${i}` });
    const r = json(['note', 'list']);
    expect((r['notes'] as unknown[]).length).toBe(DEFAULT_LIST_LIMIT);
    expect(r['notesTotal']).toBe(OVER);
  });
});

describe('doc list', () => {
  it('reports a total even when nothing is capped', () => {
    run(['doc', 'add', 'A document', '--body', 'text']);
    const r = json(['doc', 'list']);
    expect((r['documents'] as unknown[]).length).toBe(1);
    expect(r['documentsTotal']).toBe(1);
  });
});

describe('the cap is the reason it exists', () => {
  it('keeps a full list response inside an agent tool budget', () => {
    for (let i = 1; i <= OVER; i++) {
      seed('task.created', {
        title: `Task number ${i} with a title of the length titles actually are`,
      });
    }
    const bytes = Buffer.byteLength(run(['task', 'list', '--json']).stdout);
    // 25k tokens is roughly 100 KB. A lean list at the cap must sit under it; a
    // repository with long descriptions can still pass it before the cap bites,
    // which is what the total and a smaller --limit are for.
    expect(bytes).toBeLessThan(102_400);
  });
});
