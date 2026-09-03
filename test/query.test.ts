import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project, type Task } from '../src/core/projection.js';
import { filterTasks, sortTasks, describeEmptyResult } from '../src/core/query.js';
import type { FlowEvent, EventType } from '../src/core/event.js';

const gen = createUlid();

function ev(type: EventType, entity: string, data: Record<string, unknown> = {}, actor = 'pm@example.com'): FlowEvent {
  return { id: gen(), type, entity, actor, ts: '2026-09-03T10:00:00.000Z', source: 'human', data };
}
function created(data: Record<string, unknown>): FlowEvent {
  const id = gen();
  return { ...ev('task.created', id, data), id, entity: id };
}

/** A small board covering every field a filter can touch. */
function board(): Task[] {
  const a = created({ title: 'Fix login', description: 'Safari only', type: 'bug', priority: 'urgent', assignee: 'dev1@example.com', labels: ['auth'], estimate: 5, due: '2026-09-10' });
  const b = created({ title: 'Export to CSV', type: 'story', priority: 'normal', assignee: 'dev2@example.com', labels: ['reports'], estimate: 8, due: '2026-12-01' });
  const c = created({ title: 'Update deps', type: 'task', priority: 'low' });
  return project([
    a, b, c,
    ev('task.commented', a.entity, { text: 'Cookie format changed' }, 'dev1@example.com'),
    ev('task.moved', b.entity, { to: 'in_progress' }),
  ]).tasks;
}

const titles = (ts: readonly Task[]) => ts.map((t) => t.title);

describe('filterTasks — search', () => {
  it('matches the title, case-insensitively', () => {
    expect(titles(filterTasks(board(), { search: 'LOGIN' }))).toEqual(['Fix login']);
  });

  it('matches the description', () => {
    expect(titles(filterTasks(board(), { search: 'safari' }))).toEqual(['Fix login']);
  });

  it('matches comment text — discussion is part of the task', () => {
    expect(titles(filterTasks(board(), { search: 'cookie' }))).toEqual(['Fix login']);
  });

  it('returns nothing when there is no match, rather than everything', () => {
    expect(filterTasks(board(), { search: 'nonexistent' })).toHaveLength(0);
  });
});

describe('filterTasks — fields', () => {
  it('filters by assignee', () => {
    expect(titles(filterTasks(board(), { assignee: 'dev2@example.com' }))).toEqual(['Export to CSV']);
  });

  it('filters by label', () => {
    expect(titles(filterTasks(board(), { label: 'auth' }))).toEqual(['Fix login']);
  });

  it('filters by type and by priority', () => {
    expect(titles(filterTasks(board(), { type: 'bug' }))).toEqual(['Fix login']);
    expect(titles(filterTasks(board(), { priority: 'low' }))).toEqual(['Update deps']);
  });

  it('filters by status', () => {
    expect(titles(filterTasks(board(), { status: 'in_progress' }))).toEqual(['Export to CSV']);
  });

  it('combines filters with AND, not OR', () => {
    expect(filterTasks(board(), { type: 'bug', priority: 'low' })).toHaveLength(0);
  });

  it('finds unassigned work with the word none', () => {
    expect(titles(filterTasks(board(), { assignee: 'none' }))).toEqual(['Update deps']);
  });
});

describe('filterTasks — dates', () => {
  const today = new Date('2026-09-15T00:00:00.000Z');

  it('finds overdue tasks relative to a given day', () => {
    expect(titles(filterTasks(board(), { overdue: true }, today))).toEqual(['Fix login']);
  });

  it('a task without a due date is never overdue', () => {
    expect(filterTasks(board(), { overdue: true }, today).map((t) => t.due)).not.toContain(null);
  });

  it('filters by a deadline before a date', () => {
    expect(titles(filterTasks(board(), { dueBefore: '2026-10-01' }))).toEqual(['Fix login']);
  });
});

describe('sortTasks', () => {
  it('orders by priority, most urgent first', () => {
    expect(titles(sortTasks(board(), 'priority'))).toEqual(['Fix login', 'Export to CSV', 'Update deps']);
  });

  it('orders by due date, soonest first', () => {
    expect(titles(sortTasks(board(), 'due')).slice(0, 2)).toEqual(['Fix login', 'Export to CSV']);
  });

  it('puts tasks without a value last, not first', () => {
    // A missing deadline is not "the year zero" — those tasks belong at the end.
    expect(titles(sortTasks(board(), 'due')).at(-1)).toBe('Update deps');
  });

  it('orders by estimate, largest first', () => {
    expect(titles(sortTasks(board(), 'estimate')).slice(0, 2)).toEqual(['Export to CSV', 'Fix login']);
  });

  it('keeps creation order by default and does not mutate the input', () => {
    const tasks = board();
    const copy = titles(tasks);
    sortTasks(tasks, 'priority');
    expect(titles(tasks)).toEqual(copy);
  });
});

describe('describeEmptyResult', () => {
  it('says which filter produced nothing', () => {
    const msg = describeEmptyResult({ type: 'bug', priority: 'low' });
    expect(msg).toContain('type=bug');
    expect(msg).toContain('priority=low');
  });

  it('without filters says the board is simply empty', () => {
    expect(describeEmptyResult({})).toMatch(/no tasks/i);
  });
});
