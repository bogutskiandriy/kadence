import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import {
  runSprintCreate,
  runSprintEdit,
  runSprintList,
  runSprintStatus,
} from '../src/cli/commands/sprint.js';
import { runGoalSet, runGoalShow, runGoalClose } from '../src/cli/commands/goal.js';
import { runPrime } from '../src/cli/commands/prime.js';
import { project } from '../src/core/projection.js';
import type { FlowEvent } from '../src/core/event.js';

/**
 * The two commitments Scrum attaches to its backlogs (Scrum Guide 2020).
 *
 * A Sprint Backlog is held to its Sprint Goal and a Product Backlog to its
 * Product Goal. Without them a sprint is a list with dates on it, and nothing
 * tells the team — or the agent joining the session — what the list is for.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-goals-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'po@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('Sprint Goal', () => {
  it('is set when the sprint is created', () => {
    runSprintCreate(dir, env, 'Sprint 1', { goal: 'Sign-in works end to end' });

    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list[0]!['goal']).toBe('Sign-in works end to end');
  });

  it('can be set later with sprint edit', () => {
    runSprintCreate(dir, env, 'Sprint 1');
    const r = runSprintEdit(dir, env, undefined, { goal: 'Ship the importer' });

    expect(r.ok).toBe(true);
    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list[0]!['goal']).toBe('Ship the importer');
  });

  it('is null in --json when the sprint has none, never absent', () => {
    runSprintCreate(dir, env, 'Sprint 1');

    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list[0]).toHaveProperty('goal', null);
  });

  it('leads sprint status, because the list is for it', () => {
    runSprintCreate(dir, env, 'Sprint 1', { goal: 'Sign-in works end to end' });

    const r = runSprintStatus(dir, env);
    expect(r.message).toContain('Goal: Sign-in works end to end');
    expect((r.data!['report'] as Record<string, unknown>)['goal']).toBe('Sign-in works end to end');
  });

  it('changing it mid-sprint is allowed, and said out loud', () => {
    // Scrum: the Sprint Goal does not change during the sprint. A tool that
    // refused would push the change somewhere it cannot be seen; a warning
    // keeps it in the journal and names what it means.
    runSprintCreate(dir, env, 'Sprint 1', { goal: 'First' });
    const r = runSprintEdit(dir, env, undefined, { goal: 'Second' });

    expect(r.ok).toBe(true);
    expect((r.warnings ?? []).join('\n')).toMatch(/Sprint Goal changed while the sprint is active/);
  });

  it('reaches prime, text and --json', () => {
    runSprintCreate(dir, env, 'Sprint 1', { goal: 'Sign-in works end to end' });

    const r = runPrime(dir, env, {});
    expect(r.message).toContain('Goal: Sign-in works end to end');
    expect((r.data!['sprint'] as Record<string, unknown>)['goal']).toBe('Sign-in works end to end');
  });
});

describe('Product Goal', () => {
  it('is set and shown', () => {
    const set = runGoalSet(dir, env, 'Teams run their sprints from the repository');
    expect(set.ok).toBe(true);

    const r = runGoalShow(dir, env, {});
    expect(r.message).toContain('Teams run their sprints from the repository');
    const goal = r.data!['goal'] as Record<string, unknown>;
    expect(goal['label']).toBe('PG-1');
    expect(goal['status']).toBe('open');
  });

  it('is one at a time: a second is refused until the first is done or abandoned', () => {
    // Scrum Guide 2020: the Scrum Team must fulfill (or abandon) one objective
    // before taking on the next.
    runGoalSet(dir, env, 'First');
    const r = runGoalSet(dir, env, 'Second');

    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ code: 'conflicting_state' });
    expect(r.message).toContain('kadence goal done');
  });

  it('done closes it as achieved, and the next one can be set', () => {
    runGoalSet(dir, env, 'First');
    expect(runGoalClose(dir, env, 'achieved').ok).toBe(true);
    expect(runGoalSet(dir, env, 'Second').ok).toBe(true);

    const all = runGoalShow(dir, env, { all: true }).data!['goals'] as Array<Record<string, unknown>>;
    expect(all.map((g) => [g['text'], g['status']])).toEqual([
      ['First', 'achieved'],
      ['Second', 'open'],
    ]);
  });

  it('abandon closes it as abandoned', () => {
    runGoalSet(dir, env, 'First');
    runGoalClose(dir, env, 'abandoned');

    const r = runGoalShow(dir, env, {});
    expect(r.data!['goal']).toBeNull();
  });

  it('closing with none open fails with a next step', () => {
    const r = runGoalClose(dir, env, 'achieved');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('kadence goal set');
  });

  it('reaches prime', () => {
    runGoalSet(dir, env, 'Teams run their sprints from the repository');

    const r = runPrime(dir, env, {});
    expect(r.message).toContain('Product Goal: Teams run their sprints from the repository');
    expect(r.data!['productGoal']).toMatchObject({ label: 'PG-1' });
  });

  it('prime says nothing about it when there is none', () => {
    const r = runPrime(dir, env, {});
    expect(r.message).not.toContain('Product Goal');
    expect(r.data!['productGoal']).toBeNull();
  });
});

describe('Product Goal in the fold', () => {
  const ev = (id: string, type: string, entity: string, data: Record<string, unknown>): FlowEvent =>
    ({ id, type, entity, actor: 'a@x', ts: '2026-10-31T10:00:00.000Z', source: 'human', data }) as FlowEvent;

  it('two branches that each set a goal agree on which one holds, whatever the read order', () => {
    // The CLI refuses a second open goal, but two machines can each set one
    // before either pushes. The later ULID holds; the earlier is marked
    // replaced rather than dropped, so the merge is visible (I1).
    const a = ev('01M60000000000000000000001', 'goal.set', '01M60000000000000000000001', { text: 'A' });
    const b = ev('01M60000000000000000000002', 'goal.set', '01M60000000000000000000002', { text: 'B' });

    for (const order of [[a, b], [b, a]]) {
      const goals = project(order).goals;
      expect(goals.map((g) => [g.text, g.status])).toEqual([
        ['A', 'replaced'],
        ['B', 'open'],
      ]);
    }
  });
});
