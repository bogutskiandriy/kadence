import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';
import { createUlid } from '../src/core/ulid.js';

/**
 * Labels move as deltas, because a set is not a value (ADR-013).
 *
 * This was the one field where "every intent preserved" was false: the whole
 * array went into `task.updated`, the fold replaced the whole array, and two
 * branches labelling one task silently kept one label. The merge proof lives in
 * `test/integration/merge.test.ts`; what is checked here is the mechanism that
 * makes it true, and the promise that yesterday's journals still fold the same.
 */

const CLI = resolve('dist/cli.js');
let dir: string;

function run(args: string[]): { stdout: string; stderr: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

function labels(ref = 'KAD-1'): string[] {
  return JSON.parse(run(['task', 'show', ref, '--json']).stdout).task.labels;
}

/** Every event in the journal, oldest first. */
function journal(): FlowEvent[] {
  const root = join(dir, '.kadence', 'events');
  const out: FlowEvent[] = [];
  for (const month of readdirSync(root)) {
    const monthDir = join(root, month);
    for (const f of readdirSync(monthDir)) {
      if (f.endsWith('.json')) out.push(JSON.parse(readFileSync(join(monthDir, f), 'utf8')) as FlowEvent);
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

const types = (): string[] => journal().map((e) => e.type);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-labels-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run(['init']);
  run(['task', 'add', 'Shared task', '--label', 'area-auth', '--label', 'stale']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('task edit and labels', () => {
  it('adds one label and leaves the rest alone', () => {
    expect(run(['task', 'edit', 'KAD-1', '--add-label', 'impact-critical']).code).toBe(0);

    expect(labels().sort()).toEqual(['area-auth', 'impact-critical', 'stale']);
  });

  it('removes one label and leaves the rest alone', () => {
    run(['task', 'edit', 'KAD-1', '--remove-label', 'stale']);

    expect(labels().sort()).toEqual(['area-auth']);
  });

  it('takes several of each in one edit', () => {
    run([
      'task', 'edit', 'KAD-1',
      '--add-label', 'impact-high', '--add-label', 'area-billing',
      '--remove-label', 'stale',
    ]);

    expect(labels().sort()).toEqual(['area-auth', 'area-billing', 'impact-high']);
  });

  it('keeps --label meaning "the set becomes exactly this"', () => {
    run(['task', 'edit', 'KAD-1', '--label', 'only-this']);

    expect(labels()).toEqual(['only-this']);
  });

  it('writes what changed, never the resulting set', () => {
    run(['task', 'edit', 'KAD-1', '--label', 'area-auth', '--label', 'impact-critical']);

    // `stale` left, `impact-critical` joined, `area-auth` was already there.
    expect(types().filter((t) => t.startsWith('task.label'))).toEqual([
      'task.label_removed',
      'task.label_added',
    ]);
    expect(journal().some((e) => e.type === 'task.updated' && 'labels' in (e.data ?? {}))).toBe(false);
  });

  it('writes nothing when the labels already say that', () => {
    const before = journal().length;
    const r = run(['task', 'edit', 'KAD-1', '--add-label', 'stale']);

    expect(r.code).toBe(0);
    expect(journal().length).toBe(before);
  });

  it('refuses to add and remove the same label in one breath', () => {
    const r = run(['task', 'edit', 'KAD-1', '--add-label', 'x', '--remove-label', 'x', '--json']);

    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).error.code).toBe('invalid_argument');
  });

  it('refuses --label together with --add-label — they say different things', () => {
    const r = run(['task', 'edit', 'KAD-1', '--label', 'a', '--add-label', 'b', '--json']);

    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).error.code).toBe('invalid_argument');
    expect(labels().sort()).toEqual(['area-auth', 'stale']);
  });

  it('ignores an empty or whitespace-only label rather than writing one', () => {
    const before = journal().length;
    run(['task', 'edit', 'KAD-1', '--add-label', '   ']);

    expect(journal().length).toBe(before);
    expect(labels().sort()).toEqual(['area-auth', 'stale']);
  });

  it('keeps the scalars in one event and each label in its own', () => {
    run(['task', 'edit', 'KAD-1', '--priority', 'high', '--add-label', 'impact-high']);

    const written = types().filter((t) => t === 'task.updated' || t.startsWith('task.label'));
    expect(written).toEqual(['task.updated', 'task.label_added']);
  });

  it('writes no task.updated at all when only labels change', () => {
    run(['task', 'edit', 'KAD-1', '--remove-label', 'stale']);

    expect(types().filter((t) => t === 'task.updated')).toEqual([]);
  });

  it('still records the starting set on task.created — creation has no second writer', () => {
    const created = journal().find((e) => e.type === 'task.created')!;

    expect(created.data!['labels']).toEqual(['area-auth', 'stale']);
  });
});

describe('journals written before ADR-013', () => {
  it('still fold to exactly what they folded before', () => {
    // I6: deleting `state.json` changes nothing. That promise is worthless if
    // replaying an old journal gives a different answer, so the whole-set form
    // is still read even though nothing writes it any more.
    const gen = createUlid();
    const id = gen();
    const ev = (type: string, data: Record<string, unknown>): FlowEvent =>
      ({ id: gen(), type, entity: id, actor: 'a@b.c', ts: '2026-09-01T10:00:00.000Z', source: 'human', data }) as FlowEvent;

    const state = project([
      { id, type: 'task.created', entity: id, actor: 'a@b.c', ts: '2026-09-01T10:00:00.000Z', source: 'human', data: { title: 'Old', labels: ['one'] } },
      ev('task.updated', { labels: ['two', 'three'] }),
    ]);

    expect(state.tasks[0]!.labels).toEqual(['two', 'three']);
  });

  it('let a new delta edit an old whole-set value', () => {
    const gen = createUlid();
    const id = gen();
    const ev = (type: string, data: Record<string, unknown>): FlowEvent =>
      ({ id: gen(), type, entity: id, actor: 'a@b.c', ts: '2026-09-01T10:00:00.000Z', source: 'human', data }) as FlowEvent;

    const state = project([
      { id, type: 'task.created', entity: id, actor: 'a@b.c', ts: '2026-09-01T10:00:00.000Z', source: 'human', data: { title: 'Old' } },
      ev('task.updated', { labels: ['one', 'two'] }),
      ev('task.label_removed', { label: 'one' }),
      ev('task.label_added', { label: 'three' }),
    ]);

    expect(state.tasks[0]!.labels).toEqual(['two', 'three']);
  });
});
