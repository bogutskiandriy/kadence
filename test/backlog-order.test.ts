import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskList } from '../src/cli/commands/task.js';
import { runTaskRank } from '../src/cli/commands/task.js';
import { runReady } from '../src/cli/commands/ready.js';
import { rankBetween } from '../src/core/rank.js';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';

/**
 * The Product Backlog is ordered (Scrum Guide 2020), and ordering it is the
 * Product Owner's main instrument. Four priority levels are a sort key, not
 * an order: the fifth "high" task has no place relative to the fourth.
 */

describe('rankBetween', () => {
  it('gives a key strictly between two others', () => {
    const a = rankBetween(null, null);
    const b = rankBetween(a, null);
    const mid = rankBetween(a, b);
    expect(a < mid && mid < b).toBe(true);
  });

  it('keeps finding room at the front, a hundred times over', () => {
    // The common case: "this one goes first" on every planning session.
    let first = rankBetween(null, null);
    for (let i = 0; i < 100; i++) {
      const next = rankBetween(null, first);
      expect(next < first).toBe(true);
      expect(next.endsWith('0')).toBe(false);
      first = next;
    }
  });

  it('keeps finding room between two neighbours that keep closing in', () => {
    let lo = rankBetween(null, null);
    let hi = rankBetween(lo, null);
    for (let i = 0; i < 100; i++) {
      const mid = rankBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      if (i % 2 === 0) lo = mid;
      else hi = mid;
    }
  });
});

describe('order in the fold', () => {
  const ev = (id: string, type: string, entity: string, data: Record<string, unknown>): FlowEvent =>
    ({ id, type, entity, actor: 'a@x', ts: '2026-10-31T10:00:00.000Z', source: 'human', data }) as FlowEvent;
  const T1 = '01M60000000000000000000001';
  const T2 = '01M60000000000000000000002';
  const created = [
    ev(T1, 'task.created', T1, { title: 'one' }),
    ev(T2, 'task.created', T2, { title: 'two' }),
  ];

  it('two branches ranking one task agree on the result, whatever the read order', () => {
    const a = ev('01M60000000000000000000010', 'task.ranked', T1, { rank: 'h' });
    const b = ev('01M60000000000000000000011', 'task.ranked', T1, { rank: 'c' });
    for (const order of [[...created, a, b], [b, ...created, a], [a, b, ...created].reverse()]) {
      const t = project(order).tasks.find((x) => x.id === T1)!;
      expect(t.rank).toBe('c');
    }
  });

  it('a task never ranked has no rank, not an empty one', () => {
    expect(project(created).tasks[0]!.rank).toBeNull();
  });
});

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-order-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'po@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const readyLabels = (): string[] =>
  (runReady(dir, env, { json: true }).data!['tasks'] as Array<Record<string, unknown>>).map(
    (t) => t['label'] as string,
  );

describe('task rank', () => {
  beforeEach(() => {
    runTaskAdd(dir, env, 'Urgent but not next', { priority: 'urgent' });
    runTaskAdd(dir, env, 'Normal', {});
    runTaskAdd(dir, env, 'Low', { priority: 'low' });
  });

  it('without any rank, ready keeps its priority order', () => {
    expect(readyLabels()).toEqual(['KAD-1', 'KAD-2', 'KAD-3']);
  });

  it('--top puts a task first in ready, above any priority', () => {
    const r = runTaskRank(dir, env, 'KAD-3', { top: true });
    expect(r.ok).toBe(true);
    expect(readyLabels()).toEqual(['KAD-3', 'KAD-1', 'KAD-2']);
  });

  it('ranked tasks come before unranked ones; the unranked keep priority order', () => {
    runTaskRank(dir, env, 'KAD-2', { top: true });
    expect(readyLabels()).toEqual(['KAD-2', 'KAD-1', 'KAD-3']);
  });

  it('--bottom goes after every ranked task, still before the unranked', () => {
    runTaskRank(dir, env, 'KAD-3', { top: true });
    runTaskRank(dir, env, 'KAD-2', { bottom: true });
    expect(readyLabels()).toEqual(['KAD-3', 'KAD-2', 'KAD-1']);
  });

  it('--before and --after place it next to another ranked task', () => {
    runTaskRank(dir, env, 'KAD-1', { top: true });
    runTaskRank(dir, env, 'KAD-2', { bottom: true });
    runTaskRank(dir, env, 'KAD-3', { before: 'KAD-2' });
    expect(readyLabels()).toEqual(['KAD-1', 'KAD-3', 'KAD-2']);

    runTaskRank(dir, env, 'KAD-1', { after: 'KAD-2' });
    expect(readyLabels()).toEqual(['KAD-3', 'KAD-2', 'KAD-1']);
  });

  it('--after a task with no place in the order fails and says how to give it one', () => {
    const r = runTaskRank(dir, env, 'KAD-1', { after: 'KAD-3' });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('kadence task rank KAD-3 --bottom');
  });

  it('needs exactly one position', () => {
    expect(runTaskRank(dir, env, 'KAD-1', {}).ok).toBe(false);
    expect(runTaskRank(dir, env, 'KAD-1', { top: true, bottom: true }).ok).toBe(false);
  });

  it('a task cannot be placed relative to itself', () => {
    runTaskRank(dir, env, 'KAD-1', { top: true });
    expect(runTaskRank(dir, env, 'KAD-1', { before: 'KAD-1' }).ok).toBe(false);
  });

  it('task list --sort rank lists the backlog in its order', () => {
    runTaskRank(dir, env, 'KAD-3', { top: true });
    const tasks = runTaskList(dir, env, { sort: 'rank', json: true }).data!['tasks'] as Array<Record<string, unknown>>;
    expect(tasks.map((t) => t['label'])).toEqual(['KAD-3', 'KAD-1', 'KAD-2']);
  });
});
