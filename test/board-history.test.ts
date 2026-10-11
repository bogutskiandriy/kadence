import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SUMMARY_FIELDS } from '../src/cli/commands/board.js';

const CLI = resolve('dist/cli.js');
let dir: string;

function run(args: string[]): { stdout: string; stderr: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function tasksOf(board: any): Record<string, unknown>[] {
  return Object.values(board.columns as Record<string, Record<string, unknown>[]>).flat();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-board-history-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run(['init']);
  for (let i = 1; i <= 3; i++) run(['task', 'add', `Task ${i}`, '-d', 'Something to do']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('board --json without flags (G5, DEC-55)', () => {
  // Measured 2026-10-12: 17 KB at 30 events and 82 KB at 300 on the same
  // thirty tasks, about 240 bytes for every event, while --summary stayed at
  // 7.5 KB. Agents are who call board --json, and an agent that does not know
  // the flag paid for the whole history on every call.

  it('carries the state of each task and nothing that grows with its history', () => {
    const board = JSON.parse(run(['board', '--json']).stdout);
    for (const task of tasksOf(board)) {
      expect(Object.keys(task).sort()).toEqual([...SUMMARY_FIELDS].sort());
    }
  });

  it(
    'is the same size after the tasks have been worked on as before',
    () => {
      const before = run(['board', '--json']).stdout;
      // Comments and moves that end where they started: the state is the
      // same, only the history is longer — ten events on each task.
      for (let round = 0; round < 3; round++) {
        for (let i = 1; i <= 3; i++) {
          run(['task', 'move', `KAD-${i}`, 'in_progress']);
          run(['task', 'comment', `KAD-${i}`, `Round ${round}: a comment long enough to be counted`]);
          run(['task', 'move', `KAD-${i}`, 'todo']);
        }
      }
      run(['task', 'move', 'KAD-1', 'backlog']);
      run(['task', 'move', 'KAD-2', 'backlog']);
      run(['task', 'move', 'KAD-3', 'backlog']);
      const after = run(['board', '--json']).stdout;

      expect(JSON.parse(run(['board', '--json', '--history']).stdout).columns).toBeDefined();
      expect(after.length).toBe(before.length);
    },
    60_000,
  );

  it('gives the full tasks, history and comments included, with --history', () => {
    run(['task', 'comment', 'KAD-1', 'Started on it']);
    const r = run(['board', '--json', '--history']);
    expect(r.code, r.stderr).toBe(0);
    const task = tasksOf(JSON.parse(r.stdout)).find((t) => t['label'] === 'KAD-1')!;

    expect(Object.keys(task)).toEqual(expect.arrayContaining(['history', 'comments', 'description']));
    expect((task['comments'] as unknown[]).length).toBe(1);
  });

  it('still accepts --summary, and answers with what the default now is', () => {
    const summary = run(['board', '--json', '--summary']);
    expect(summary.code, summary.stderr).toBe(0);
    expect(summary.stdout).toBe(run(['board', '--json']).stdout);
  });

  it('lets --fields name history explicitly, because naming fields says what you want', () => {
    run(['task', 'comment', 'KAD-1', 'Started on it']);
    const board = JSON.parse(run(['board', '--json', '--fields', 'label,comments']).stdout);
    const task = tasksOf(board).find((t) => t['label'] === 'KAD-1')!;
    expect(Object.keys(task).sort()).toEqual(['comments', 'label']);
  });

  it('publishes --history in the contract', () => {
    const board = (JSON.parse(run(['schema', '--json']).stdout).contract.commands as any[]).find(
      (c) => c.name === 'board',
    );
    expect(board.flags).toContain('--history');
  });
});
