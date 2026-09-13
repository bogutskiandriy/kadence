import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project } from '../src/core/projection.js';
import { readyTasks } from '../src/core/query.js';
import type { FlowEvent, EventType } from '../src/core/event.js';
import { createUlid } from '../src/core/ulid.js';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskBlock, runTaskClaim, runTaskMove } from '../src/cli/commands/task.js';
import { runReady } from '../src/cli/commands/ready.js';

/**
 * `ready` answers the question an agent asks every session: what can I start
 * right now. Everything it excludes, it excludes for a reason a human would
 * give — the work is finished, blocked, or somebody else's.
 */

const nextId = createUlid();

function makeTask(title: string, data: Record<string, unknown> = {}): FlowEvent {
  const id = nextId();
  return {
    id,
    type: 'task.created',
    entity: id,
    actor: 'alice@example.com',
    ts: '2026-09-09T09:00:00.000Z',
    source: 'human',
    data: { title, ...data },
  };
}

function about(task: FlowEvent, type: EventType, data: Record<string, unknown> = {}, actor = 'alice@example.com'): FlowEvent {
  return {
    id: nextId(),
    type,
    entity: task.entity,
    actor,
    ts: '2026-09-09T10:00:00.000Z',
    source: 'human',
    data,
  };
}

describe('readyTasks', () => {
  it('offers open work and leaves out what is finished', () => {
    const open = makeTask('Open');
    const done = makeTask('Done');
    const cancelled = makeTask('Cancelled');
    const state = project([
      open,
      done,
      cancelled,
      about(done, 'task.moved', { to: 'done' }),
      about(cancelled, 'task.cancelled'),
    ]);
    expect(readyTasks(state.tasks).map((t) => t.title)).toEqual(['Open']);
  });

  it('leaves out work that has already started — ready means ready to start', () => {
    const fresh = makeTask('Fresh');
    const started = makeTask('Started');
    const reviewing = makeTask('In review');
    const state = project([
      fresh,
      started,
      reviewing,
      about(started, 'task.moved', { to: 'in_progress' }),
      about(reviewing, 'task.moved', { to: 'in_review' }),
    ]);
    expect(readyTasks(state.tasks).map((t) => t.title)).toEqual(['Fresh']);
  });

  it('leaves out a task parked in the blocked column, blocker links or not', () => {
    const fresh = makeTask('Fresh');
    const parked = makeTask('Parked');
    const state = project([fresh, parked, about(parked, 'task.moved', { to: 'blocked' })]);
    expect(readyTasks(state.tasks).map((t) => t.title)).toEqual(['Fresh']);
  });

  it('offers a task again once it is moved back to a column work can start from', () => {
    const parked = makeTask('Parked');
    const state = project([
      parked,
      about(parked, 'task.moved', { to: 'in_review' }),
      about(parked, 'task.moved', { to: 'todo' }),
    ]);
    expect(readyTasks(state.tasks).map((t) => t.title)).toEqual(['Parked']);
  });

  it('leaves out a task whose blocker is still open', () => {
    const blocker = makeTask('Blocker');
    const blocked = makeTask('Blocked');
    const state = project([
      blocker,
      blocked,
      about(blocked, 'task.blocked_by_added', { blocker: blocker.entity }),
    ]);
    expect(readyTasks(state.tasks).map((t) => t.title)).toEqual(['Blocker']);
  });

  it('offers a task again once every blocker is finished', () => {
    const blocker = makeTask('Blocker');
    const blocked = makeTask('Blocked');
    const state = project([
      blocker,
      blocked,
      about(blocked, 'task.blocked_by_added', { blocker: blocker.entity }),
      about(blocker, 'task.moved', { to: 'done' }),
    ]);
    expect(readyTasks(state.tasks).map((t) => t.title)).toEqual(['Blocked']);
  });

  it('counts a cancelled blocker as satisfied — the work will never arrive', () => {
    const blocker = makeTask('Blocker');
    const blocked = makeTask('Blocked');
    const state = project([
      blocker,
      blocked,
      about(blocked, 'task.blocked_by_added', { blocker: blocker.entity }),
      about(blocker, 'task.cancelled'),
    ]);
    expect(readyTasks(state.tasks).map((t) => t.title)).toContain('Blocked');
  });

  it("leaves out work claimed by somebody else, and keeps back your own", () => {
    const mine = makeTask('Mine');
    const theirs = makeTask('Theirs');
    const state = project([
      mine,
      theirs,
      about(mine, 'task.claimed', {}, 'alice@example.com'),
      about(theirs, 'task.claimed', {}, 'bob@example.com'),
    ]);
    const titles = readyTasks(state.tasks, { viewer: 'alice@example.com' }).map((t) => t.title);
    expect(titles).toEqual(['Mine']);
  });

  it('keeps a contested task in the list, because it needs a person to look at it', () => {
    const task = makeTask('Contested');
    const state = project([
      task,
      about(task, 'task.claimed', {}, 'bob@example.com'),
      about(task, 'task.claimed', {}, 'carol@example.com'),
    ]);
    expect(readyTasks(state.tasks, { viewer: 'alice@example.com' })).toHaveLength(1);
  });

  it('sorts by priority first and age second', () => {
    const old = makeTask('Old normal');
    const urgent = makeTask('Urgent', { priority: 'urgent' });
    const young = makeTask('Young normal');
    const low = makeTask('Low', { priority: 'low' });
    const state = project([old, urgent, young, low]);
    expect(readyTasks(state.tasks).map((t) => t.title)).toEqual([
      'Urgent',
      'Old normal',
      'Young normal',
      'Low',
    ]);
  });

  it('narrows to one person when asked', () => {
    const mine = makeTask('Mine', { assignee: 'alice@example.com' });
    const theirs = makeTask('Theirs', { assignee: 'bob@example.com' });
    const nobody = makeTask('Unassigned');
    const state = project([mine, theirs, nobody]);
    const titles = readyTasks(state.tasks, {
      viewer: 'alice@example.com',
      assignee: 'me',
    }).map((t) => t.title);
    expect(titles).toEqual(['Mine']);
  });
});

describe('runReady', () => {
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-ready-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
    runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('says what to do next when nothing is ready rather than printing nothing', () => {
    const r = runReady(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/task add/);
  });

  it('names the reason a full board still has nothing ready', () => {
    runTaskAdd(dir, env, 'First', {});
    runTaskAdd(dir, env, 'Second', {});
    runTaskBlock(dir, env, 'KAD-2', 'KAD-1', false);
    runTaskClaim(dir, env, 'KAD-1', {});
    execFileSync('git', ['config', 'user.email', 'other@example.com'], { cwd: dir });
    const r = runReady(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/blocked/i);
    expect(r.message).toMatch(/claimed/i);
  });

  it('gives an agent a narrow list, not the whole task record', () => {
    runTaskAdd(dir, env, 'First', { estimate: 3 });
    const r = runReady(dir, env, { json: true });
    const tasks = r.data!['tasks'] as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(1);
    expect(Object.keys(tasks[0]!).sort()).toEqual(
      ['claimedBy', 'contestedBy', 'estimate', 'label', 'labels', 'priority', 'title'].sort(),
    );
    expect(r.data!['schema']).toBe('kadence/v1');
  });

  it('carries the labels, because they are what says how carefully to work', () => {
    // The seventh field, and the reason it earned a place in a list that had
    // six on purpose: a team marks blast radius with a label, and an agent
    // asking "what can I start" was the one caller that could not see it.
    runTaskAdd(dir, env, 'First', { labels: ['impact-critical', 'area-auth'] });
    const tasks = runReady(dir, env, { json: true }).data!['tasks'] as Array<Record<string, unknown>>;

    expect(tasks[0]!['labels']).toEqual(['impact-critical', 'area-auth']);
  });

  it('always carries the field, empty when the task has none', () => {
    // A promised field an agent has to test for absence is not a promise.
    runTaskAdd(dir, env, 'First', {});
    const tasks = runReady(dir, env, { json: true }).data!['tasks'] as Array<Record<string, unknown>>;

    expect(tasks[0]!['labels']).toEqual([]);
  });

  it('drops a task from the list once it is done', () => {
    runTaskAdd(dir, env, 'First', {});
    runTaskMove(dir, env, 'KAD-1', 'done');
    const r = runReady(dir, env, { json: true });
    expect(r.data!['tasks']).toHaveLength(0);
  });
});
