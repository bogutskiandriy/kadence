import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import {
  runTaskAdd,
  runTaskList,
  runTaskMove,
  runTaskAssign,
  runTaskEdit,
  runTaskCancel,
  runTaskDelete,
} from '../src/cli/commands/task.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flowit-bulk-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  runInit(dir);
  for (const t of ['First', 'Second', 'Third']) runTaskAdd(dir, env, t, { estimate: 2 });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const tasks = () => runTaskList(dir, env, {}).data!['tasks'] as Array<Record<string, unknown>>;

describe('bulk move', () => {
  it('moves several tasks at once', () => {
    const r = runTaskMove(dir, env, 'FLOW-1,FLOW-2', 'done');
    expect(r.ok).toBe(true);
    expect(tasks().filter((t) => t['status'] === 'done')).toHaveLength(2);
  });

  it('reports the result in one line, not one per task', () => {
    const r = runTaskMove(dir, env, 'FLOW-1,FLOW-2,FLOW-3', 'todo');
    expect(r.message.split('\n')[0]).toContain('3 tasks');
  });

  it('tolerates spaces around the commas', () => {
    expect(runTaskMove(dir, env, 'FLOW-1, FLOW-2', 'done').ok).toBe(true);
  });

  it('acts once when the same task is named twice', () => {
    runTaskMove(dir, env, 'FLOW-1,FLOW-1', 'done');
    const history = tasks().find((t) => t['label'] === 'FLOW-1')!['history'] as unknown[];
    expect(history.filter((h) => (h as { type: string }).type === 'task.moved')).toHaveLength(1);
  });
});

describe('all or nothing', () => {
  it('changes nothing when one id is missing', () => {
    // A half-applied bulk edit is harder to undo than one that never ran.
    const r = runTaskMove(dir, env, 'FLOW-1,FLOW-99', 'done');
    expect(r.ok).toBe(false);
    expect(tasks().every((t) => t['status'] === 'backlog')).toBe(true);
  });

  it('names the missing ids and says nothing was changed', () => {
    const r = runTaskMove(dir, env, 'FLOW-1,FLOW-98,FLOW-99', 'done');
    expect(r.message).toContain('FLOW-98');
    expect(r.message).toContain('FLOW-99');
    expect(r.message).toMatch(/nothing was changed/i);
  });

  it('applies to assign, edit, cancel and delete alike', () => {
    expect(runTaskAssign(dir, env, 'FLOW-1,FLOW-99', 'dev@example.com').ok).toBe(false);
    expect(runTaskEdit(dir, env, 'FLOW-1,FLOW-99', { priority: 'high' }).ok).toBe(false);
    expect(runTaskCancel(dir, env, 'FLOW-1,FLOW-99').ok).toBe(false);
    expect(runTaskDelete(dir, env, 'FLOW-1,FLOW-99').ok).toBe(false);
    expect(tasks()).toHaveLength(3);
  });
});

describe('bulk assign and edit', () => {
  it('assigns a whole set to one person', () => {
    runTaskAssign(dir, env, 'FLOW-1,FLOW-2,FLOW-3', 'dev@example.com');
    expect(tasks().every((t) => t['assignee'] === 'dev@example.com')).toBe(true);
  });

  it('edits shared fields across tasks', () => {
    runTaskEdit(dir, env, 'FLOW-1,FLOW-2', { priority: 'urgent', due: '2026-10-01' });
    const changed = tasks().filter((t) => t['priority'] === 'urgent');
    expect(changed).toHaveLength(2);
    expect(changed[0]!['due']).toBe('2026-10-01');
  });

  it('refuses to set one title on many tasks', () => {
    // Applying a title to several tasks would duplicate them, not edit them.
    const r = runTaskEdit(dir, env, 'FLOW-1,FLOW-2', { title: 'Same name' });
    expect(r.exitCode).toBe(2);
    expect(r.message).toMatch(/one task at a time/i);
  });

  it('skips tasks that already match, and says how many', () => {
    runTaskMove(dir, env, 'FLOW-1', 'done');
    const r = runTaskMove(dir, env, 'FLOW-1,FLOW-2', 'done');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/1 already done/i);
  });
});

describe('list filters through the CLI', () => {
  it('filters by search text', () => {
    const r = runTaskList(dir, env, { search: 'Second' });
    expect((r.data!['tasks'] as unknown[])).toHaveLength(1);
  });

  it('explains an empty result by naming the filters', () => {
    const r = runTaskList(dir, env, { search: 'nothing matches this' });
    expect(r.message).toMatch(/no tasks match/i);
    expect(r.message).toContain('nothing matches this');
  });

  it('rejects an unknown sort key with the valid ones listed', () => {
    const r = runTaskList(dir, env, { sort: 'colour' });
    expect(r.exitCode).toBe(2);
    expect(r.message).toMatch(/created.*priority.*due/s);
  });

  it('sorts by priority when asked', () => {
    runTaskEdit(dir, env, 'FLOW-3', { priority: 'urgent' });
    const r = runTaskList(dir, env, { sort: 'priority' });
    const first = (r.data!['tasks'] as Array<Record<string, unknown>>)[0]!;
    expect(first['title']).toBe('Third');
  });
});
