import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flowit-agent-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const agentsPath = () => join(dir, 'AGENTS.md');

describe('.flowit/README.md', () => {
  it('створюється при init', () => {
    runInit(dir);
    expect(existsSync(join(dir, '.flowit', 'README.md'))).toBe(true);
  });

  it('містить команди й опис контракту', () => {
    runInit(dir);
    const text = readFileSync(join(dir, '.flowit', 'README.md'), 'utf8');
    expect(text).toContain('flowit task list --json');
    expect(text).toContain('flowit/v1');
    expect(text).toContain('FLOWIT_SOURCE');
  });

  it('не перезаписується, якщо користувач його змінив', () => {
    runInit(dir);
    writeFileSync(join(dir, '.flowit', 'README.md'), 'мої правила');
    runInit(dir);
    expect(readFileSync(join(dir, '.flowit', 'README.md'), 'utf8')).toBe('мої правила');
  });
});

describe('AGENTS.md', () => {
  it('створюється, якщо його не було', () => {
    runInit(dir);
    expect(existsSync(agentsPath())).toBe(true);
    expect(readFileSync(agentsPath(), 'utf8')).toContain('FlowIt');
  });

  it('доповнюється, а написане людиною не чіпається', () => {
    writeFileSync(agentsPath(), '# Правила проєкту\n\nПиши тести перед кодом.\n');
    runInit(dir);
    const text = readFileSync(agentsPath(), 'utf8');
    expect(text).toContain('Пиши тести перед кодом.');
    expect(text).toContain('FlowIt');
  });

  it('секція не дублюється при повторному init', () => {
    runInit(dir);
    runInit(dir);
    runInit(dir);
    const text = readFileSync(agentsPath(), 'utf8');
    expect(text.split('<!-- flowit:begin -->').length - 1).toBe(1);
  });

  it('оновлює вміст секції, не чіпаючи текст навколо', () => {
    runInit(dir);
    const text = readFileSync(agentsPath(), 'utf8');
    writeFileSync(agentsPath(), `${text}\n## Мій розділ після\n`);
    runInit(dir);

    const after = readFileSync(agentsPath(), 'utf8');
    expect(after).toContain('## Мій розділ після');
    expect(after.split('<!-- flowit:begin -->').length - 1).toBe(1);
  });
});
