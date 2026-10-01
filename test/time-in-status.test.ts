import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import { timeInStatus, renderTimeInStatus } from '../src/core/flow.js';
import type { FlowEvent, EventType } from '../src/core/event.js';

/**
 * Time in status and flow efficiency (KAD-16).
 *
 * Cycle time says how long; this says where the time went — Jira's
 * control-chart breakdown and Linear's triage time in one fold, from the moves
 * the journal already holds.
 */

const gen = createUlid();
const T0 = Date.parse('2026-09-01T00:00:00.000Z');
const at = (days: number) => new Date(T0 + days * 86_400_000).toISOString();

function ev(type: EventType, entity: string, data: Record<string, unknown>, day: number): FlowEvent {
  return { id: gen(), type, entity, actor: 'pm@example.com', ts: at(day), source: 'human', data };
}
function created(title: string, day: number): FlowEvent {
  const id = gen();
  return { ...ev('task.created', id, { title }, day), id, entity: id };
}

/**
 * A: backlog → todo (day 1) → in_progress (3) → in_review (6) → done (7).
 * B: backlog → todo (2) → in_progress (2.5), blocked by A from day 3 to 5,
 *    → done (8).
 */
function journal() {
  const a = created('A', 0);
  const b = created('B', 0);
  return project([
    a,
    b,
    ev('task.moved', a.entity, { to: 'todo' }, 1),
    ev('task.moved', b.entity, { to: 'todo' }, 2),
    ev('task.moved', b.entity, { to: 'in_progress' }, 2.5),
    ev('task.moved', a.entity, { to: 'in_progress' }, 3),
    ev('task.blocked_by_added', b.entity, { blocker: a.entity }, 3),
    ev('task.blocked_by_removed', b.entity, { blocker: a.entity }, 5),
    ev('task.moved', a.entity, { to: 'in_review' }, 6),
    ev('task.moved', a.entity, { to: 'done' }, 7),
    ev('task.moved', b.entity, { to: 'done' }, 8),
  ]);
}

const TODAY = new Date(at(10));
const row = (r: ReturnType<typeof timeInStatus>, status: string) => r.statuses.find((s) => s.status === status)!;

describe('timeInStatus', () => {
  it('gives percentiles of the time spent in each column, in calendar days', () => {
    const r = timeInStatus(journal(), TODAY, 30);
    expect(row(r, 'todo').visits).toMatchObject({ n: 2, p50: 0.5, p85: 2 });
    expect(row(r, 'in_progress').visits).toMatchObject({ n: 2, p50: 3, p85: 5.5 });
    expect(row(r, 'in_review').visits).toMatchObject({ n: 1, p50: 1 });
    expect(row(r, 'backlog').visits).toMatchObject({ n: 2, p50: 1, p85: 2 });
  });

  it('names which columns come before the started boundary', () => {
    const r = timeInStatus(journal(), TODAY, 30);
    expect(r.started).toBe('in_progress');
    expect(row(r, 'todo').phase).toBe('before start');
    expect(row(r, 'in_review').phase).toBe('in progress');
  });

  it('leaves out the columns work does not leave', () => {
    const r = timeInStatus(journal(), TODAY, 30);
    expect(r.statuses.map((s) => s.status)).not.toContain('done');
  });

  it('measures flow efficiency: the share of cycle time not spent blocked', () => {
    // A: 4 days in flight, never blocked. B: 5.5 days, 2 of them blocked.
    const r = timeInStatus(journal(), TODAY, 30);
    expect(r.flowEfficiency).toMatchObject({ tasks: 2, percent: 79 });
  });

  it('counts only visits that ended inside the window', () => {
    const r = timeInStatus(journal(), new Date(at(40)), 30);
    expect(r.statuses.every((s) => s.visits === null)).toBe(true);
    expect(r.flowEfficiency).toBeNull();
  });

  it('says where the time went, in words', () => {
    const text = renderTimeInStatus(timeInStatus(journal(), TODAY, 30));
    expect(text).toMatch(/in_progress/);
    expect(text).toMatch(/79%/);
    expect(text).toMatch(/calendar days/);
  });
});
