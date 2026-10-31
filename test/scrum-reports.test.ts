import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove, runTaskClaim } from '../src/cli/commands/task.js';
import { runSprintCreate, runSprintAdd, runSprintClose } from '../src/cli/commands/sprint.js';
import { runSprintRetro } from '../src/cli/commands/sprint.js';
import { runGoalSet } from '../src/cli/commands/goal.js';
import { runDecisionAdd } from '../src/cli/commands/decision.js';
import { runReport } from '../src/cli/commands/report.js';

/**
 * Sprint Review and Daily Scrum as reports (Scrum Guide 2020).
 *
 * The Review inspects the outcome of the sprint against its goal and decides
 * what comes next; the Daily inspects progress toward the Sprint Goal. Both
 * are questions the journal already holds the answers to — the reports only
 * put them in the order the event asks them.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-scrum-reports-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'dev@example.com'], { cwd: dir });
  runInit(dir);
  runGoalSet(dir, env, 'Teams run sprints from the repository');
  runSprintCreate(dir, env, 'Sprint 1', { goal: 'Sign-in end to end' });
  runTaskAdd(dir, env, 'Login form', { estimate: 3 });
  runTaskAdd(dir, env, 'Session cookie', { estimate: 5 });
  runTaskAdd(dir, env, 'Password reset', { estimate: 2 });
  for (const n of [1, 2, 3]) runSprintAdd(dir, env, `KAD-${n}`, {});
  runTaskMove(dir, env, 'KAD-1', 'done');
  runTaskClaim(dir, env, 'KAD-2');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('report review', () => {
  it('sets the sprint against its goal: done, not done, points', () => {
    const r = runReport(dir, env, 'review', {});
    expect(r.ok).toBe(true);
    const review = r.data!['review'] as Record<string, unknown>;
    expect(review['goal']).toBe('Sign-in end to end');
    expect(review['done']).toEqual([{ label: 'KAD-1', title: 'Login form', estimate: 3 }]);
    expect((review['notDone'] as Array<Record<string, unknown>>).map((t) => t['label'])).toEqual(['KAD-2', 'KAD-3']);
    expect(review['velocity']).toBe(3);
    expect(review['committed']).toBe(10);
    expect(r.message).toContain('Goal: Sign-in end to end');
  });

  it('names the Product Goal it serves', () => {
    const r = runReport(dir, env, 'review', {});
    expect((r.data!['review'] as Record<string, unknown>)['productGoal']).toMatchObject({
      label: 'PG-1',
      text: 'Teams run sprints from the repository',
    });
  });

  it('carries the decisions recorded during the sprint, and the retrospective', () => {
    runDecisionAdd(dir, env, 'Cookies, not tokens', { why: 'one domain' });
    runSprintRetro(dir, env, 'Reviews were slow', {});

    const review = runReport(dir, env, 'review', {}).data!['review'] as Record<string, unknown>;
    expect((review['decisions'] as Array<Record<string, unknown>>).map((d) => d['title'])).toEqual([
      'Cookies, not tokens',
    ]);
    expect((review['retro'] as Array<Record<string, unknown>>).map((n) => n['text'])).toEqual(['Reviews were slow']);
  });

  it('after the close, reviews the sprint that just ended', () => {
    runSprintClose(dir, env);
    const r = runReport(dir, env, 'review', {});
    expect(r.ok).toBe(true);
    expect((r.data!['review'] as Record<string, unknown>)['sprint']).toBe('Sprint 1');
  });

  it('takes --sprint', () => {
    runSprintCreate(dir, env, 'Sprint 2');
    const r = runReport(dir, env, 'review', { sprint: 'Sprint 1' });
    expect((r.data!['review'] as Record<string, unknown>)['sprint']).toBe('Sprint 1');
  });

  it('writes a page', () => {
    const r = runReport(dir, env, 'review', { html: true });
    expect(r.ok).toBe(true);
    const html = readFileSync(join(dir, 'kadence-review.html'), 'utf8');
    expect(html).toContain('Sign-in end to end');
  });
});

describe('report daily', () => {
  it('shows progress toward the Sprint Goal and what moved in the last day', () => {
    const r = runReport(dir, env, 'daily', {});
    expect(r.ok).toBe(true);
    const daily = r.data!['daily'] as Record<string, unknown>;
    expect(daily['goal']).toBe('Sign-in end to end');
    expect(daily['done']).toBe(3);
    expect(daily['committed']).toBe(10);
    const moved = daily['moved'] as Array<Record<string, unknown>>;
    expect(moved.map((m) => [m['label'], m['to']])).toEqual(
      expect.arrayContaining([
        ['KAD-1', 'done'],
        ['KAD-2', 'in_progress'],
      ]),
    );
    expect((daily['inProgress'] as Array<Record<string, unknown>>)[0]).toMatchObject({
      label: 'KAD-2',
      claimedBy: 'dev@example.com',
    });
    expect(r.message).toContain('Goal: Sign-in end to end');
  });

  it('names blocked work, because that is what the Daily is for', () => {
    runTaskMove(dir, env, 'KAD-3', 'blocked');
    const daily = runReport(dir, env, 'daily', {}).data!['daily'] as Record<string, unknown>;
    expect((daily['blocked'] as Array<Record<string, unknown>>).map((t) => t['label'])).toEqual(['KAD-3']);
  });

  it('needs an active sprint', () => {
    runSprintClose(dir, env);
    const r = runReport(dir, env, 'daily', {});
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('sprint_not_found');
  });
});
