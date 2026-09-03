import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove, runTaskList } from '../src/cli/commands/task.js';
import { runBoard, runBoardConfig } from '../src/cli/commands/board.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flowit-cfg-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('board config', () => {
  it('shows the default columns before anything is configured', () => {
    const r = runBoardConfig(dir, env, undefined);
    expect(r.message).toContain('backlog');
    expect(r.message).toContain('in_progress');
  });

  it('replaces the columns with a custom set', () => {
    const r = runBoardConfig(dir, env, 'todo,doing,review,done');
    expect(r.ok).toBe(true);
    expect(r.data!['statuses']).toEqual(['todo', 'doing', 'review', 'done']);
  });

  it('normalises spacing and case', () => {
    const r = runBoardConfig(dir, env, ' To Do , Doing , DONE ');
    expect(r.data!['statuses']).toEqual(['to_do', 'doing', 'done']);
  });

  it('requires done — every analytic is computed from it', () => {
    const r = runBoardConfig(dir, env, 'todo,doing,shipped');
    expect(r.exitCode).toBe(2);
    expect(r.message).toMatch(/velocity and burndown/i);
  });

  it('rejects duplicates', () => {
    expect(runBoardConfig(dir, env, 'todo,todo,done').exitCode).toBe(2);
  });

  it('rejects an empty list', () => {
    expect(runBoardConfig(dir, env, ' , , ').exitCode).toBe(2);
  });

  it('accepts moves into the new columns and refuses the old ones', () => {
    runTaskAdd(dir, env, 'Task', {});
    runBoardConfig(dir, env, 'todo,doing,done');

    expect(runTaskMove(dir, env, 'FLOW-1', 'doing').ok).toBe(true);
    const r = runTaskMove(dir, env, 'FLOW-1', 'in_review');
    expect(r.exitCode).toBe(2);
    expect(r.message).toContain('todo, doing, done');
  });
});

describe('statuses removed while tasks sit in them', () => {
  it('keeps the tasks visible instead of hiding them', () => {
    // One branch can drop a column while another moves a task into it.
    // Hiding the task would lose work silently.
    runTaskAdd(dir, env, 'Stranded', {});
    runTaskMove(dir, env, 'FLOW-1', 'in_review');
    runBoardConfig(dir, env, 'todo,doing,done');

    const board = runBoard(dir, env, {});
    expect(board.message).toContain('Stranded');
    expect(Object.keys(board.data!['columns'] as object)).toContain('in_review');
  });

  it('warns about columns that are not in the configuration', () => {
    runTaskAdd(dir, env, 'Stranded', {});
    runTaskMove(dir, env, 'FLOW-1', 'in_review');
    runBoardConfig(dir, env, 'todo,doing,done');

    expect(runBoard(dir, env, {}).warnings?.join(' ')).toMatch(/not in the board configuration/i);
  });

  it('names the stranded tasks at the moment of reconfiguration', () => {
    runTaskAdd(dir, env, 'Stranded', {});
    runTaskMove(dir, env, 'FLOW-1', 'in_review');
    const r = runBoardConfig(dir, env, 'todo,doing,done');
    expect(r.message).toMatch(/remain in removed columns/i);
    expect(r.message).toContain('in_review');
  });

  it('still lists them through task list', () => {
    runTaskAdd(dir, env, 'Stranded', {});
    runTaskMove(dir, env, 'FLOW-1', 'in_review');
    runBoardConfig(dir, env, 'todo,doing,done');
    expect((runTaskList(dir, env, {}).data!['tasks'] as unknown[])).toHaveLength(1);
  });
});
