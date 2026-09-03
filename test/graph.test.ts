import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project, findCycles, childrenOf } from '../src/core/projection.js';
import type { FlowEvent, EventType } from '../src/core/event.js';

const gen = createUlid();

function ev(type: EventType, entity: string, data: Record<string, unknown> = {}): FlowEvent {
  return { id: gen(), type, entity, actor: 'pm@example.com', ts: '2026-09-03T10:00:00.000Z', source: 'human', data };
}
function created(title: string, data: Record<string, unknown> = {}): FlowEvent {
  const id = gen();
  return { ...ev('task.created', id, { title, ...data }), id, entity: id };
}

describe('parent and children', () => {
  it('links a task to its parent', () => {
    const epic = created('Auth epic', { type: 'epic' });
    const child = created('Login form', { parent: epic.entity });
    const s = project([epic, child]);
    expect(s.tasks.find((t) => t.title === 'Login form')!.parent).toBe(epic.entity);
  });

  it('lists children in creation order', () => {
    const epic = created('Epic', { type: 'epic' });
    const a = created('First child', { parent: epic.entity });
    const b = created('Second child', { parent: epic.entity });
    const s = project([epic, a, b]);
    expect(childrenOf(s.tasks, epic.entity).map((t) => t.title)).toEqual(['First child', 'Second child']);
  });

  it('detaches when the parent is set to nothing', () => {
    const epic = created('Epic', { type: 'epic' });
    const child = created('Child', { parent: epic.entity });
    const s = project([epic, child, ev('task.parent_set', child.entity, { parent: null })]);
    expect(s.tasks.find((t) => t.title === 'Child')!.parent).toBeNull();
  });

  it('drops a reference to a deleted parent instead of dangling', () => {
    // A pointer to a task that no longer exists makes the tree unwalkable.
    const epic = created('Epic', { type: 'epic' });
    const child = created('Child', { parent: epic.entity });
    const s = project([epic, child, ev('task.deleted', epic.entity)]);
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0]!.parent).toBeNull();
  });

  it('epic is a task type, not a separate entity', () => {
    const s = project([created('Epic', { type: 'epic' })]);
    expect(s.tasks[0]!.type).toBe('epic');
  });
});

describe('blocking dependencies', () => {
  it('records what blocks a task', () => {
    const a = created('Blocker');
    const b = created('Blocked');
    const s = project([a, b, ev('task.blocked_by_added', b.entity, { blocker: a.entity })]);
    expect(s.tasks.find((t) => t.title === 'Blocked')!.blockedBy).toEqual([a.entity]);
  });

  it('adding the same blocker twice keeps one entry', () => {
    const a = created('Blocker');
    const b = created('Blocked');
    const s = project([
      a, b,
      ev('task.blocked_by_added', b.entity, { blocker: a.entity }),
      ev('task.blocked_by_added', b.entity, { blocker: a.entity }),
    ]);
    expect(s.tasks.find((t) => t.title === 'Blocked')!.blockedBy).toHaveLength(1);
  });

  it('removes a blocker', () => {
    const a = created('Blocker');
    const b = created('Blocked');
    const s = project([
      a, b,
      ev('task.blocked_by_added', b.entity, { blocker: a.entity }),
      ev('task.blocked_by_removed', b.entity, { blocker: a.entity }),
    ]);
    expect(s.tasks.find((t) => t.title === 'Blocked')!.blockedBy).toHaveLength(0);
  });

  it('forgets a blocker that was deleted', () => {
    const a = created('Blocker');
    const b = created('Blocked');
    const s = project([a, b, ev('task.blocked_by_added', b.entity, { blocker: a.entity }), ev('task.deleted', a.entity)]);
    expect(s.tasks[0]!.blockedBy).toHaveLength(0);
  });
});

describe('cycles', () => {
  it('reports a two-task blocking cycle instead of rejecting it', () => {
    // Rejecting the later event would make the state depend on merge order.
    const a = created('A');
    const b = created('B');
    const s = project([
      a, b,
      ev('task.blocked_by_added', a.entity, { blocker: b.entity }),
      ev('task.blocked_by_added', b.entity, { blocker: a.entity }),
    ]);
    expect(s.cycles).toHaveLength(1);
    expect(s.cycles[0]!.kind).toBe('blocking');
    // Both intents survive — nothing was silently dropped.
    expect(s.tasks.every((t) => t.blockedBy.length === 1)).toBe(true);
  });

  it('reports a parent cycle', () => {
    const a = created('A');
    const b = created('B');
    const s = project([
      a, b,
      ev('task.parent_set', a.entity, { parent: b.entity }),
      ev('task.parent_set', b.entity, { parent: a.entity }),
    ]);
    expect(s.cycles.filter((c) => c.kind === 'parent')).toHaveLength(1);
  });

  it('reports a longer cycle through three tasks', () => {
    const a = created('A');
    const b = created('B');
    const c = created('C');
    const s = project([
      a, b, c,
      ev('task.blocked_by_added', a.entity, { blocker: b.entity }),
      ev('task.blocked_by_added', b.entity, { blocker: c.entity }),
      ev('task.blocked_by_added', c.entity, { blocker: a.entity }),
    ]);
    expect(s.cycles).toHaveLength(1);
    expect(new Set(s.cycles[0]!.path)).toHaveProperty('size', 3);
  });

  it('reports the same cycle once, not once per entry point', () => {
    const a = created('A');
    const b = created('B');
    const s = project([
      a, b,
      ev('task.blocked_by_added', a.entity, { blocker: b.entity }),
      ev('task.blocked_by_added', b.entity, { blocker: a.entity }),
    ]);
    expect(s.cycles).toHaveLength(1);
  });

  it('finds no cycle in a plain chain', () => {
    const a = created('A');
    const b = created('B');
    const c = created('C');
    const s = project([
      a, b, c,
      ev('task.blocked_by_added', b.entity, { blocker: a.entity }),
      ev('task.blocked_by_added', c.entity, { blocker: b.entity }),
    ]);
    expect(s.cycles).toHaveLength(0);
  });

  it('is deterministic — read order does not change the report', () => {
    const a = created('A');
    const b = created('B');
    const events = [
      a, b,
      ev('task.blocked_by_added', a.entity, { blocker: b.entity }),
      ev('task.blocked_by_added', b.entity, { blocker: a.entity }),
    ];
    const first = JSON.stringify(project(events).cycles);
    const second = JSON.stringify(project([...events].reverse()).cycles);
    expect(second).toBe(first);
  });

  it('survives a task pointing at itself', () => {
    const a = created('A');
    const s = project([a, ev('task.parent_set', a.entity, { parent: a.entity })]);
    expect(s.cycles).toHaveLength(1);
  });

  it('does not hang on a deep chain', () => {
    const tasks = Array.from({ length: 300 }, (_, i) => created(`T${i}`));
    const links = tasks.slice(1).map((t, i) => ev('task.blocked_by_added', t.entity, { blocker: tasks[i]!.entity }));
    expect(findCycles(project([...tasks, ...links]).tasks)).toHaveLength(0);
  });
});
