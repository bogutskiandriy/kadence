import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRepoRoot, getActorEmail } from '../src/core/git.js';
import { runInit } from '../src/cli/commands/init.js';

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
  it('повертає null поза git-репозиторієм', () => {
    expect(findRepoRoot(dir)).toBeNull();
  });

  it('знаходить корінь із вкладеної теки', () => {
    git(dir, 'init', '-q');
    const nested = join(dir, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    // realpath: на macOS /var — симлінк на /private/var
    expect(findRepoRoot(nested)).toBe(findRepoRoot(dir));
  });
});

describe('getActorEmail', () => {
  it('не падає, коли user.email ніде не налаштований', () => {
    // Локальний конфіг порожній, але глобальний на машині розробника може
    // бути виставлений — тому перевіряємо контракт, а не конкретне значення:
    // або рядок, або null, і в жодному разі не виняток.
    git(dir, 'init', '-q');
    const email = getActorEmail(dir);
    expect(email === null || typeof email === 'string').toBe(true);
  });

  it('повертає налаштований email', () => {
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

  it('відмовляється працювати поза git-репозиторієм', () => {
    const outside = mkdtempSync(join(tmpdir(), 'flowit-outside-'));
    const r = runInit(outside);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/репозитор/i);
    rmSync(outside, { recursive: true, force: true });
  });

  it('створює теку подій', () => {
    expect(runInit(dir).ok).toBe(true);
    expect(existsSync(join(dir, '.flowit', 'events'))).toBe(true);
  });

  it('дописує state.json у .gitignore', () => {
    runInit(dir);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('.flowit/state.json');
  });

  it('не дублює запис у .gitignore при повторному запуску', () => {
    runInit(dir);
    runInit(dir);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gi.split('.flowit/state.json').length - 1).toBe(1);
  });

  it('зберігає наявний вміст .gitignore', () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
    runInit(dir);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('node_modules/');
  });

  it('створює README для агента', () => {
    runInit(dir);
    expect(existsSync(join(dir, '.flowit', 'README.md'))).toBe(true);
  });

  it('нічого не руйнує при повторному запуску', () => {
    runInit(dir);
    writeFileSync(join(dir, '.flowit', 'events', 'marker'), 'дані');
    const r = runInit(dir);
    expect(r.ok).toBe(true);
    expect(r.alreadyInitialized).toBe(true);
    expect(existsSync(join(dir, '.flowit', 'events', 'marker'))).toBe(true);
  });

  it('НЕ створює коміт — це рішення людини', () => {
    runInit(dir);
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
    expect(status.trim().length).toBeGreaterThan(0);
  });
});
