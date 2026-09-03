import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import type { FlowEvent, EventType } from '../src/core/event.js';

const gen = createUlid();

function ev(type: EventType, entity: string, data: Record<string, unknown> = {}): FlowEvent {
  return {
    id: gen(),
    type,
    entity,
    actor: 'tester@example.com',
    ts: '2026-09-02T10:00:00.000Z',
    source: 'human',
    data,
  };
}

function created(title = 'Task'): FlowEvent {
  const id = gen();
  return { ...ev('task.created', id, { title }), id, entity: id };
}

/** Produces permutations — to prove order independence. */
function shuffle<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('project — invariants', () => {
  it('I1: the same event set yields the same state under any read order', () => {
    const a = created('First');
    const b = created('Second');
    const events = [a, b, ev('task.moved', a.entity, { to: 'in_progress' }), ev('task.moved', b.entity, { to: 'done' })];

    const reference = JSON.stringify(project(events).tasks);
    for (let seed = 1; seed <= 50; seed++) {
      expect(JSON.stringify(project(shuffle(events, seed)).tasks)).toBe(reference);
    }
  });

  it('I2: id defines the order, not ts', () => {
    const t = created();
    // The event with the higher ULID has a ts in the past — that machine's clock lagged.
    const first = { ...ev('task.moved', t.entity, { to: 'in_progress' }), ts: '2026-09-02T23:00:00.000Z' };
    const second = { ...ev('task.moved', t.entity, { to: 'done' }), ts: '2026-09-02T01:00:00.000Z' };
    expect(project([t, first, second]).tasks[0]!.status).toBe('done');
  });

  it('I3: a task is in exactly one state', () => {
    const t = created();
    const s = project([t, ev('task.moved', t.entity, { to: 'in_progress' }), ev('task.moved', t.entity, { to: 'done' })]);
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0]!.status).toBe('done');
  });

  it('is a pure function — it does not mutate the input array', () => {
    const t = created();
    const events = [t, ev('task.moved', t.entity, { to: 'done' })];
    const copy = JSON.stringify(events);
    project(events);
    expect(JSON.stringify(events)).toBe(copy);
  });
});

describe('project — concurrent intents', () => {
  it('two branches moved the task differently: the higher ULID wins', () => {
    const t = created();
    const branchA = ev('task.moved', t.entity, { to: 'in_progress' });
    const branchB = ev('task.moved', t.entity, { to: 'done' });
    const s = project([t, branchA, branchB]);
    expect(s.tasks[0]!.status).toBe('done');
  });

  it('the losing event stays in the task history', () => {
    const t = created();
    const lost = ev('task.moved', t.entity, { to: 'in_progress' });
    const won = ev('task.moved', t.entity, { to: 'done' });
    const s = project([t, lost, won]);
    expect(s.tasks[0]!.history.map((h) => h.id)).toContain(lost.id);
  });

  it('an event for an unmerged task is held pending, never lost', () => {
    const orphan = ev('task.moved', gen(), { to: 'done' });
    const s = project([orphan]);
    expect(s.tasks).toHaveLength(0);
    expect(s.pending).toHaveLength(1);
  });

  it('a deferred event applies once the task finally arrives', () => {
    const t = created();
    const move = ev('task.moved', t.entity, { to: 'done' });
    // The creating branch merged later — but the creation id is lower.
    const s = project([move, t]);
    expect(s.pending).toHaveLength(0);
    expect(s.tasks[0]!.status).toBe('done');
  });
});

describe('project — sprints', () => {
  it('sprint.closed resolves first-write-wins, unlike everything else', () => {
    // Closing records a fact that may have been published. A later close from
    // another branch does not rewrite velocity — invariant I5.
    const sp = gen();
    const create = { ...ev('sprint.created', sp, { name: 'Sprint 1' }), id: sp, entity: sp };
    const closeA = ev('sprint.closed', sp, { note: 'first' });
    const closeB = ev('sprint.closed', sp, { note: 'second' });
    const s = project([create, closeA, closeB]);
    expect(s.sprints[0]!.status).toBe('closed');
    expect(s.sprints[0]!.closedBy).toBe(closeA.id);
  });

  it('an event into a closed sprint is rejected but stays in the journal', () => {
    const sp = gen();
    const create = { ...ev('sprint.created', sp, { name: 'S1' }), id: sp, entity: sp };
    const close = ev('sprint.closed', sp, {});
    const t = created();
    const late = ev('sprint.task_added', sp, { task: t.entity });
    const s = project([create, t, close, late]);
    expect(s.tasks[0]!.sprint).toBeNull();
    expect(s.rejected.map((r) => r.id)).toContain(late.id);
  });

  it('a task added to an open sprint belongs to it', () => {
    const sp = gen();
    const create = { ...ev('sprint.created', sp, { name: 'S1' }), id: sp, entity: sp };
    const t = created();
    const s = project([create, t, ev('sprint.task_added', sp, { task: t.entity })]);
    expect(s.tasks[0]!.sprint).toBe(sp);
  });
});

describe('project — FLOW-N numbering', () => {
  it('assigns numbers in ULID order, not read order', () => {
    const a = created('First');
    const b = created('Second');
    const s = project([b, a]);
    const first = s.tasks.find((t) => t.id === a.entity)!;
    const second = s.tasks.find((t) => t.id === b.entity)!;
    expect(first.label).toBe('FLOW-1');
    expect(second.label).toBe('FLOW-2');
  });

  it('two branches that created tasks independently get DIFFERENT numbers', () => {
    // Exactly the collision Probe A found as CONFLICT (add/add) in real
    // repositories using file-based trackers.
    const fromBranchA = created('From branch A');
    const fromBranchB = created('From branch B');
    const labels = project([fromBranchA, fromBranchB]).tasks.map((t) => t.label);
    expect(new Set(labels).size).toBe(2);
  });

  it('a task number does not shift when a newer task appears', () => {
    const a = created('First');
    const before = project([a]).tasks[0]!.label;
    const after = project([a, created('Second')]).tasks.find((t) => t.id === a.entity)!.label;
    expect(after).toBe(before);
  });
});
