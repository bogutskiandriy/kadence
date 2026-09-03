import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import { burndown, renderBurndown } from '../src/core/burndown.js';
import type { FlowEvent, EventType } from '../src/core/event.js';

const gen = createUlid();

function ev(type: EventType, entity: string, data: Record<string, unknown>, day: string): FlowEvent {
  return { id: gen(), type, entity, actor: 'pm@example.com', ts: `${day}T12:00:00.000Z`, source: 'human', data };
}
function created(title: string, estimate: number, day: string): FlowEvent {
  const id = gen();
  return { ...ev('task.created', id, { title, estimate }, day), id, entity: id };
}

/** A sprint with three tasks worth 10 points, burnt over four days. */
function sprintRun() {
  const sid = gen();
  const sprint = { ...ev('sprint.created', sid, { name: 'Sprint 1', startDate: '2026-09-01', endDate: '2026-09-04' }, '2026-09-01'), id: sid, entity: sid };
  const a = created('A', 5, '2026-09-01');
  const b = created('B', 3, '2026-09-01');
  const c = created('C', 2, '2026-09-01');
  const events = [
    sprint,
    ev('sprint.started', sid, {}, '2026-09-01'),
    a, b, c,
    ev('sprint.task_added', sid, { task: a.entity }, '2026-09-01'),
    ev('sprint.task_added', sid, { task: b.entity }, '2026-09-01'),
    ev('sprint.task_added', sid, { task: c.entity }, '2026-09-01'),
    ev('task.moved', a.entity, { to: 'done' }, '2026-09-02'),
    ev('task.moved', b.entity, { to: 'done' }, '2026-09-04'),
  ];
  return { events, state: project(events), sid };
}

describe('burndown', () => {
  it('reconstructs remaining points per day from the journal', () => {
    const { events, state, sid } = sprintRun();
    const chart = burndown(state, events, state.sprints.find((s) => s.id === sid)!, '2026-09-04')!;
    expect(chart.committed).toBe(10);
    expect(chart.days.map((d) => d.remaining)).toEqual([10, 5, 5, 2]);
  });

  it('draws an ideal line from committed down to zero', () => {
    const { events, state, sid } = sprintRun();
    const chart = burndown(state, events, state.sprints.find((s) => s.id === sid)!, '2026-09-04')!;
    expect(chart.days[0]!.ideal).toBe(10);
    expect(chart.days.at(-1)!.ideal).toBeCloseTo(0, 5);
  });

  it('records what was completed on each day', () => {
    const { events, state, sid } = sprintRun();
    const chart = burndown(state, events, state.sprints.find((s) => s.id === sid)!, '2026-09-04')!;
    expect(chart.days.map((d) => d.completed)).toEqual([0, 5, 0, 3]);
  });

  it('puts points back when a task is reopened', () => {
    // A task can be completed and then moved back; counting "done" once would
    // show work that no longer exists as finished.
    const { events, state, sid } = sprintRun();
    const done = state.tasks.find((t) => t.title === 'A')!;
    const withReopen = [...events, ev('task.moved', done.id, { to: 'in_progress' }, '2026-09-03')];
    const chart = burndown(project(withReopen), withReopen, project(withReopen).sprints.find((s) => s.id === sid)!, '2026-09-04')!;
    expect(chart.days[2]!.remaining).toBe(10);
  });

  it('never charts past today for an open sprint', () => {
    const { events, state, sid } = sprintRun();
    const chart = burndown(state, events, state.sprints.find((s) => s.id === sid)!, '2026-09-02')!;
    expect(chart.days.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('excludes cancelled tasks from the commitment', () => {
    const { events, state, sid } = sprintRun();
    const c = state.tasks.find((t) => t.title === 'C')!;
    const withCancel = [...events, ev('task.cancelled', c.id, {}, '2026-09-02')];
    const st = project(withCancel);
    const chart = burndown(st, withCancel, st.sprints.find((s) => s.id === sid)!, '2026-09-04')!;
    expect(chart.committed).toBe(8);
  });

  it('returns null when the sprint has no tasks', () => {
    const sid = gen();
    const sprint = { ...ev('sprint.created', sid, { name: 'Empty' }, '2026-09-01'), id: sid, entity: sid };
    const st = project([sprint]);
    expect(burndown(st, [sprint], st.sprints[0]!)).toBeNull();
  });

  it('infers dates when the sprint has none', () => {
    const sid = gen();
    const sprint = { ...ev('sprint.created', sid, { name: 'No dates' }, '2026-09-01'), id: sid, entity: sid };
    const a = created('A', 5, '2026-09-01');
    const events = [sprint, a, ev('sprint.task_added', sid, { task: a.entity }, '2026-09-01')];
    const st = project(events);
    const chart = burndown(st, events, st.sprints[0]!, '2026-09-03');
    expect(chart).not.toBeNull();
    expect(chart!.days.length).toBeGreaterThan(0);
  });
});

describe('renderBurndown', () => {
  it('draws one row per day with the remaining number', () => {
    const { events, state, sid } = sprintRun();
    const chart = burndown(state, events, state.sprints.find((s) => s.id === sid)!, '2026-09-04')!;
    const out = renderBurndown(chart);
    expect(out.split('\n').filter((l) => l.includes('█')).length).toBe(4);
    expect(out).toContain('10 points committed');
  });

  it('says plainly when the team is behind the ideal line', () => {
    const { events, state, sid } = sprintRun();
    const chart = burndown(state, events, state.sprints.find((s) => s.id === sid)!, '2026-09-04')!;
    expect(renderBurndown(chart)).toMatch(/behind the ideal line/i);
  });

  it('handles a sprint with no estimates without dividing by zero', () => {
    const chart = { sprintName: 'S', committed: 0, days: [], finalRemaining: null };
    expect(renderBurndown(chart)).toMatch(/nothing to burn down/i);
  });
});
