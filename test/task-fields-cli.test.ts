import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskAssign, runTaskShow, runTaskList } from '../src/cli/commands/task.js';
import { runBoard } from '../src/cli/commands/board.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprintit-fields-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('task add with the full field set', () => {
  it('accepts description, type, priority, assignee, labels and estimate', () => {
    const r = runTaskAdd(dir, env, 'Fix login', {
      description: 'The user cannot sign in after the 2.3 update.',
      type: 'bug',
      priority: 'urgent',
      assignee: 'dev@example.com',
      labels: ['auth', 'hotfix'],
      estimate: 5,
    });
    expect(r.ok).toBe(true);

    const t = runTaskList(dir, env, {}).data!['tasks'] as Array<Record<string, unknown>>;
    expect(t[0]!['description']).toBe('The user cannot sign in after the 2.3 update.');
    expect(t[0]!['type']).toBe('bug');
    expect(t[0]!['priority']).toBe('urgent');
    expect(t[0]!['assignee']).toBe('dev@example.com');
    expect(t[0]!['labels']).toEqual(['auth', 'hotfix']);
    expect(t[0]!['estimate']).toBe(5);
  });

  it('rejects an unknown type and lists the valid ones', () => {
    // `epic` became a valid type in Milestone 10 — an epic is a task that
    // other tasks call parent, not a separate entity.
    const r = runTaskAdd(dir, env, 'A', { type: 'milestone' });
    expect(r.exitCode).toBe(2);
    expect(r.message).toMatch(/task.*bug.*story.*epic/s);
  });

  it('rejects an unknown priority', () => {
    expect(runTaskAdd(dir, env, 'A', { priority: 'critical' }).exitCode).toBe(2);
  });

  it('works without any optional field', () => {
    expect(runTaskAdd(dir, env, 'Plain task', {}).ok).toBe(true);
  });
});

describe('task assign', () => {
  it('assigns an assignee', () => {
    runTaskAdd(dir, env, 'Task', {});
    const r = runTaskAssign(dir, env, 'FLOW-1', 'dev@example.com');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('dev@example.com');
  });

  it('clears the assignment with the word none', () => {
    runTaskAdd(dir, env, 'Task', { assignee: 'dev@example.com' });
    const r = runTaskAssign(dir, env, 'FLOW-1', 'none');
    expect(r.ok).toBe(true);
    const t = runTaskList(dir, env, {}).data!['tasks'] as Array<Record<string, unknown>>;
    expect(t[0]!['assignee']).toBeNull();
  });

  it('writes no event when the assignee is unchanged', () => {
    runTaskAdd(dir, env, 'Task', { assignee: 'dev@example.com' });
    const before = (runTaskList(dir, env, {}).data!['tasks'] as Array<{ history: unknown[] }>)[0]!.history.length;
    runTaskAssign(dir, env, 'FLOW-1', 'dev@example.com');
    const after = (runTaskList(dir, env, {}).data!['tasks'] as Array<{ history: unknown[] }>)[0]!.history.length;
    expect(after).toBe(before);
  });

  it('reports when the task does not exist', () => {
    expect(runTaskAssign(dir, env, 'FLOW-99', 'dev@example.com').exitCode).toBe(1);
  });
});

describe('task show', () => {
  it('shows the description before the estimate — substance first, cost after', () => {
    runTaskAdd(dir, env, 'Fix login', {
      description: 'Detailed description of the problem.',
      estimate: 5,
    });
    const msg = runTaskShow(dir, env, 'FLOW-1').message;
    expect(msg.indexOf('Detailed description')).toBeLessThan(msg.indexOf('5'));
  });

  it('shows every task field', () => {
    runTaskAdd(dir, env, 'Fix login', {
      description: 'Description',
      type: 'bug',
      priority: 'high',
      assignee: 'dev@example.com',
      labels: ['auth'],
      estimate: 3,
    });
    const msg = runTaskShow(dir, env, 'FLOW-1').message;
    for (const part of ['bug', 'high', 'dev@example.com', 'auth', 'Description', 'pm@example.com']) {
      expect(msg).toContain(part);
    }
  });

  it('shows the change history', () => {
    runTaskAdd(dir, env, 'Task', {});
    runTaskAssign(dir, env, 'FLOW-1', 'dev@example.com');
    expect(runTaskShow(dir, env, 'FLOW-1').message).toMatch(/history/i);
  });

  it('reports when the task does not exist', () => {
    expect(runTaskShow(dir, env, 'FLOW-99').exitCode).toBe(1);
  });
});

describe('board', () => {
  it('lays tasks out into state columns', () => {
    runTaskAdd(dir, env, 'In backlog', {});
    runTaskAdd(dir, env, 'In progress', {});
    const msg = runBoard(dir, env, {}).message;
    expect(msg).toContain('backlog');
    expect(msg).toContain('In backlog');
  });

  it('an empty board hints at what to do', () => {
    expect(runBoard(dir, env, {}).message).toMatch(/task add/);
  });

  it('filters by assignee', () => {
    runTaskAdd(dir, env, 'Mine', { assignee: 'me@example.com' });
    runTaskAdd(dir, env, 'Theirs', { assignee: 'other@example.com' });
    const msg = runBoard(dir, env, { assignee: 'me@example.com' }).message;
    expect(msg).toContain('Mine');
    expect(msg).not.toContain('Theirs');
  });

  it('returns a structure for agents', () => {
    runTaskAdd(dir, env, 'Task', {});
    const data = runBoard(dir, env, {}).data!;
    expect(data['schema']).toBe('sprintit/v1');
    expect(Object.keys(data['columns'] as object)).toContain('backlog');
  });
});

describe('long titles', () => {
  const long = 'A'.repeat(250);

  it('truncates in the list so one task cannot stretch every row', () => {
    runTaskAdd(dir, env, long, {});
    const line = runTaskList(dir, env, {}).message;
    expect(line.length).toBeLessThan(120);
    expect(line).toContain('…');
  });

  it('truncates on the board too', () => {
    runTaskAdd(dir, env, long, {});
    expect(runBoard(dir, env, {}).message).toContain('…');
  });

  it('keeps the full title in show — truncation is a display concern only', () => {
    runTaskAdd(dir, env, long, {});
    expect(runTaskShow(dir, env, 'FLOW-1').message).toContain(long);
  });

  it('keeps the full title in JSON — agents get the real value', () => {
    runTaskAdd(dir, env, long, {});
    const tasks = runTaskList(dir, env, {}).data!['tasks'] as Array<Record<string, unknown>>;
    expect(tasks[0]!['title']).toBe(long);
  });

  it('does not split multi-byte characters when truncating', () => {
    runTaskAdd(dir, env, '🚀'.repeat(100), {});
    const line = runTaskList(dir, env, {}).message;
    expect(line).not.toContain('�');
  });
});
