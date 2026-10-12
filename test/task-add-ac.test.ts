import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runBoardConfig } from '../src/cli/commands/board.js';
import { runTaskAdd, runTaskClaim, loadState } from '../src/cli/commands/task.js';

/**
 * Acceptance criteria on the command that creates the task (2026-10-12).
 *
 * Checking 0.10.0 from the registry, the first thing typed was
 * `task add "…" --ac "…"`, and it was refused: criteria went on one at a time,
 * a command each, after the task existed. A task written with its criteria is
 * a task `claim` can tell an agent the meaning of done for.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const criteria = () => loadState(dir).state.tasks[0]!.criteria.map((c) => c.text);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-add-ac-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('task add --ac', () => {
  it('adds the criteria in the order given', () => {
    const r = runTaskAdd(dir, env, 'Login form', { ac: ['shows an error on a bad password', 'remembers the email'] });
    expect(r.ok, r.message).toBe(true);
    expect(criteria()).toEqual(['shows an error on a bad password', 'remembers the email']);
  });

  it('puts them after the board definition of done, and says their numbers', () => {
    runBoardConfig(dir, env, undefined, 'npm test green,typecheck clean');
    const r = runTaskAdd(dir, env, 'Login form', { ac: ['remembers the email'] });
    expect(criteria()).toEqual(['npm test green', 'typecheck clean', 'remembers the email']);
    // The number is what `ac check` takes; a definition of done ahead of it
    // shifts it, and that is easy to get wrong without being told.
    expect(r.message).toContain('3. remembers the email');
    const data = r.data!['criteria'] as Array<{ n: number; text: string }>;
    expect(data.map((c) => c.n)).toEqual([1, 2, 3]);
  });

  it('keeps them when the definition of done is skipped', () => {
    runBoardConfig(dir, env, undefined, 'npm test green');
    runTaskAdd(dir, env, 'Spike', { noDod: true, ac: ['a written answer'] });
    expect(criteria()).toEqual(['a written answer']);
  });

  it('refuses an empty criterion and writes nothing', () => {
    const r = runTaskAdd(dir, env, 'Login form', { ac: ['remembers the email', '  '] });
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
    expect(loadState(dir).state.tasks).toEqual([]);
  });

  it('is what claim then shows as done', () => {
    runTaskAdd(dir, env, 'Login form', { ac: ['remembers the email'] });
    expect(runTaskClaim(dir, env, 'KAD-1').message).toContain('1. [ ] remembers the email');
  });
});

describe('task add --ac from the command line', () => {
  const CLI = resolve('dist/cli.js');
  const run = (...args: string[]) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });

  it('takes one, several, and text that starts with dashes', () => {
    const r = run('task', 'add', 'Board output', '--ac', 'one line per task', '--ac', '--json returns the same rows');
    expect(r.status, r.stderr).toBe(0);
    expect(criteria()).toEqual(['one line per task', '--json returns the same rows']);
    expect(run('task', 'add', 'Second', '--ac', 'only one').status).toBe(0);
    expect(loadState(dir).state.tasks[1]!.criteria.map((c) => c.text)).toEqual(['only one']);
  });

  // The parser reads `--ac ""` as the number 0, and `--ac 42` as 42: the
  // first crashed on `.trim`, the second would have stored a number.
  it('refuses an empty one with a usage error, and keeps a number as text', () => {
    const empty = run('task', 'add', 'Board output', '--ac', '', '--json');
    expect(empty.status).toBe(2);
    expect(JSON.parse(empty.stdout).error.code).toBe('invalid_argument');
    expect(run('task', 'add', 'Board output', '--ac', '42').status).toBe(0);
    expect(criteria()).toEqual(['42']);
  });
});
