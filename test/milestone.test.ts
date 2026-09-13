import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';
import { createUlid } from '../src/core/ulid.js';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove, runTaskShow } from '../src/cli/commands/task.js';
import {
  runMilestoneCreate,
  runMilestoneAdd,
  runMilestoneList,
  runMilestoneClose,
} from '../src/cli/commands/milestone.js';

/**
 * Milestones group by outcome, where epics group by structure and sprints by
 * time. A task carries at most one, as a field beside `sprint` — not a third
 * hierarchy, because two parallel hierarchies drift and one cannot.
 */

const gen = createUlid();

function ev(type: string, entity: string, data: Record<string, unknown> = {}): FlowEvent {
  return {
    id: gen(),
    type,
    entity,
    actor: 'alice@example.com',
    ts: '2026-09-09T10:00:00.000Z',
    source: 'human',
    data,
  } as FlowEvent;
}

function created(name: string): FlowEvent {
  const id = gen();
  return { ...ev('milestone.created', id, { name }), id, entity: id };
}

describe('milestone fold', () => {
  it('numbers milestones from ULID order, like every other label', () => {
    const a = created('1.0');
    const b = created('Launch');
    const forward = project([a, b]).milestones;
    const backward = project([b, a]).milestones;
    expect(forward.map((m) => m.label)).toEqual(['MS-1', 'MS-2']);
    expect(backward.map((m) => [m.label, m.name])).toEqual(forward.map((m) => [m.label, m.name]));
  });

  it('a task carries at most one milestone; a later assignment replaces it', () => {
    const first = created('1.0');
    const second = created('2.0');
    const taskId = gen();
    const state = project([
      { ...ev('task.created', taskId, { title: 'T' }), id: taskId },
      first,
      second,
      ev('milestone.task_added', first.id, { task: taskId }),
      ev('milestone.task_added', second.id, { task: taskId }),
    ]);
    expect(state.tasks[0]!.milestone).toBe(second.id);
    expect(state.milestones.find((m) => m.id === first.id)!.taskIds).toEqual([]);
  });

  it('counts progress in points, done over total', () => {
    const ms = created('1.0');
    const a = gen();
    const b = gen();
    const state = project([
      { ...ev('task.created', a, { title: 'A', estimate: 3 }), id: a },
      { ...ev('task.created', b, { title: 'B', estimate: 5 }), id: b },
      ms,
      ev('milestone.task_added', ms.id, { task: a }),
      ev('milestone.task_added', ms.id, { task: b }),
      ev('task.moved', a, { to: 'done' }),
    ]);
    const m = state.milestones[0]!;
    expect(m.donePoints).toBe(3);
    expect(m.totalPoints).toBe(8);
  });

  it('closes once, first write by ULID wins', () => {
    const ms = created('1.0');
    const state = project([ms, ev('milestone.closed', ms.id), ev('milestone.closed', ms.id)]);
    expect(state.milestones[0]!.status).toBe('closed');
    expect(state.rejected.filter((e) => e.type === 'milestone.closed')).toHaveLength(1);
  });

  it('holds a membership whose task has not merged yet, instead of losing it', () => {
    // Reachable rather than theoretical: clocks disagree between machines, so
    // an assignment written on a lagging clock carries a lower ULID than the
    // `task.created` it names. Dropping it would lose the grouping silently.
    const A = '01AAAAAAAAAAAAAAAAAAAAAAAA';
    const B = '01BBBBBBBBBBBBBBBBBBBBBBBB';
    const D = '01DDDDDDDDDDDDDDDDDDDDDDDD';
    const at = '2026-09-09T10:00:00.000Z';
    const mk = (id: string, type: string, entity: string, data: Record<string, unknown>): FlowEvent =>
      ({ id, type, entity, actor: 'a@b.c', ts: at, source: 'human', data }) as FlowEvent;

    const state = project([
      mk(A, 'milestone.created', A, { name: '1.0' }),
      mk(B, 'milestone.task_added', A, { task: D }),
      mk(D, 'task.created', D, { title: 'T', estimate: 3 }),
    ]);
    expect(state.tasks[0]!.milestone).toBe(A);
    expect(state.milestones[0]!.taskIds).toEqual([D]);
    expect(state.milestones[0]!.totalPoints).toBe(3);
  });

  it('holds a close whose milestone has not merged yet', () => {
    const A = '01AAAAAAAAAAAAAAAAAAAAAAAA';
    const B = '01BBBBBBBBBBBBBBBBBBBBBBBB';
    const at = '2026-09-09T10:00:00.000Z';
    const closed: FlowEvent = {
      id: B, type: 'milestone.closed', entity: A, actor: 'a@b.c', ts: at, source: 'human', data: {},
    };
    // Surfaced, not vanished: it appears in `pending` until the branch lands.
    const alone = project([closed]);
    expect(alone.milestones).toHaveLength(0);
    expect(alone.pending).toHaveLength(1);

    // And it takes effect once the milestone arrives, whatever the ULID order.
    const together = project([
      closed,
      { id: A, type: 'milestone.created', entity: A, actor: 'a@b.c', ts: at, source: 'human', data: { name: '1.0' } },
    ]);
    expect(together.milestones[0]!.status).toBe('closed');
  });

  it('drops a task reference that no longer exists', () => {
    const ms = created('1.0');
    const taskId = gen();
    const state = project([
      { ...ev('task.created', taskId, { title: 'T' }), id: taskId },
      ms,
      ev('milestone.task_added', ms.id, { task: taskId }),
      ev('task.deleted', taskId),
    ]);
    expect(state.milestones[0]!.taskIds).toEqual([]);
  });
});

describe('milestone commands', () => {
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-ms-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
    runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('creates one and lists it with its progress', () => {
    expect(runMilestoneCreate(dir, env, '1.0', {}).ok).toBe(true);
    const r = runMilestoneList(dir, env, {});
    expect(r.message).toMatch(/1\.0/);
    expect(r.message).toMatch(/MS-1/);
  });

  it('refuses an empty name', () => {
    expect(runMilestoneCreate(dir, env, '  ', {}).error!.code).toBe('invalid_argument');
  });

  it('takes a due date and reports it', () => {
    runMilestoneCreate(dir, env, '1.0', { due: '2026-12-01' });
    expect(runMilestoneList(dir, env, { json: true }).data!['milestones']).toEqual([
      expect.objectContaining({ label: 'MS-1', name: '1.0', due: '2026-12-01' }),
    ]);
  });

  it('rejects a due date that is not a date', () => {
    expect(runMilestoneCreate(dir, env, '1.0', { due: 'soon' }).error!.code).toBe(
      'invalid_argument',
    );
  });

  it('adds a task by label and shows the milestone on the task', () => {
    runMilestoneCreate(dir, env, '1.0', {});
    runTaskAdd(dir, env, 'Ship it', { estimate: 3 });
    const r = runMilestoneAdd(dir, env, 'KAD-1', '1.0');
    expect(r.ok).toBe(true);
    const shown = runTaskShow(dir, env, 'KAD-1').data!['task'] as { milestone: string | null };
    expect(shown.milestone).toBe('MS-1');
  });

  it('accepts the label as well as the name', () => {
    runMilestoneCreate(dir, env, '1.0', {});
    runTaskAdd(dir, env, 'Ship it', {});
    expect(runMilestoneAdd(dir, env, 'KAD-1', 'MS-1').ok).toBe(true);
  });

  it('names the milestones that exist when given one that does not', () => {
    runMilestoneCreate(dir, env, '1.0', {});
    runTaskAdd(dir, env, 'Ship it', {});
    const r = runMilestoneAdd(dir, env, 'KAD-1', 'nope');
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('milestone_not_found');
    expect(r.message).toMatch(/1\.0/);
  });

  it('reports progress in points', () => {
    runMilestoneCreate(dir, env, '1.0', {});
    runTaskAdd(dir, env, 'One', { estimate: 3 });
    runTaskAdd(dir, env, 'Two', { estimate: 5 });
    runMilestoneAdd(dir, env, 'KAD-1', '1.0');
    runMilestoneAdd(dir, env, 'KAD-2', '1.0');
    runTaskMove(dir, env, 'KAD-1', 'done');
    const r = runMilestoneList(dir, env, { json: true });
    expect(r.data!['milestones']).toEqual([
      expect.objectContaining({ donePoints: 3, totalPoints: 8, doneTasks: 1, totalTasks: 2 }),
    ]);
  });

  it('closes a milestone and says so once', () => {
    runMilestoneCreate(dir, env, '1.0', {});
    expect(runMilestoneClose(dir, env, '1.0').ok).toBe(true);
    const again = runMilestoneClose(dir, env, '1.0');
    expect(again.ok).toBe(true);
    expect(again.message).toMatch(/already/i);
  });

  it('says what to do when there are none', () => {
    const r = runMilestoneList(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/milestone create/);
  });
});
