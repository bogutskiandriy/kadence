import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import { sprintReport } from '../src/core/velocity.js';
import type { FlowEvent, EventType } from '../src/core/event.js';

const gen = createUlid();
let clock = 1_756_800_000_000;

function ev(type: EventType, entity: string, data: Record<string, unknown> = {}, minutes = 0): FlowEvent {
  clock += minutes * 60_000;
  return {
    id: gen(),
    type,
    entity,
    actor: 'tester@example.com',
    ts: new Date(clock).toISOString(),
    source: 'human',
    data,
  };
}

function task(title: string, estimate?: number): FlowEvent {
  const id = gen();
  return {
    ...ev('task.created', id, estimate === undefined ? { title } : { title, estimate }),
    id,
    entity: id,
  };
}

function sprint(name: string): FlowEvent {
  const id = gen();
  return { ...ev('sprint.created', id, { name }), id, entity: id };
}

describe('sprintReport', () => {
  it('computes velocity as the sum of completed estimates', () => {
    const s = sprint('Sprint 1');
    const a = task('A', 3);
    const b = task('B', 5);
    const state = project([
      s, a, b,
      ev('sprint.task_added', s.entity, { task: a.entity }),
      ev('sprint.task_added', s.entity, { task: b.entity }),
      ev('task.moved', a.entity, { to: 'done' }),
      ev('task.moved', b.entity, { to: 'done' }),
    ]);
    expect(sprintReport(state, s.entity)!.velocity).toBe(8);
  });

  it('unfinished tasks do not count towards velocity', () => {
    const s = sprint('S1');
    const a = task('A', 3);
    const b = task('B', 5);
    const state = project([
      s, a, b,
      ev('sprint.task_added', s.entity, { task: a.entity }),
      ev('sprint.task_added', s.entity, { task: b.entity }),
      ev('task.moved', a.entity, { to: 'done' }),
      ev('task.moved', b.entity, { to: 'in_progress' }),
    ]);
    const r = sprintReport(state, s.entity)!;
    expect(r.velocity).toBe(3);
    expect(r.carriedOver).toHaveLength(1);
  });

  it('cancelled tasks do not count as a sprint failure', () => {
    // Cancelling is a decision, not work left undone. Mixing them would punish
    // a team for dropping something in time.
    const s = sprint('S1');
    const a = task('A', 3);
    const b = task('B', 8);
    const state = project([
      s, a, b,
      ev('sprint.task_added', s.entity, { task: a.entity }),
      ev('sprint.task_added', s.entity, { task: b.entity }),
      ev('task.moved', a.entity, { to: 'done' }),
      ev('task.cancelled', b.entity, {}),
    ]);
    const r = sprintReport(state, s.entity)!;
    expect(r.velocity).toBe(3);
    expect(r.cancelled).toHaveLength(1);
    expect(r.carriedOver).toHaveLength(0);
    expect(r.committed).toBe(3);
  });

  it('names unestimated tasks separately — they do not count towards velocity', () => {
    const s = sprint('S1');
    const a = task('A', 3);
    const b = task('No estimate');
    const state = project([
      s, a, b,
      ev('sprint.task_added', s.entity, { task: a.entity }),
      ev('sprint.task_added', s.entity, { task: b.entity }),
      ev('task.moved', a.entity, { to: 'done' }),
      ev('task.moved', b.entity, { to: 'done' }),
    ]);
    const r = sprintReport(state, s.entity)!;
    expect(r.velocity).toBe(3);
    expect(r.unestimated).toHaveLength(1);
  });

  it('measures actual time in progress — from first in_progress to done', () => {
    const s = sprint('S1');
    const a = task('A', 2);
    const state = project([
      s, a,
      ev('sprint.task_added', s.entity, { task: a.entity }),
      ev('task.moved', a.entity, { to: 'in_progress' }, 0),
      ev('task.moved', a.entity, { to: 'done' }, 120),
    ]);
    const r = sprintReport(state, s.entity)!;
    expect(r.actualHours).toBeCloseTo(2, 1);
    expect(r.hoursPerPoint).toBeCloseTo(1, 1);
  });

  it('excludes a task never started from the actual time', () => {
    // A backlog → done move without in_progress carries no timing information.
    const s = sprint('S1');
    const a = task('A', 2);
    const state = project([
      s, a,
      ev('sprint.task_added', s.entity, { task: a.entity }),
      ev('task.moved', a.entity, { to: 'done' }),
    ]);
    const r = sprintReport(state, s.entity)!;
    expect(r.velocity).toBe(2);
    expect(r.actualHours).toBeNull();
  });

  it('an empty sprint yields velocity 0, not an error', () => {
    const s = sprint('S1');
    const r = sprintReport(project([s]), s.entity)!;
    expect(r.velocity).toBe(0);
    expect(r.hoursPerPoint).toBeNull();
  });

  it('returns null for a sprint that does not exist', () => {
    expect(sprintReport(project([]), 'NONE')).toBeNull();
  });

  it('uses the first entry into progress even if the task was sent back', () => {
    const s = sprint('S1');
    const a = task('A', 4);
    const state = project([
      s, a,
      ev('sprint.task_added', s.entity, { task: a.entity }),
      ev('task.moved', a.entity, { to: 'in_progress' }, 0),
      ev('task.moved', a.entity, { to: 'in_review' }, 60),
      ev('task.moved', a.entity, { to: 'in_progress' }, 30),
      ev('task.moved', a.entity, { to: 'done' }, 90),
    ]);
    expect(sprintReport(state, s.entity)!.actualHours).toBeCloseTo(3, 1);
  });
});
