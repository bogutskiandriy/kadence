import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import { burnup, renderBurnup } from '../src/core/burnup.js';
import type { FlowEvent, EventType } from '../src/core/event.js';

/**
 * Burnup: two lines, scope and done (KAD-15).
 *
 * The one question a burndown cannot answer — was the goal missed, or did the
 * goal grow? A burndown that stays flat looks the same whether nobody finished
 * anything or every finished point was replaced by a new one.
 */

const gen = createUlid();

function ev(type: EventType, entity: string, data: Record<string, unknown>, day: string): FlowEvent {
  return { id: gen(), type, entity, actor: 'pm@example.com', ts: `${day}T12:00:00.000Z`, source: 'human', data };
}
function created(title: string, estimate: number, day: string): FlowEvent {
  const id = gen();
  return { ...ev('task.created', id, { title, estimate }, day), id, entity: id };
}
function sprintCreated(name: string, start: string, end: string): FlowEvent {
  const id = gen();
  return { ...ev('sprint.created', id, { name, startDate: start, endDate: end }, start), id, entity: id };
}

/** 8 points at the start; 8 more added on day 3; A done day 2, C done day 4. */
function growingSprint() {
  const s = sprintCreated('Sprint 1', '2026-09-01', '2026-09-05');
  const a = created('A', 5, '2026-09-01');
  const b = created('B', 3, '2026-09-01');
  const c = created('C', 8, '2026-09-03');
  const events = [
    s,
    ev('sprint.started', s.entity, {}, '2026-09-01'),
    a, b, c,
    ev('sprint.task_added', s.entity, { task: a.entity }, '2026-09-01'),
    ev('sprint.task_added', s.entity, { task: b.entity }, '2026-09-01'),
    ev('task.moved', a.entity, { to: 'done' }, '2026-09-02'),
    ev('sprint.task_added', s.entity, { task: c.entity }, '2026-09-03'),
    ev('task.moved', c.entity, { to: 'done' }, '2026-09-04'),
  ];
  const state = project(events);
  return { events, state, sprint: state.sprints.find((x) => x.id === s.entity)!, a, b, c, s };
}

const day = (chart: NonNullable<ReturnType<typeof burnup>>, date: string) => chart.days.find((d) => d.date === date)!;

describe('burnup', () => {
  it('draws scope and done per day, from the journal', () => {
    const { events, state, sprint } = growingSprint();
    const chart = burnup(state, events, sprint, '2026-09-05')!;
    expect(chart.days.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
    expect(day(chart, '2026-09-01')).toMatchObject({ scope: 8, done: 0 });
    expect(day(chart, '2026-09-02')).toMatchObject({ scope: 8, done: 5 });
    expect(day(chart, '2026-09-03')).toMatchObject({ scope: 16, done: 5 });
    expect(day(chart, '2026-09-04')).toMatchObject({ scope: 16, done: 13 });
  });

  it('says how much the goal grew, separately from what was finished', () => {
    const { events, state, sprint } = growingSprint();
    const chart = burnup(state, events, sprint, '2026-09-05')!;
    expect(chart.scopeAtStart).toBe(8);
    expect(chart.scopeAdded).toBe(8);
    expect(chart.scopeNow).toBe(16);
  });

  it('follows an estimate that changes mid-sprint', () => {
    const { events, state: _s, sprint: _p, b } = growingSprint();
    const more = [...events, ev('task.updated', b.entity, { estimate: 13 }, '2026-09-05')];
    const state = project(more);
    const chart = burnup(state, more, state.sprints[0]!, '2026-09-05')!;
    expect(day(chart, '2026-09-04').scope).toBe(16);
    expect(day(chart, '2026-09-05').scope).toBe(26);
  });

  it('drops a cancelled task and a task moved to another sprint from the scope', () => {
    const { events, b, c } = growingSprint();
    const other = sprintCreated('Sprint 2', '2026-09-06', '2026-09-10');
    const more = [
      ...events,
      ev('task.moved', b.entity, { to: 'cancelled' }, '2026-09-05'),
      other,
      ev('sprint.task_added', other.entity, { task: c.entity }, '2026-09-05'),
    ];
    const state = project(more);
    const chart = burnup(state, more, state.sprints.find((x) => x.name === 'Sprint 1')!, '2026-09-05')!;
    expect(day(chart, '2026-09-05')).toMatchObject({ scope: 5, done: 5 });
  });

  it('takes a reopened task back out of done', () => {
    const { events, a } = growingSprint();
    const more = [...events, ev('task.moved', a.entity, { to: 'in_progress' }, '2026-09-05')];
    const state = project(more);
    const chart = burnup(state, more, state.sprints[0]!, '2026-09-05')!;
    expect(day(chart, '2026-09-05').done).toBe(8);
  });

  it('never charts the future', () => {
    const { events, state, sprint } = growingSprint();
    const chart = burnup(state, events, sprint, '2026-09-03')!;
    expect(chart.days.at(-1)!.date).toBe('2026-09-03');
  });

  it('is the same whatever order the events are read in (I1, I2)', () => {
    const { events, state, sprint } = growingSprint();
    const a = burnup(state, events, sprint, '2026-09-05');
    const b = burnup(state, [...events].reverse(), sprint, '2026-09-05');
    expect(b).toEqual(a);
  });

  it('says plainly that the journal cannot record removing a task from a sprint', () => {
    const { events, state, sprint } = growingSprint();
    const text = renderBurnup(burnup(state, events, sprint, '2026-09-05')!);
    expect(text).toMatch(/grew by 8/);
    expect(text).toMatch(/cancel|another sprint/i);
  });
});
