import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskList } from '../src/cli/commands/task.js';
import { runMilestoneCreate, runMilestoneAdd } from '../src/cli/commands/milestone.js';

/**
 * `task list --milestone` (2026-10-12 friction note).
 *
 * `milestone list` gave counts and no tasks; finding the four tasks just added
 * to a milestone took `task list --json` and a script.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const labels = (r: ReturnType<typeof runTaskList>) =>
  (r.data!['tasks'] as Array<{ label: string }>).map((t) => t.label);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-list-ms-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
  for (const t of ['Contract', 'Windows CI', 'Landing']) runTaskAdd(dir, env, t, {});
  runMilestoneCreate(dir, env, '1.0', {});
  runMilestoneAdd(dir, env, 'KAD-1', '1.0');
  runMilestoneAdd(dir, env, 'KAD-2', '1.0');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('task list --milestone', () => {
  it('lists only the tasks in that milestone, by its MS-N label or its name', () => {
    expect(labels(runTaskList(dir, env, { milestone: 'MS-1', json: true }))).toEqual(['KAD-1', 'KAD-2']);
    expect(labels(runTaskList(dir, env, { milestone: '1.0', json: true }))).toEqual(['KAD-1', 'KAD-2']);
  });

  it('combines with the other filters', () => {
    expect(labels(runTaskList(dir, env, { milestone: 'MS-1', search: 'windows', json: true }))).toEqual(['KAD-2']);
  });

  it('answers milestone_not_found with the milestones there are', () => {
    const r = runTaskList(dir, env, { milestone: '2.0', json: true });
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('milestone_not_found');
    expect(r.message).toContain('MS-1 1.0');
  });
});
