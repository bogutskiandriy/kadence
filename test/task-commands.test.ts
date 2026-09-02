import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskList, runTaskMove } from '../src/cli/commands/task.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flowit-cmd-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function addTask(title: string, estimate?: number): string {
  const r = runTaskAdd(dir, env, title, estimate === undefined ? {} : { estimate });
  return (r.data!['task'] as { id: string }).id;
}

describe('runTaskList', () => {
  it('на порожньому журналі підказує, що робити далі', () => {
    const r = runTaskList(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/task add/);
  });

  it('показує створені задачі з наскрізними номерами', () => {
    addTask('Перша');
    addTask('Друга');
    const r = runTaskList(dir, env, {});
    expect(r.message).toContain('FLOW-1');
    expect(r.message).toContain('FLOW-2');
    expect(r.message).toContain('Перша');
  });

  it('фільтрує за статусом', () => {
    const a = addTask('Перша');
    addTask('Друга');
    runTaskMove(dir, env, a, 'done');
    const r = runTaskList(dir, env, { status: 'done' });
    expect(r.message).toContain('Перша');
    expect(r.message).not.toContain('Друга');
  });

  it('відхиляє неіснуючий статус у фільтрі', () => {
    const r = runTaskList(dir, env, { status: 'летить' });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
  });
});

describe('runTaskMove', () => {
  it('переводить задачу в новий стан', () => {
    const id = addTask('Задача');
    expect(runTaskMove(dir, env, id, 'in_progress').ok).toBe(true);
    expect(runTaskList(dir, env, {}).message).toContain('in_progress');
  });

  it('приймає людиночитаний номер, а не лише ULID', () => {
    addTask('Задача');
    const r = runTaskMove(dir, env, 'FLOW-1', 'done');
    expect(r.ok).toBe(true);
  });

  it('не пише подію, якщо стан і так той самий', () => {
    const id = addTask('Задача');
    runTaskMove(dir, env, id, 'done');
    const before = runTaskList(dir, env, {}).data!['tasks'] as Array<{ history: unknown[] }>;
    const r = runTaskMove(dir, env, id, 'done');
    const after = runTaskList(dir, env, {}).data!['tasks'] as Array<{ history: unknown[] }>;
    expect(r.ok).toBe(true);
    expect(after[0]!.history.length).toBe(before[0]!.history.length);
  });

  it('дозволяє перехід через кілька станів, але попереджає', () => {
    // Заборона змусила б робити два кроки заради формальності, а журнал
    // усе одно зафіксує реальний намір.
    const id = addTask('Задача');
    const r = runTaskMove(dir, env, id, 'done');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/минаючи|backlog/i);
  });

  it('повідомляє, коли задачі немає', () => {
    const r = runTaskMove(dir, env, 'FLOW-99', 'done');
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.message).toMatch(/FLOW-99/);
  });

  it('відхиляє неіснуючий статус', () => {
    const id = addTask('Задача');
    const r = runTaskMove(dir, env, id, 'телепортовано');
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.message).toMatch(/backlog/);
  });
});
