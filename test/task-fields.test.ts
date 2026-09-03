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
    actor: 'pm@example.com',
    ts: '2026-09-03T10:00:00.000Z',
    source: 'human',
    data,
  };
}

function created(data: Record<string, unknown>): FlowEvent {
  const id = gen();
  return { ...ev('task.created', id, data), id, entity: id };
}

describe('task fields', () => {
  it('stores the description', () => {
    const t = created({ title: 'Task', description: 'Detailed description\nacross two lines' });
    expect(project([t]).tasks[0]!.description).toBe('Detailed description\nacross two lines');
  });

  it('the field is empty rather than missing without a description', () => {
    expect(project([created({ title: 'Task' })]).tasks[0]!.description).toBeNull();
  });

  it('types the task: task, bug or story', () => {
    expect(project([created({ title: 'A', type: 'bug' })]).tasks[0]!.type).toBe('bug');
  });

  it('falls back to task on an unknown type — a future event does not break state', () => {
    expect(project([created({ title: 'A', type: 'milestone' })]).tasks[0]!.type).toBe('task');
  });

  it('defaults the type to task', () => {
    expect(project([created({ title: 'A' })]).tasks[0]!.type).toBe('task');
  });

  it('stores the priority', () => {
    expect(project([created({ title: 'A', priority: 'high' })]).tasks[0]!.priority).toBe('high');
  });

  it('defaults the priority to normal', () => {
    expect(project([created({ title: 'A' })]).tasks[0]!.priority).toBe('normal');
  });

  it('stores labels', () => {
    const t = created({ title: 'A', labels: ['frontend', 'urgent'] });
    expect(project([t]).tasks[0]!.labels).toEqual(['frontend', 'urgent']);
  });

  it('drops labels that are not strings', () => {
    const t = created({ title: 'A', labels: ['ok', 42, null] });
    expect(project([t]).tasks[0]!.labels).toEqual(['ok']);
  });

  it('remembers the author as reporter', () => {
    expect(project([created({ title: 'A' })]).tasks[0]!.reporter).toBe('pm@example.com');
  });
});

describe('task.assigned', () => {
  it('assigns an assignee', () => {
    const t = created({ title: 'A' });
    const s = project([t, ev('task.assigned', t.entity, { assignee: 'dev@example.com' })]);
    expect(s.tasks[0]!.assignee).toBe('dev@example.com');
  });

  it('reassignment overwrites the previous assignee', () => {
    const t = created({ title: 'A' });
    const s = project([
      t,
      ev('task.assigned', t.entity, { assignee: 'first@example.com' }),
      ev('task.assigned', t.entity, { assignee: 'second@example.com' }),
    ]);
    expect(s.tasks[0]!.assignee).toBe('second@example.com');
  });

  it('an empty assignee clears the assignment', () => {
    const t = created({ title: 'A', assignee: 'dev@example.com' });
    const s = project([t, ev('task.assigned', t.entity, { assignee: null })]);
    expect(s.tasks[0]!.assignee).toBeNull();
  });

  it('two branches assigned different people — the higher ULID wins', () => {
    const t = created({ title: 'A' });
    const s = project([
      t,
      ev('task.assigned', t.entity, { assignee: 'alice@example.com' }),
      ev('task.assigned', t.entity, { assignee: 'bob@example.com' }),
    ]);
    expect(s.tasks[0]!.assignee).toBe('bob@example.com');
    // Both intents remain visible in the history.
    expect(s.tasks[0]!.history.filter((h) => h.type === 'task.assigned')).toHaveLength(2);
  });
});

describe('task.updated', () => {
  it('changes the description without touching anything else', () => {
    const t = created({ title: 'A', description: 'old', estimate: 3 });
    const s = project([t, ev('task.updated', t.entity, { description: 'new' })]);
    expect(s.tasks[0]!.description).toBe('new');
    expect(s.tasks[0]!.estimate).toBe(3);
    expect(s.tasks[0]!.title).toBe('A');
  });

  it('changes priority and labels', () => {
    const t = created({ title: 'A' });
    const s = project([
      t,
      ev('task.updated', t.entity, { priority: 'urgent', labels: ['hotfix'] }),
    ]);
    expect(s.tasks[0]!.priority).toBe('urgent');
    expect(s.tasks[0]!.labels).toEqual(['hotfix']);
  });
});
