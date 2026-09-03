import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRepoRoot, getActorEmail } from '../src/core/git.js';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd } from '../src/cli/commands/task.js';

let dir: string;

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flowit-init-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('findRepoRoot', () => {
  it('returns null outside a git repository', () => {
    expect(findRepoRoot(dir)).toBeNull();
  });

  it('finds the root from a nested folder', () => {
    git(dir, 'init', '-q');
    const nested = join(dir, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    // realpath: on macOS /var is a symlink to /private/var
    expect(findRepoRoot(nested)).toBe(findRepoRoot(dir));
  });
});

describe('getActorEmail', () => {
  it('does not throw when user.email is configured nowhere', () => {
    // The local config is empty, but a developer machine may have a global one —
    // so check the contract, not a specific value: a string or null, never a throw.
    git(dir, 'init', '-q');
    const email = getActorEmail(dir);
    expect(email === null || typeof email === 'string').toBe(true);
  });

  it('returns the configured email', () => {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'tester@example.com');
    expect(getActorEmail(dir)).toBe('tester@example.com');
  });
});

describe('runInit', () => {
  beforeEach(() => {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'tester@example.com');
  });

  it('refuses to run outside a git repository', () => {
    const outside = mkdtempSync(join(tmpdir(), 'flowit-outside-'));
    const r = runInit(outside);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/git repository/i);
    rmSync(outside, { recursive: true, force: true });
  });

  it('creates the events folder', () => {
    expect(runInit(dir).ok).toBe(true);
    expect(existsSync(join(dir, '.flowit', 'events'))).toBe(true);
  });

  it('appends state.json to .gitignore', () => {
    runInit(dir);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('.flowit/state.json');
  });

  it('does not duplicate the .gitignore entry on a repeat run', () => {
    runInit(dir);
    runInit(dir);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gi.split('.flowit/state.json').length - 1).toBe(1);
  });

  it('preserves existing .gitignore content', () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
    runInit(dir);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('node_modules/');
  });

  it('creates the agent README', () => {
    runInit(dir);
    expect(existsSync(join(dir, '.flowit', 'README.md'))).toBe(true);
  });

  it('destroys nothing on a repeat run', () => {
    runInit(dir);
    writeFileSync(join(dir, '.flowit', 'events', 'marker'), 'data');
    const r = runInit(dir);
    expect(r.ok).toBe(true);
    expect(r.alreadyInitialized).toBe(true);
    expect(existsSync(join(dir, '.flowit', 'events', 'marker'))).toBe(true);
  });

  it('works when the events folder vanished after checkout — no repeat init needed', () => {
    // Regression: git does not version empty directories, so .flowit/events/
    // disappears when switching to a branch without events. The CLI used to
    // refuse to work on a perfectly functional repository.
    runInit(dir);
    rmSync(join(dir, '.flowit', 'events'), { recursive: true, force: true });

    const r = runTaskAdd(dir, {} as NodeJS.ProcessEnv, 'Task after checkout');
    expect(r.ok).toBe(true);
    expect(existsSync(join(dir, '.flowit', 'events'))).toBe(true);
  });

  it('does NOT create a commit — that call belongs to the human', () => {
    runInit(dir);
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
    expect(status.trim().length).toBeGreaterThan(0);
  });
});
