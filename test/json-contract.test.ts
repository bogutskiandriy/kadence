import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli.js');
let dir: string;

interface Run {
  stdout: string;
  stderr: string;
  code: number;
}

function run(args: string[], env: Record<string, string> = {}): Run {
  const r = spawnSync('node', [CLI, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flowit-json-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run(['init']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('контракт --json', () => {
  it('у stdout лише JSON, який розбирається без залишку', () => {
    run(['task', 'add', 'Задача', '--estimate', '3']);
    const r = run(['task', 'list', '--json']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  it('кожна відповідь має версію схеми', () => {
    const r = run(['task', 'add', 'Задача', '--json']);
    expect(JSON.parse(r.stdout).schema).toBe('flowit/v1');
  });

  it('помилка теж повертається як JSON, а не текстом', () => {
    // Агент, що отримав текст замість JSON, не зможе відрізнити збій від
    // порожньої відповіді.
    const r = run(['task', 'move', 'FLOW-99', 'done', '--json']);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schema).toBe('flowit/v1');
    expect(parsed.ok).toBe(false);
    expect(parsed.error.message).toMatch(/FLOW-99/);
  });

  it('попередження йдуть у stderr і не псують JSON у stdout', () => {
    run(['task', 'add', 'Задача']);
    // Псуємо одну подію, щоб з'явилося попередження.
    const events = execFileSync('find', ['.flowit/events', '-name', '*.json'], {
      cwd: dir,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    execFileSync('sh', ['-c', `echo 'зламано' > "${events[0]}"`], { cwd: dir });

    const r = run(['task', 'list', '--json']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    expect(r.stderr).toMatch(/пошкодж/i);
  });

  it('код виходу 0 при успіху', () => {
    expect(run(['task', 'add', 'Задача', '--json']).code).toBe(0);
  });

  it('код виходу 1 при помилці виконання', () => {
    expect(run(['task', 'move', 'FLOW-99', 'done', '--json']).code).toBe(1);
  });

  it('код виходу 2 при помилці в аргументах', () => {
    expect(run(['task', 'move', 'FLOW-1', 'летить', '--json']).code).toBe(2);
  });

  it('список задач має стабільну форму запису', () => {
    run(['task', 'add', 'Задача', '--estimate', '5']);
    const task = JSON.parse(run(['task', 'list', '--json']).stdout).tasks[0];
    expect(Object.keys(task).sort()).toEqual(
      ['estimate', 'history', 'id', 'label', 'sprint', 'status', 'title'].sort(),
    );
  });

  it('FLOWIT_SOURCE=agent позначає авторство події', () => {
    run(['task', 'add', 'Від агента'], { FLOWIT_SOURCE: 'agent' });
    const raw = execFileSync('sh', ['-c', 'cat .flowit/events/*/*.json'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(raw).toContain('"source":"agent"');
  });

  it('без FLOWIT_SOURCE подія вважається людською — джерело не вгадуємо', () => {
    run(['task', 'add', 'Від людини']);
    const raw = execFileSync('sh', ['-c', 'cat .flowit/events/*/*.json'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(raw).toContain('"source":"human"');
  });

  it('у людському режимі stdout не містить JSON', () => {
    run(['task', 'add', 'Задача']);
    const r = run(['task', 'list']);
    expect(r.stdout).toContain('FLOW-1');
    expect(r.stdout).not.toContain('"schema"');
  });

  it('NO_COLOR прибирає керуючі послідовності', () => {
    run(['task', 'add', 'Задача']);
    const r = run(['task', 'list'], { NO_COLOR: '1' });
    expect(r.stdout).not.toContain('[');
  });
});
