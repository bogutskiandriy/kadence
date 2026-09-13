import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project } from '../src/core/projection.js';
import { sprintReport } from '../src/core/velocity.js';
import type { FlowEvent } from '../src/core/event.js';
import { createUlid } from '../src/core/ulid.js';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove } from '../src/cli/commands/task.js';
import { runBoardConfig } from '../src/cli/commands/board.js';
import { runSprintCreate, runSprintAdd, runSprintClose } from '../src/cli/commands/sprint.js';
import { runPrime } from '../src/cli/commands/prime.js';

/**
 * The "started" boundary.
 *
 * Every flow metric — cycle time, work item age, the sprint report's actual
 * hours — begins at the moment work starts. That moment used to be the literal
 * string `in_progress`, while statuses are configurable: a board named
 * `todo,doing,review,done` closed every sprint with `actualHours: null` and
 * never said why. The boundary is now a setting, folded like the columns are.
 */

const gen = createUlid();
const at = (h: number): string => new Date(Date.UTC(2026, 8, 10, h)).toISOString();

function ev(type: string, entity: string, data: Record<string, unknown>, ts = at(10)): FlowEvent {
  return { id: gen(), type, entity, actor: 'a@b.c', ts, source: 'human', data } as FlowEvent;
}

describe('started boundary in the fold', () => {
  it('defaults to in_progress', () => {
    expect(project([]).started).toBe('in_progress');
  });

  it('takes the configured status', () => {
    const c = gen();
    const state = project([
      { ...ev('board.configured', c, { statuses: ['todo', 'doing', 'done'], started: 'doing' }), id: c },
    ]);
    expect(state.started).toBe('doing');
  });

  it('survives a later change that only touches the columns', () => {
    const a = gen();
    const b = gen();
    const state = project([
      { ...ev('board.configured', a, { started: 'doing' }), id: a },
      { ...ev('board.configured', b, { statuses: ['todo', 'doing', 'review', 'done'] }), id: b },
    ]);
    expect(state.started).toBe('doing');
  });

  it('reopening a task lands it in the configured started column, not a literal', () => {
    const c = gen();
    const t = gen();
    const state = project([
      { ...ev('board.configured', c, { statuses: ['todo', 'doing', 'done'], started: 'doing' }), id: c },
      { ...ev('task.created', t, { title: 'T' }), id: t },
      ev('task.moved', t, { to: 'done' }),
      ev('task.reopened', t, {}),
    ]);
    expect(state.tasks[0]!.status).toBe('doing');
  });

  it('the sprint report measures actual hours from the configured boundary', () => {
    const c = gen();
    const s = gen();
    const t = gen();
    const state = project([
      { ...ev('board.configured', c, { statuses: ['todo', 'doing', 'done'], started: 'doing' }), id: c },
      { ...ev('sprint.created', s, { name: 'S1' }), id: s },
      ev('sprint.started', s, {}),
      { ...ev('task.created', t, { title: 'T', estimate: 2 }), id: t },
      ev('sprint.task_added', s, { task: t }),
      ev('task.moved', t, { to: 'doing' }, at(10)),
      ev('task.moved', t, { to: 'done' }, at(14)),
    ]);
    const report = sprintReport(state, s)!;
    expect(report.actualHours).toBeCloseTo(4, 1);
    expect(report.hoursPerPoint).toBeCloseTo(2, 1);
  });
});

describe('board config --started', () => {
  let dir: string;
  const env = {} as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-started-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
    runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('fixes the sprint report on a custom board — the defect that motivated this', () => {
    runBoardConfig(dir, env, 'todo,doing,review,done', undefined, undefined);
    runBoardConfig(dir, env, undefined, undefined, 'doing');
    runSprintCreate(dir, env, 'S1');
    runTaskAdd(dir, env, 'Work', { estimate: 3 });
    runSprintAdd(dir, env, 'KAD-1', {});
    runTaskMove(dir, env, 'KAD-1', 'doing');
    runTaskMove(dir, env, 'KAD-1', 'done');
    const r = runSprintClose(dir, env);
    const report = r.data!['report'] as { actualHours: number | null };
    expect(report.actualHours).not.toBeNull();
  });

  it('takes --started in the same command as --statuses, checked against the new list', () => {
    // The natural first command on a custom board. It used to drop the flag
    // and then warn about the value it had just been given.
    const r = runBoardConfig(dir, env, 'todo,doing,done', undefined, 'doing');
    expect(r.ok).toBe(true);
    expect((r.warnings ?? []).join(' ')).not.toMatch(/--started/);
    expect(runBoardConfig(dir, env, undefined, undefined, undefined).data!['started']).toBe('doing');
  });

  it('takes --started alongside --dod', () => {
    runBoardConfig(dir, env, 'todo,doing,done', undefined, undefined);
    const r = runBoardConfig(dir, env, undefined, 'tests green', 'doing');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/started at "doing"/);
    expect(runBoardConfig(dir, env, undefined, undefined, undefined).data!['started']).toBe('doing');
  });

  it('refuses a boundary where work ends rather than starts', () => {
    for (const bad of ['done', 'cancelled']) {
      const r = runBoardConfig(dir, env, undefined, undefined, bad);
      expect(r.ok, `${bad} must be refused`).toBe(false);
      expect(r.error!.code).toBe('invalid_argument');
      expect(r.message).toMatch(/that is where it ends/);
    }
  });

  it('the sprint report agrees with report flow about what was started', () => {
    // A task that skipped the started column has still been worked on; two
    // commands must not disagree about that.
    runTaskAdd(dir, env, 'Skipped', { estimate: 2 });
    runSprintCreate(dir, env, 'S1');
    runSprintAdd(dir, env, 'KAD-1', {});
    runTaskMove(dir, env, 'KAD-1', 'in_review');
    runTaskMove(dir, env, 'KAD-1', 'done');
    const report = runSprintClose(dir, env).data!['report'] as { actualHours: number | null };
    expect(report.actualHours).not.toBeNull();
  });

  it('refuses a status that is not a column, and names the columns', () => {
    const r = runBoardConfig(dir, env, undefined, undefined, 'flying');
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('unknown_status');
    expect(r.error!.allowed).toContain('in_progress');
  });

  it('shows the boundary alongside the columns and the definition of done', () => {
    runBoardConfig(dir, env, undefined, undefined, 'in_review');
    const r = runBoardConfig(dir, env, undefined, undefined, undefined);
    expect(r.message).toMatch(/Started: in_review/);
    expect(r.data!['started']).toBe('in_review');
  });

  it('writes nothing when the boundary is already what was asked', () => {
    const r = runBoardConfig(dir, env, undefined, undefined, 'in_progress');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/already/i);
  });

  it('warns when the columns change and the boundary is no longer one of them', () => {
    runBoardConfig(dir, env, undefined, undefined, 'in_review');
    const r = runBoardConfig(dir, env, 'todo,doing,done', undefined, undefined);
    expect(r.ok).toBe(true);
    expect((r.warnings ?? []).join(' ')).toMatch(/in_review/);
    expect((r.warnings ?? []).join(' ')).toMatch(/--started/);
  });

  it('prime counts work in the configured started column as mine', () => {
    runBoardConfig(dir, env, 'todo,doing,done', undefined, undefined);
    runBoardConfig(dir, env, undefined, undefined, 'doing');
    runTaskAdd(dir, env, 'Mine', { assignee: 'tester@example.com' });
    runTaskMove(dir, env, 'KAD-1', 'doing');
    const r = runPrime(dir, env, {});
    expect(r.message).toMatch(/Mine/);
  });
});
