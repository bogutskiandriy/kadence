import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove } from '../src/cli/commands/task.js';
import {
  runSprintCreate,
  runSprintAdd,
  runSprintClose,
  runSprintEdit,
  runSprintStart,
  runSprintList,
} from '../src/cli/commands/sprint.js';
import { runReport } from '../src/cli/commands/report.js';

/**
 * Sprint Planning and the sprint's boundaries, as the Scrum Guide 2020 has them.
 *
 * Planning answers why (the goal), what (the work taken in, against what the
 * team has actually finished before) and how. A sprint is a month or less.
 * Work not done at the end goes back to the Product Backlog or on into the
 * next sprint. kadence says these things; it does not enforce them, because it
 * also serves teams that do not run Scrum.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-scrum-plan-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'sm@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('sprint start — planning', () => {
  it('without a goal, warns and names the command that sets one', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintCreate(dir, env, 'Sprint 2');
    runSprintClose(dir, env);

    const r = runSprintStart(dir, env, 'Sprint 2');
    expect(r.ok).toBe(true);
    expect((r.warnings ?? []).join('\n')).toContain('kadence sprint edit "Sprint 2" --goal');
  });

  it('the first sprint, started by create, gets the same warning', () => {
    const r = runSprintCreate(dir, env, 'Sprint 1');
    expect((r.warnings ?? []).join('\n')).toContain('--goal');
  });

  it('with a goal, no goal warning', () => {
    const r = runSprintCreate(dir, env, 'Sprint 1', { goal: 'Ship it' });
    expect((r.warnings ?? []).join('\n')).not.toContain('--goal');
  });

  it('sets what was taken in against the velocity range of finished sprints', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintCreate(dir, env, 'Sprint 2');
    runSprintCreate(dir, env, 'Sprint 3', { goal: 'More' });
    runTaskAdd(dir, env, 'Five', { estimate: 5 });
    runTaskAdd(dir, env, 'Eight', { estimate: 8 });
    runTaskAdd(dir, env, 'Big', { estimate: 20 });
    runSprintAdd(dir, env, 'KAD-1', {});
    runTaskMove(dir, env, 'KAD-1', 'done');
    runSprintClose(dir, env);
    runSprintStart(dir, env, 'Sprint 2');
    runSprintAdd(dir, env, 'KAD-2', {});
    runTaskMove(dir, env, 'KAD-2', 'done');
    runSprintClose(dir, env);
    runSprintAdd(dir, env, 'KAD-3', { sprint: 'Sprint 3' });

    const r = runSprintStart(dir, env, 'Sprint 3');
    const planning = r.data!['planning'] as Record<string, unknown>;
    expect(planning['committed']).toBe(20);
    expect(planning['velocity']).toMatchObject({ low: 5, high: 8, sprints: 2 });
    expect(r.message).toContain('20 points');
    expect((r.warnings ?? []).join('\n')).toMatch(/more than any finished sprint/);
  });

  it('names how many closed sprints the velocity comes from', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintCreate(dir, env, 'Sprint 2', { goal: 'g' });
    runSprintClose(dir, env);

    const r = runSprintStart(dir, env, 'Sprint 2');
    expect(r.message).toContain('(1 closed sprint(s))');
  });
});

describe('sprint length', () => {
  it('longer than a month is allowed and warned about', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    const r = runSprintEdit(dir, env, undefined, { startDate: '2026-11-01', endDate: '2026-12-15' });
    expect(r.ok).toBe(true);
    expect((r.warnings ?? []).join('\n')).toMatch(/longer than a month/);
  });

  it('a month or less says nothing', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    const r = runSprintEdit(dir, env, undefined, { startDate: '2026-11-01', endDate: '2026-11-14' });
    expect(r.warnings ?? []).toEqual([]);
  });
});

describe('sprint close --carry-to', () => {
  beforeEach(() => {
    runSprintCreate(dir, env, 'Sprint 1');
    runSprintCreate(dir, env, 'Sprint 2');
    runTaskAdd(dir, env, 'Finished', { estimate: 3 });
    runTaskAdd(dir, env, 'Unfinished', { estimate: 5 });
    runSprintAdd(dir, env, 'KAD-1', {});
    runSprintAdd(dir, env, 'KAD-2', {});
    runTaskMove(dir, env, 'KAD-1', 'done');
  });

  it('moves the unfinished work into the named sprint', () => {
    const r = runSprintClose(dir, env, { carryTo: 'Sprint 2' });
    expect(r.ok).toBe(true);

    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list[1]!['taskCount']).toBe(1);
  });

  it('"next" means the oldest planned sprint', () => {
    runSprintClose(dir, env, { carryTo: 'next' });
    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list[1]!['taskCount']).toBe(1);
  });

  it('the closed sprint keeps its record: velocity, committed and what carried over', () => {
    runSprintClose(dir, env, { carryTo: 'Sprint 2' });
    runSprintStart(dir, env, 'Sprint 2');
    // Finished in the next sprint: still carried over in the first one's record.
    runTaskMove(dir, env, 'KAD-2', 'done');

    const rows = runReport(dir, env, 'velocity', { json: true }).data!['rows'] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ name: 'Sprint 1', committed: 8, velocity: 3, carriedOver: 5 });
  });

  it('an unknown target fails before anything is closed', () => {
    const r = runSprintClose(dir, env, { carryTo: 'Sprint 9' });
    expect(r.ok).toBe(false);
    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list[0]!['status']).toBe('active');
  });

  it('without --carry-to, the close names the option when work is left', () => {
    const r = runSprintClose(dir, env);
    expect(r.message).toContain('--carry-to');
  });
});
