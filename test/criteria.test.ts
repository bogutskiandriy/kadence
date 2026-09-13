import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';
import { createUlid } from '../src/core/ulid.js';
import { runInit } from '../src/cli/commands/init.js';
import {
  runTaskAdd,
  runTaskMove,
  runTaskShow,
  runTaskCriterionAdd,
  runTaskCriterionCheck,
  runTaskCriterionList,
} from '../src/cli/commands/task.js';

/**
 * Acceptance criteria: the evidence behind `done`.
 *
 * Today a task is done because someone moved it. A criterion is the smallest
 * thing that turns that into a claim somebody can check. The number is derived
 * at fold time exactly as `KAD-N` is (I7) — storing it would mean two branches
 * that each added a criterion could not merge without renumbering.
 */

const nextId = createUlid();
const TASK = nextId();

function ev(type: string, data: Record<string, unknown> = {}, actor = 'alice@example.com'): FlowEvent {
  return {
    id: nextId(),
    type,
    entity: TASK,
    actor,
    ts: '2026-09-09T10:00:00.000Z',
    source: 'human',
    data,
  } as FlowEvent;
}

const created = (): FlowEvent => ({
  id: TASK,
  type: 'task.created',
  entity: TASK,
  actor: 'alice@example.com',
  ts: '2026-09-09T09:00:00.000Z',
  source: 'human',
  data: { title: 'A task' },
});

describe('criteria fold', () => {
  it('numbers criteria by ULID order, not by arrival', () => {
    const first = ev('task.criterion_added', { text: 'Tests green' });
    const second = ev('task.criterion_added', { text: 'Docs updated' });
    const forward = project([created(), first, second]).tasks[0]!.criteria;
    const backward = project([second, first, created()]).tasks[0]!.criteria;

    expect(forward.map((c) => c.n)).toEqual([1, 2]);
    expect(forward.map((c) => c.text)).toEqual(['Tests green', 'Docs updated']);
    expect(backward).toEqual(forward);
  });

  it('starts every criterion unchecked, with nobody credited', () => {
    const c = project([created(), ev('task.criterion_added', { text: 'Tests green' })]).tasks[0]!
      .criteria[0]!;
    expect(c.checked).toBe(false);
    expect(c.checkedBy).toBeNull();
  });

  it('checks and unchecks by the criterion id, and records who did it', () => {
    const added = ev('task.criterion_added', { text: 'Tests green' });
    const checked = project([
      created(),
      added,
      ev('task.criterion_checked', { criterion: added.id }, 'bob@example.com'),
    ]).tasks[0]!.criteria[0]!;
    expect(checked.checked).toBe(true);
    expect(checked.checkedBy).toBe('bob@example.com');

    const unchecked = project([
      created(),
      added,
      ev('task.criterion_checked', { criterion: added.id }, 'bob@example.com'),
      ev('task.criterion_unchecked', { criterion: added.id }, 'carol@example.com'),
    ]).tasks[0]!.criteria[0]!;
    expect(unchecked.checked).toBe(false);
    expect(unchecked.checkedBy).toBeNull();
  });

  it('ignores a check for a criterion that is not there', () => {
    const task = project([
      created(),
      ev('task.criterion_added', { text: 'Tests green' }),
      ev('task.criterion_checked', { criterion: '01ZZZZZZZZZZZZZZZZZZZZZZZZ' }),
    ]).tasks[0]!;
    expect(task.criteria[0]!.checked).toBe(false);
  });

  it('keeps a criterion added on another branch after the task was checked off', () => {
    // Both survive: dropping the later one would make the checklist depend on
    // merge order, which is the same rule cycles and claims follow.
    const a = ev('task.criterion_added', { text: 'From main' });
    const b = ev('task.criterion_added', { text: 'From the branch' });
    const task = project([created(), a, ev('task.moved', { to: 'done' }), b]).tasks[0]!;
    expect(task.criteria).toHaveLength(2);
    expect(task.status).toBe('done');
  });

  it('applies a check that carries a lower ULID than the criterion it names', () => {
    // Two machines, one lagging clock: the check sorts before the add, so a
    // fold that acts as events arrive would drop it and the box would read
    // unchecked forever.
    const A = '01AAAAAAAAAAAAAAAAAAAAAAAA';
    const B = '01BBBBBBBBBBBBBBBBBBBBBBBB';
    const D = '01DDDDDDDDDDDDDDDDDDDDDDDD';
    const at = '2026-09-09T10:00:00.000Z';
    const mk = (id: string, type: string, data: Record<string, unknown>): FlowEvent =>
      ({ id, type, entity: A, actor: 'bob@example.com', ts: at, source: 'human', data }) as FlowEvent;

    const events: FlowEvent[] = [
      mk(A, 'task.created', { title: 'T' }),
      mk(B, 'task.criterion_checked', { criterion: D }),
      mk(D, 'task.criterion_added', { text: 'tests green' }),
    ];
    for (const order of [events, [...events].reverse()]) {
      const c = project(order).tasks[0]!.criteria[0]!;
      expect(c.checked).toBe(true);
      expect(c.checkedBy).toBe('bob@example.com');
    }
  });

  it('drops a criterion with no text rather than showing an empty line', () => {
    const task = project([created(), ev('task.criterion_added', {})]).tasks[0]!;
    expect(task.criteria).toEqual([]);
  });
});

describe('criteria commands', () => {
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-ac-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
    runInit(dir);
    runTaskAdd(dir, env, 'Ship the thing', {});
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('adds a criterion and lists it with its number', () => {
    expect(runTaskCriterionAdd(dir, env, 'KAD-1', 'Tests green').ok).toBe(true);
    const r = runTaskCriterionList(dir, env, 'KAD-1');
    expect(r.message).toMatch(/1\./);
    expect(r.message).toMatch(/Tests green/);
  });

  it('refuses an empty criterion', () => {
    const r = runTaskCriterionAdd(dir, env, 'KAD-1', '   ');
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
  });

  it('checks by number and reports how many are done', () => {
    runTaskCriterionAdd(dir, env, 'KAD-1', 'Tests green');
    runTaskCriterionAdd(dir, env, 'KAD-1', 'Docs updated');
    const r = runTaskCriterionCheck(dir, env, 'KAD-1', '1', false);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/1 of 2/);
  });

  it('says which numbers exist when given one that does not', () => {
    runTaskCriterionAdd(dir, env, 'KAD-1', 'Tests green');
    const r = runTaskCriterionCheck(dir, env, 'KAD-1', '7', false);
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
    expect(r.message).toMatch(/1/);
  });

  it('writes nothing when the criterion is already in that state', () => {
    runTaskCriterionAdd(dir, env, 'KAD-1', 'Tests green');
    runTaskCriterionCheck(dir, env, 'KAD-1', '1', false);
    const again = runTaskCriterionCheck(dir, env, 'KAD-1', '1', false);
    expect(again.ok).toBe(true);
    expect(again.message).toMatch(/already/i);
    const shown = runTaskShow(dir, env, 'KAD-1');
    const history = (shown.data!['task'] as { history: Array<{ type: string }> }).history;
    expect(history.filter((h) => h.type === 'task.criterion_checked')).toHaveLength(1);
  });

  it('warns on the way to done, and moves the task anyway', () => {
    runTaskCriterionAdd(dir, env, 'KAD-1', 'Tests green');
    const r = runTaskMove(dir, env, 'KAD-1', 'done');
    expect(r.ok).toBe(true);
    expect(r.warnings!.join(' ')).toMatch(/1 of 1 .*unchecked|unchecked/i);
    const shown = runTaskShow(dir, env, 'KAD-1');
    expect((shown.data!['task'] as { status: string }).status).toBe('done');
  });

  it('does not warn when every criterion is checked', () => {
    runTaskCriterionAdd(dir, env, 'KAD-1', 'Tests green');
    runTaskCriterionCheck(dir, env, 'KAD-1', '1', false);
    const r = runTaskMove(dir, env, 'KAD-1', 'done');
    expect((r.warnings ?? []).join(' ')).not.toMatch(/unchecked/i);
  });

  it('always returns an array in --json, even with no criteria', () => {
    const r = runTaskShow(dir, env, 'KAD-1');
    expect((r.data!['task'] as { criteria: unknown[] }).criteria).toEqual([]);

    runTaskCriterionAdd(dir, env, 'KAD-1', 'Tests green');
    runTaskCriterionCheck(dir, env, 'KAD-1', '1', false);
    const after = runTaskShow(dir, env, 'KAD-1');
    expect((after.data!['task'] as { criteria: unknown[] }).criteria).toEqual([
      { n: 1, text: 'Tests green', checked: true, checkedBy: 'tester@example.com' },
    ]);
  });

  it('fails on a task that does not exist', () => {
    expect(runTaskCriterionAdd(dir, env, 'KAD-9', 'x').error!.code).toBe('task_not_found');
  });
});
