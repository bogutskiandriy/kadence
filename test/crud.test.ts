import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import type { FlowEvent, EventType } from '../src/core/event.js';

const gen = createUlid();

function ev(type: EventType, entity: string, data: Record<string, unknown> = {}, actor = 'pm@example.com'): FlowEvent {
  return { id: gen(), type, entity, actor, ts: '2026-09-03T10:00:00.000Z', source: 'human', data };
}

function created(data: Record<string, unknown> = { title: 'Task' }): FlowEvent {
  const id = gen();
  return { ...ev('task.created', id, data), id, entity: id };
}

describe('task.deleted', () => {
  it('removes the task from projections', () => {
    const t = created();
    expect(project([t, ev('task.deleted', t.entity)]).tasks).toHaveLength(0);
  });

  it('keeps the event in the journal — append-only admits no true erasure', () => {
    const t = created();
    const del = ev('task.deleted', t.entity);
    const events = [t, del];
    project(events);
    // The fold must not mutate or drop anything from the journal itself.
    expect(events).toHaveLength(2);
  });

  it('frees its KAD-N so numbering stays contiguous', () => {
    const a = created({ title: 'First' });
    const b = created({ title: 'Second' });
    const c = created({ title: 'Third' });
    const s = project([a, b, c, ev('task.deleted', b.entity)]);
    expect(s.tasks.map((t) => t.label)).toEqual(['KAD-1', 'KAD-2']);
    expect(s.tasks.map((t) => t.title)).toEqual(['First', 'Third']);
  });

  it('ignores events that arrive after deletion', () => {
    const t = created();
    const s = project([t, ev('task.deleted', t.entity), ev('task.moved', t.entity, { to: 'done' })]);
    expect(s.tasks).toHaveLength(0);
  });

  it('deleting a non-existent task is not an error', () => {
    expect(() => project([ev('task.deleted', gen())])).not.toThrow();
  });
});

describe('comments', () => {
  it('records author and time alongside the text', () => {
    const t = created();
    const s = project([t, ev('task.commented', t.entity, { text: 'Looks wrong' }, 'dev@example.com')]);
    const c = s.tasks[0]!.comments[0]!;
    expect(c.text).toBe('Looks wrong');
    expect(c.author).toBe('dev@example.com');
  });

  it('keeps comments from different branches in ULID order', () => {
    // Two people commenting on separate branches must both survive the merge.
    const t = created();
    const first = ev('task.commented', t.entity, { text: 'From Alice' }, 'alice@example.com');
    const second = ev('task.commented', t.entity, { text: 'From Bob' }, 'bob@example.com');
    const s = project([t, second, first]);
    expect(s.tasks[0]!.comments.map((c) => c.text)).toEqual(['From Alice', 'From Bob']);
  });

  it('drops an empty comment rather than storing a blank line', () => {
    const t = created();
    expect(project([t, ev('task.commented', t.entity, { text: '' })]).tasks[0]!.comments).toHaveLength(0);
  });
});

describe('due dates', () => {
  it('stores a due date given at creation', () => {
    expect(project([created({ title: 'T', due: '2026-09-30' })]).tasks[0]!.due).toBe('2026-09-30');
  });

  it('is null when never set', () => {
    expect(project([created()]).tasks[0]!.due).toBeNull();
  });

  it('can be changed and cleared through task.updated', () => {
    const t = created({ title: 'T', due: '2026-09-30' });
    const moved = project([t, ev('task.updated', t.entity, { due: '2026-10-15' })]);
    expect(moved.tasks[0]!.due).toBe('2026-10-15');

    const cleared = project([t, ev('task.updated', t.entity, { due: '' })]);
    expect(cleared.tasks[0]!.due).toBeNull();
  });
});

describe('task.updated', () => {
  it('changes only the fields it carries', () => {
    const t = created({ title: 'Original', description: 'Text', estimate: 3, priority: 'high' });
    const s = project([t, ev('task.updated', t.entity, { title: 'Renamed' })]);
    const task = s.tasks[0]!;
    expect(task.title).toBe('Renamed');
    expect(task.description).toBe('Text');
    expect(task.estimate).toBe(3);
    expect(task.priority).toBe('high');
  });

  it('two branches editing the same field resolve by ULID, both kept in history', () => {
    const t = created();
    const a = ev('task.updated', t.entity, { title: 'From A' }, 'alice@example.com');
    const b = ev('task.updated', t.entity, { title: 'From B' }, 'bob@example.com');
    const s = project([t, a, b]);
    expect(s.tasks[0]!.title).toBe('From B');
    expect(s.tasks[0]!.history.filter((h) => h.type === 'task.updated')).toHaveLength(2);
  });
});
