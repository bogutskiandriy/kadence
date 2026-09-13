import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project } from '../src/core/projection.js';
import { flowReport, cfdReport, windowEnding } from '../src/core/flow.js';
import type { FlowEvent } from '../src/core/event.js';
import { createUlid } from '../src/core/ulid.js';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove } from '../src/cli/commands/task.js';
import { runReport, parseSince } from '../src/cli/commands/report.js';

/**
 * Flow metrics: the four the Kanban Guide mandates, from timestamps the
 * journal already has. Percentiles rather than means, calendar days said out
 * loud, and the started boundary printed with every number.
 */

const gen = createUlid();
const TODAY = new Date('2026-09-30T12:00:00.000Z');
const day = (d: number, h = 10): string => new Date(Date.UTC(2026, 8, d, h)).toISOString();

function created(id: string, ts: string, extra: Record<string, unknown> = {}): FlowEvent {
  return { id, type: 'task.created', entity: id, actor: 'a@b.c', ts, source: 'human', data: { title: `T ${id.slice(-3)}`, ...extra } };
}
function moved(entity: string, to: string, ts: string): FlowEvent {
  return { id: gen(), type: 'task.moved', entity, actor: 'a@b.c', ts, source: 'human', data: { to } };
}
function ev(type: string, entity: string, data: Record<string, unknown>, ts: string): FlowEvent {
  return { id: gen(), type, entity, actor: 'a@b.c', ts, source: 'human', data } as FlowEvent;
}

/** A task created on `c`, started on `s`, finished on `f` (day numbers). */
function lifecycle(c: number, s: number | null, f: number | null): FlowEvent[] {
  const id = gen();
  const out = [created(id, day(c))];
  if (s !== null) out.push(moved(id, 'in_progress', day(s)));
  if (f !== null) out.push(moved(id, 'done', day(f)));
  return out;
}

describe('flowReport', () => {
  it('names the window, the unit and the started boundary', () => {
    const r = flowReport(project([]), TODAY, 30);
    expect(r.window).toEqual({ from: '2026-09-01', to: '2026-09-30', days: 30 });
    expect(r.unit).toBe('calendar days');
    expect(r.started).toBe('in_progress');
    expect(r.notes).toContain('No tasks yet.');
  });

  it('reports cycle time as percentiles, never a mean', () => {
    // Cycle times 1, 2, 3, 4, 20 days: a mean would say 6 and hide the 20.
    const events = [
      ...lifecycle(1, 2, 3),
      ...lifecycle(1, 2, 4),
      ...lifecycle(1, 2, 5),
      ...lifecycle(1, 2, 6),
      ...lifecycle(1, 2, 22),
    ];
    const r = flowReport(project(events), TODAY, 30);
    expect(r.cycleTime).toEqual({ n: 5, p50: 3, p85: 20, p95: 20 });
    expect(JSON.stringify(r)).not.toMatch(/mean|average/);
  });

  it('phrases the service level expectation in the Kanban Guide’s words', () => {
    const events = Array.from({ length: 10 }, (_, i) => lifecycle(1, 2, 3 + i)).flat();
    const r = flowReport(project(events), TODAY, 30);
    expect(r.sle).toBe('85% of finished items took 9 calendar days or less.');
  });

  it('says when the sample is small rather than pretending', () => {
    const r = flowReport(project(lifecycle(1, 2, 5)), TODAY, 30);
    expect(r.sle).toMatch(/small sample/);
  });

  it('lead time runs from creation, response time from creation to start', () => {
    const r = flowReport(project(lifecycle(1, 4, 10)), TODAY, 30);
    expect(r.leadTime!.p50).toBe(9);
    expect(r.responseTime!.p50).toBe(3);
    expect(r.cycleTime!.p50).toBe(6);
  });

  it('measures from the configured started column, not a literal', () => {
    const c = gen();
    const t = gen();
    const events = [
      ev('board.configured', c, { statuses: ['todo', 'doing', 'done'], started: 'doing' }, day(1)),
      created(t, day(1)),
      moved(t, 'doing', day(3)),
      moved(t, 'done', day(8)),
    ];
    const r = flowReport(project(events), TODAY, 30);
    expect(r.started).toBe('doing');
    expect(r.cycleTime!.p50).toBe(5);
  });

  it('counts work in progress and lists it by age, flagging what is older than p85', () => {
    const events = [
      ...Array.from({ length: 10 }, (_, i) => lifecycle(1, 2, 3 + i)).flat(), // p85 = 9
      ...lifecycle(1, 10, null), // 20 days old on the 30th — older than p85
      ...lifecycle(1, 28, null), // 2 days old
      ...lifecycle(1, null, null), // never started: not WIP
    ];
    const r = flowReport(project(events), TODAY, 30);
    expect(r.wip).toBe(2);
    expect(r.aging[0]!.ageDays).toBeCloseTo(20.1, 0);
    expect(r.aging[0]!.overP85).toBe(true);
    expect(r.aging[1]!.overP85).toBe(false);
  });

  it('a task moved back before the boundary has left work in progress', () => {
    // It was in progress once. It is in the backlog now, and a WIP count that
    // still includes it is a count of history, not of work.
    const t = gen();
    const events = [created(t, day(1)), moved(t, 'in_progress', day(3)), moved(t, 'backlog', day(6))];
    const r = flowReport(project(events), TODAY, 30);
    expect(r.wip).toBe(0);
    expect(r.aging).toEqual([]);
  });

  it('a task that skipped the started column is still in progress once past it', () => {
    const t = gen();
    const events = [created(t, day(1)), moved(t, 'in_review', day(4))];
    const r = flowReport(project(events), TODAY, 30);
    expect(r.wip).toBe(1);
    expect(r.aging[0]!.ageDays).toBeCloseTo(26.1, 0);
  });

  it('a column the board does not list counts as past the boundary', () => {
    // An orphan status from another branch is not a backlog.
    const t = gen();
    const events = [created(t, day(1)), moved(t, 'qa', day(4))];
    const r = flowReport(project(events), TODAY, 30);
    expect(r.wip).toBe(1);
  });

  it('counts created and finished per ISO week', () => {
    const events = [...lifecycle(2, 2, 3), ...lifecycle(2, 3, 10), ...lifecycle(16, null, null)];
    const r = flowReport(project(events), TODAY, 30);
    const byWeek = Object.fromEntries(r.perWeek.map((w) => [w.week, w]));
    // 2026-08-31 is the Monday of the week containing 1–6 September.
    expect(byWeek['2026-08-31']).toMatchObject({ created: 2, finished: 1 });
    expect(byWeek['2026-09-07']).toMatchObject({ created: 0, finished: 1 });
    expect(byWeek['2026-09-14']).toMatchObject({ created: 1, finished: 0 });
  });

  it('only counts finishes inside the window, whatever was created before it', () => {
    const events = [...lifecycle(1, 2, 3), ...lifecycle(1, 2, 25)];
    const r = flowReport(project(events), TODAY, 7); // 24–30 September
    expect(r.finished).toBe(1);
    expect(r.cycleTime!.n).toBe(1);
  });

  it('adds up blocked days, once per task however many blockers overlap', () => {
    const a = gen();
    const b = gen();
    const t = gen();
    const events = [
      created(a, day(1)),
      created(b, day(1)),
      created(t, day(1)),
      ev('task.blocked_by_added', t, { blocker: a }, day(5)),
      ev('task.blocked_by_added', t, { blocker: b }, day(6)),
      ev('task.blocked_by_removed', t, { blocker: a }, day(8)),
      moved(b, 'done', day(9)),
    ];
    const r = flowReport(project(events), TODAY, 30);
    // Blocked from the 5th to the 9th — four days, not (3 + 3).
    expect(r.blocked).toEqual({ tasks: 1, days: 4 });
  });

  it('explains an empty window instead of printing zeros', () => {
    const r = flowReport(project(lifecycle(1, null, null)), TODAY, 30);
    expect(r.wip).toBe(0);
    expect(r.notes.join(' ')).toMatch(/Nothing has crossed "in_progress"/);
    expect(r.notes.join(' ')).toMatch(/board config --started/);
  });

  it('a reopened task is in progress again, and the chart says so', () => {
    // A reopen moves the task without a `task.moved`. Left out, the task stayed
    // in `done` on the chart for the rest of its life while the board showed it
    // in progress — the one thing the header comment promises cannot happen.
    const t = gen();
    const events = [
      created(t, day(1)),
      moved(t, 'in_progress', day(3)),
      moved(t, 'done', day(5)),
      ev('task.reopened', t, {}, day(7)),
    ];
    const state = project(events);
    expect(state.tasks[0]!.status).toBe('in_progress');
    expect(flowReport(state, TODAY, 30).wip).toBe(1);
    const last = cfdReport(state, TODAY, 30).days.at(-1)!.counts;
    expect(last).toMatchObject({ in_progress: 1, done: 0 });
  });

  it('a task reopened without ever having moved is still in progress', () => {
    const t = gen();
    const state = project([created(t, day(1)), moved(t, 'done', day(3)), ev('task.reopened', t, {}, day(5))]);
    const r = flowReport(state, TODAY, 30);
    expect(r.wip).toBe(1);
    expect(r.notes.join(' ')).not.toMatch(/Nothing has crossed/);
  });

  it('a task stops accruing blocked days once it is finished itself', () => {
    // Work that is over is not blocked, whatever the blocker is doing.
    const a = gen();
    const t = gen();
    const events = [
      created(a, day(1)),
      created(t, day(1)),
      ev('task.blocked_by_added', t, { blocker: a }, day(5)),
      moved(t, 'done', day(7)),
    ];
    expect(flowReport(project(events), TODAY, 30).blocked).toEqual({ tasks: 1, days: 2 });
  });

  it('a started boundary that is not a column empties the report, as the warning promises', () => {
    // The default state of every board that renames in_progress. Counting each
    // column as "past the boundary" inflated WIP and contradicted both the note
    // and what `board config` tells the user.
    const c = gen();
    const t = gen();
    const events = [
      ev('board.configured', c, { statuses: ['backlog', 'todo', 'doing', 'done'] }, day(1)),
      created(t, day(1)),
      moved(t, 'todo', day(2)),
    ];
    const r = flowReport(project(events), TODAY, 30);
    expect(r.wip).toBe(0);
    expect(r.aging).toEqual([]);
    expect(r.notes.join(' ')).toMatch(/not one of the board's columns/);
  });

  it('the chart starts a task in the column the fold puts it in', () => {
    // On a board without `backlog`, a new task really is in an orphan column;
    // filing it under the leftmost configured one would disagree with `board`.
    const c = gen();
    const t = gen();
    const events = [
      ev('board.configured', c, { statuses: ['todo', 'doing', 'done'] }, day(1)),
      created(t, day(2)),
    ];
    const state = project(events);
    expect(state.tasks[0]!.status).toBe('backlog');
    expect(cfdReport(state, TODAY, 30).days.at(-1)!.counts).toMatchObject({ backlog: 1, todo: 0 });
  });

  it('resolves a reopen against the boundary in force at its own position', () => {
    // A lagging clock: the reopen sorts before the configuration change that
    // renamed the started column, so it belongs in the old one.
    const REOPEN = '01AAAAAAAAAAAAAAAAAAAAAAA0';
    const CONFIG = '01AAAAAAAAAAAAAAAAAAAAAAA5';
    const CREATE = '01AAAAAAAAAAAAAAAAAAAAAAAZ';
    const at = day(5);
    const events: FlowEvent[] = [
      { id: REOPEN, type: 'task.reopened', entity: CREATE, actor: 'a@b.c', ts: at, source: 'human', data: {} },
      { id: CONFIG, type: 'board.configured', entity: CONFIG, actor: 'a@b.c', ts: at, source: 'human', data: { statuses: ['todo', 'doing', 'done'], started: 'doing' } },
      { id: CREATE, type: 'task.created', entity: CREATE, actor: 'a@b.c', ts: at, source: 'human', data: { title: 'T' } },
    ];
    for (const order of [events, [...events].reverse()]) {
      expect(project(order).tasks[0]!.status).toBe('in_progress');
    }
  });

  it('gives the same answer for any read order', () => {
    const events = [...lifecycle(1, 2, 5), ...lifecycle(1, 3, 9), ...lifecycle(2, 2, null)];
    const forward = flowReport(project(events), TODAY, 30);
    const backward = flowReport(project([...events].reverse()), TODAY, 30);
    expect(backward).toEqual(forward);
  });
});

describe('cfdReport', () => {
  it('counts tasks per column at the end of each day, subtracting on a move back', () => {
    const t = gen();
    const events = [
      created(t, day(1)),
      moved(t, 'in_progress', day(3)),
      moved(t, 'in_review', day(5)),
      moved(t, 'in_progress', day(7)), // sent back
      moved(t, 'done', day(9)),
    ];
    const r = cfdReport(project(events), TODAY, 30);
    const at = (d: string) => r.days.find((row) => row.date === d)!.counts;
    expect(at('2026-09-02')).toMatchObject({ backlog: 1, in_progress: 0 });
    expect(at('2026-09-04')).toMatchObject({ backlog: 0, in_progress: 1 });
    expect(at('2026-09-06')).toMatchObject({ in_progress: 0, in_review: 1 });
    expect(at('2026-09-08')).toMatchObject({ in_progress: 1, in_review: 0 });
    expect(at('2026-09-30')).toMatchObject({ done: 1 });
  });

  it('a task appears on the day it was created and not before', () => {
    const r = cfdReport(project(lifecycle(15, null, null)), TODAY, 30);
    const total = (d: string) => Object.values(r.days.find((row) => row.date === d)!.counts).reduce((a, b) => a + b, 0);
    expect(total('2026-09-14')).toBe(0);
    expect(total('2026-09-15')).toBe(1);
  });

  it('covers every day of the window', () => {
    const r = cfdReport(project([]), TODAY, 14);
    expect(r.days).toHaveLength(14);
    expect(r.days[0]!.date).toBe('2026-09-17');
    expect(r.days[13]!.date).toBe('2026-09-30');
  });
});

describe('runReport', () => {
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-report-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
    runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lists the reports when asked for none, or for one that does not exist', () => {
    for (const name of [undefined, 'pie']) {
      const r = runReport(dir, env, name, {});
      expect(r.ok).toBe(false);
      expect(r.error!.code).toBe('invalid_argument');
      expect(r.error!.allowed).toEqual(['flow', 'cfd', 'attention']);
    }
  });

  it('parses --since as days with or without the suffix', () => {
    expect(parseSince(undefined)).toBe(30);
    expect(parseSince('14d')).toBe(14);
    expect(parseSince('90')).toBe(90);
    // Two years is the ceiling: the chart walks every task on every day.
    expect(parseSince('730')).toBe(730);
    for (const bad of ['soon', '0', '-3', '2w', '731', '3650']) {
      const r = parseSince(bad);
      expect(typeof r).not.toBe('number');
    }
  });

  it('prints the boundary and the window in the first line, every time', () => {
    runTaskAdd(dir, env, 'One', {});
    const r = runReport(dir, env, 'flow', {});
    expect(r.ok).toBe(true);
    expect(r.message.split('\n')[0]).toMatch(/calendar days/);
    expect(r.message.split('\n')[0]).toMatch(/Work starts at "in_progress"/);
  });

  it('returns the same structure as JSON with the schema field', () => {
    runTaskAdd(dir, env, 'One', {});
    runTaskMove(dir, env, 'KAD-1', 'in_progress');
    const r = runReport(dir, env, 'flow', { json: true });
    expect(r.data!['schema']).toBe('kadence/v1');
    expect(r.data!['report']).toBe('flow');
    expect(r.data!['unit']).toBe('calendar days');
    expect(r.data!['wip']).toBe(1);
  });

  it('renders the cfd one row per week and says the JSON has every day', () => {
    runTaskAdd(dir, env, 'One', {});
    const r = runReport(dir, env, 'cfd', { since: '30d' });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/one row per week/);
    expect((runReport(dir, env, 'cfd', { since: '30d', json: true }).data!['days'] as unknown[]).length).toBe(30);
  });
});

describe('windowEnding', () => {
  it('is inclusive at both ends', () => {
    expect(windowEnding(new Date('2026-03-01T23:00:00Z'), 1)).toEqual({ from: '2026-03-01', to: '2026-03-01', days: 1 });
    expect(windowEnding(new Date('2026-03-01T23:00:00Z'), 2).from).toBe('2026-02-28');
  });
});
