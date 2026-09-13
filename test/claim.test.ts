import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project } from '../src/core/projection.js';
import type { FlowEvent, EventType } from '../src/core/event.js';
import { createUlid } from '../src/core/ulid.js';
import { runInit } from '../src/cli/commands/init.js';
import {
  runTaskAdd,
  runTaskClaim,
  runTaskRelease,
  runTaskMove,
  runTaskShow,
} from '../src/cli/commands/task.js';

/**
 * Claims (ADR-011). The rule under test is not "one claim wins" — it is that
 * the same events fold to the same owner whatever order the files arrive in,
 * and that the loser is reported rather than dropped.
 */

const nextId = createUlid();
const TASK = nextId();

function ev(
  type: EventType,
  actor: string,
  data: Record<string, unknown> = {},
  entity = TASK,
): FlowEvent {
  return {
    id: nextId(),
    type,
    entity,
    actor,
    ts: '2026-09-09T10:00:00.000Z',
    source: 'human',
    data,
  };
}

const created = (): FlowEvent => ({
  id: TASK,
  type: 'task.created',
  entity: TASK,
  actor: 'alice@example.com',
  ts: '2026-09-09T09:00:00.000Z',
  source: 'human',
  data: { title: 'Shared task' },
});

/** Every permutation of a small event list — I1 is a claim about all of them. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([item, ...tail]);
  });
  return out;
}

describe('claim fold', () => {
  it('records the claimant, not the actor who wrote the event', () => {
    // An agent may claim on behalf of a person: `by` is the owner, `actor` the writer.
    const events = [created(), ev('task.claimed', 'agent@example.com', { by: 'alice@example.com' })];
    const task = project(events).tasks[0]!;
    expect(task.claimedBy).toBe('alice@example.com');
    expect(task.contestedBy).toEqual([]);
  });

  it('falls back to the actor when `by` is absent', () => {
    const task = project([created(), ev('task.claimed', 'bob@example.com')]).tasks[0]!;
    expect(task.claimedBy).toBe('bob@example.com');
  });

  it('gives the task to the earliest claim by ULID, in every read order', () => {
    const first = ev('task.claimed', 'alice@example.com');
    const second = ev('task.claimed', 'bob@example.com');
    for (const order of permutations([created(), first, second])) {
      const task = project(order).tasks[0]!;
      expect(task.claimedBy).toBe('alice@example.com');
      expect(task.contestedBy).toEqual(['bob@example.com']);
    }
  });

  it('keeps the losing claim in history rather than discarding it', () => {
    const events = [created(), ev('task.claimed', 'alice@example.com'), ev('task.claimed', 'bob@example.com')];
    const task = project(events).tasks[0]!;
    expect(task.history.filter((h) => h.type === 'task.claimed')).toHaveLength(2);
  });

  it('reports every contesting actor once, however many times they claim', () => {
    const events = [
      created(),
      ev('task.claimed', 'alice@example.com'),
      ev('task.claimed', 'bob@example.com'),
      ev('task.claimed', 'bob@example.com'),
      ev('task.claimed', 'carol@example.com'),
    ];
    const task = project(events).tasks[0]!;
    expect(task.contestedBy).toEqual(['bob@example.com', 'carol@example.com']);
  });

  it('treats a repeated claim by the holder as a no-op', () => {
    const events = [
      created(),
      ev('task.claimed', 'alice@example.com'),
      ev('task.claimed', 'alice@example.com'),
    ];
    const task = project(events).tasks[0]!;
    expect(task.claimedBy).toBe('alice@example.com');
    expect(task.contestedBy).toEqual([]);
  });

  it('clears the claim when the holder releases it', () => {
    const events = [
      created(),
      ev('task.claimed', 'alice@example.com'),
      ev('task.released', 'alice@example.com'),
    ];
    const task = project(events).tasks[0]!;
    expect(task.claimedBy).toBeNull();
    expect(task.claimedAt).toBeNull();
  });

  it('lets a contesting actor withdraw without touching the holder', () => {
    const events = [
      created(),
      ev('task.claimed', 'alice@example.com'),
      ev('task.claimed', 'bob@example.com'),
      ev('task.released', 'bob@example.com'),
    ];
    const task = project(events).tasks[0]!;
    expect(task.claimedBy).toBe('alice@example.com');
    expect(task.contestedBy).toEqual([]);
  });

  it('ignores a release from someone who never held the claim', () => {
    const events = [
      created(),
      ev('task.claimed', 'alice@example.com'),
      ev('task.released', 'carol@example.com'),
    ];
    expect(project(events).tasks[0]!.claimedBy).toBe('alice@example.com');
  });

  it('frees the task when the holder releases a contested claim', () => {
    // The next claim then wins outright, so the contest ends rather than
    // silently promoting someone who does not know they now own the work.
    const events = [
      created(),
      ev('task.claimed', 'alice@example.com'),
      ev('task.claimed', 'bob@example.com'),
      ev('task.released', 'alice@example.com'),
    ];
    const task = project(events).tasks[0]!;
    expect(task.claimedBy).toBeNull();
    expect(task.contestedBy).toEqual([]);
  });

  it('clears the claim when the work is done, cancelled or deleted', () => {
    const done = project([
      created(),
      ev('task.claimed', 'alice@example.com'),
      ev('task.moved', 'alice@example.com', { to: 'done' }),
    ]).tasks[0]!;
    expect(done.claimedBy).toBeNull();

    const cancelled = project([
      created(),
      ev('task.claimed', 'alice@example.com'),
      ev('task.cancelled', 'alice@example.com'),
    ]).tasks[0]!;
    expect(cancelled.claimedBy).toBeNull();
  });

  it('keeps the claim through a move that is not the end of the work', () => {
    const task = project([
      created(),
      ev('task.claimed', 'alice@example.com'),
      ev('task.moved', 'alice@example.com', { to: 'in_progress' }),
    ]).tasks[0]!;
    expect(task.claimedBy).toBe('alice@example.com');
  });

  it('lets a task be claimed again after it is reopened and released', () => {
    const task = project([
      created(),
      ev('task.claimed', 'alice@example.com'),
      ev('task.moved', 'alice@example.com', { to: 'done' }),
      ev('task.reopened', 'bob@example.com'),
      ev('task.claimed', 'bob@example.com'),
    ]).tasks[0]!;
    expect(task.claimedBy).toBe('bob@example.com');
    expect(task.contestedBy).toEqual([]);
  });

  it('names the earliest claim even when it arrives before the task is merged', () => {
    // The ULIDs are written by hand, and that is the point: a claim whose id
    // sorts BELOW the create is deferred and replayed after every other event,
    // so a fold that trusts arrival order gives the task to the wrong person.
    // Reachable rather than theoretical — clocks disagree between machines, so
    // a lagging clock produces exactly this id ordering (I2).
    const create = '01AAAAAAAAAAAAAAAAAAAAAAAA';
    const lower = '01AAAAAAAAAAAAAAAAAAAAAAA0';
    const higher = '01AAAAAAAAAAAAAAAAAAAAAAAB';
    const at = '2026-09-09T10:00:00.000Z';
    const events: FlowEvent[] = [
      { id: create, type: 'task.created', entity: create, actor: 'main@example.com', ts: at, source: 'human', data: { title: 'Shared task' } },
      { id: lower, type: 'task.claimed', entity: create, actor: 'alice@example.com', ts: at, source: 'human', data: { by: 'alice@example.com' } },
      { id: higher, type: 'task.claimed', entity: create, actor: 'bob@example.com', ts: at, source: 'human', data: { by: 'bob@example.com' } },
    ];

    for (const order of permutations(events)) {
      const task = project(order).tasks[0]!;
      expect(task.claimedBy).toBe('alice@example.com');
      expect(task.contestedBy).toEqual(['bob@example.com']);
    }
  });

  it('clears a claim released after the task was merged out of order', () => {
    const create = '01BBBBBBBBBBBBBBBBBBBBBBBB';
    const claim = '01BBBBBBBBBBBBBBBBBBBBBBB0';
    const release = '01BBBBBBBBBBBBBBBBBBBBBBB1';
    const at = '2026-09-09T10:00:00.000Z';
    const task = project([
      { id: create, type: 'task.created', entity: create, actor: 'main@example.com', ts: at, source: 'human', data: { title: 'T' } },
      { id: release, type: 'task.released', entity: create, actor: 'alice@example.com', ts: at, source: 'human', data: { by: 'alice@example.com' } },
      { id: claim, type: 'task.claimed', entity: create, actor: 'alice@example.com', ts: at, source: 'human', data: { by: 'alice@example.com' } },
    ]).tasks[0]!;
    // The claim sorts before the release, so it is taken and then given back.
    expect(task.claimedBy).toBeNull();
  });
});

describe('claim commands', () => {
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-claim-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
    runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('claims a task by label and says the merge is where a race shows up', () => {
    runTaskAdd(dir, env, 'First', {});
    const r = runTaskClaim(dir, env, 'KAD-1', {});
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.message).toMatch(/merge/i);
    expect((r.data!['task'] as { claimedBy: string }).claimedBy).toBe('tester@example.com');
  });

  it('takes the first ready task when no reference is given', () => {
    runTaskAdd(dir, env, 'First', {});
    runTaskAdd(dir, env, 'Second', { priority: 'urgent' });
    const r = runTaskClaim(dir, env, undefined, {});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/Second/);
  });

  it('explains that there is nothing to claim rather than failing silently', () => {
    const r = runTaskClaim(dir, env, undefined, {});
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('nothing_ready');
    expect(r.error!.hint).toMatch(/kadence/);
  });

  it('reports a claim already held by someone else as contested, and does not refuse it', () => {
    runTaskAdd(dir, env, 'First', {});
    runTaskClaim(dir, env, 'KAD-1', {});
    execFileSync('git', ['config', 'user.email', 'other@example.com'], { cwd: dir });
    const r = runTaskClaim(dir, env, 'KAD-1', {});
    expect(r.ok).toBe(true);
    expect(r.warnings!.join(' ')).toMatch(/contested/i);
    const shown = runTaskShow(dir, env, 'KAD-1');
    expect((shown.data!['task'] as { contestedBy: string[] }).contestedBy).toEqual([
      'other@example.com',
    ]);
  });

  it('is a no-op when you claim what you already hold', () => {
    runTaskAdd(dir, env, 'First', {});
    runTaskClaim(dir, env, 'KAD-1', {});
    const r = runTaskClaim(dir, env, 'KAD-1', {});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/already/i);
  });

  it('refuses to claim a finished task, naming the state and not the argument', () => {
    // The reference was understood; the state is what refuses. An agent that
    // sees `invalid_argument` would go looking for a typo it did not make.
    runTaskAdd(dir, env, 'First', {});
    runTaskMove(dir, env, 'KAD-1', 'done');
    const r = runTaskClaim(dir, env, 'KAD-1', {});
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('conflicting_state');
    expect(r.exitCode).toBe(1);
  });

  it('writes nothing when you claim a task you already contest', () => {
    runTaskAdd(dir, env, 'First', {});
    runTaskClaim(dir, env, 'KAD-1', {});
    execFileSync('git', ['config', 'user.email', 'other@example.com'], { cwd: dir });
    runTaskClaim(dir, env, 'KAD-1', {});
    const again = runTaskClaim(dir, env, 'KAD-1', {});
    expect(again.ok).toBe(true);
    expect(again.message).toMatch(/already/i);
    const shown = runTaskShow(dir, env, 'KAD-1');
    const claims = (shown.data!['task'] as { history: Array<{ type: string }> }).history.filter(
      (h) => h.type === 'task.claimed',
    );
    expect(claims).toHaveLength(2);
  });

  it('reports every contesting name, not only the caller', () => {
    runTaskAdd(dir, env, 'First', {});
    runTaskClaim(dir, env, 'KAD-1', {});
    execFileSync('git', ['config', 'user.email', 'bob@example.com'], { cwd: dir });
    runTaskClaim(dir, env, 'KAD-1', {});
    execFileSync('git', ['config', 'user.email', 'carol@example.com'], { cwd: dir });
    const r = runTaskClaim(dir, env, 'KAD-1', {});
    const reported = (r.data!['task'] as { contestedBy: string[] }).contestedBy;
    const folded = (runTaskShow(dir, env, 'KAD-1').data!['task'] as { contestedBy: string[] })
      .contestedBy;
    expect(reported).toEqual(folded);
  });

  it('releases a claim and says nothing was held when there was none', () => {
    runTaskAdd(dir, env, 'First', {});
    runTaskClaim(dir, env, 'KAD-1', {});
    expect(runTaskRelease(dir, env, 'KAD-1').ok).toBe(true);
    const second = runTaskRelease(dir, env, 'KAD-1');
    expect(second.ok).toBe(true);
    expect(second.message).toMatch(/not claimed|no claim/i);
  });

  it('fails with a task reference that does not exist', () => {
    const r = runTaskClaim(dir, env, 'KAD-99', {});
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('task_not_found');
  });
});
