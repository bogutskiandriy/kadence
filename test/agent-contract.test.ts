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
  it('is created on init', () => {
    runInit(dir);
    expect(existsSync(join(dir, '.flowit', 'README.md'))).toBe(true);
  });

  it('contains the commands and the contract description', () => {
    runInit(dir);
    const text = readFileSync(join(dir, '.flowit', 'README.md'), 'utf8');
    expect(text).toContain('flowit task list --json');
    expect(text).toContain('flowit/v1');
    expect(text).toContain('FLOWIT_SOURCE');
  });

  it('is not overwritten when the user has edited it', () => {
    runInit(dir);
    writeFileSync(join(dir, '.flowit', 'README.md'), 'my own rules');
    runInit(dir);
    expect(readFileSync(join(dir, '.flowit', 'README.md'), 'utf8')).toBe('my own rules');
  });
});

describe('AGENTS.md', () => {
  it('is created when absent', () => {
    runInit(dir);
    expect(existsSync(agentsPath())).toBe(true);
    expect(readFileSync(agentsPath(), 'utf8')).toContain('FlowIt');
  });

  it('is extended while human-written text is untouched', () => {
    writeFileSync(agentsPath(), '# Project rules\n\nWrite tests before code.\n');
    runInit(dir);
    const text = readFileSync(agentsPath(), 'utf8');
    expect(text).toContain('Write tests before code.');
    expect(text).toContain('FlowIt');
  });

  it('the section is not duplicated on a repeat init', () => {
    runInit(dir);
    runInit(dir);
    runInit(dir);
    const text = readFileSync(agentsPath(), 'utf8');
    expect(text.split('<!-- flowit:begin -->').length - 1).toBe(1);
  });

  it('updates the section content without touching surrounding text', () => {
    runInit(dir);
    const text = readFileSync(agentsPath(), 'utf8');
    writeFileSync(agentsPath(), `${text}\n## My section below\n`);
    runInit(dir);

    const after = readFileSync(agentsPath(), 'utf8');
    expect(after).toContain('## My section below');
    expect(after.split('<!-- flowit:begin -->').length - 1).toBe(1);
  });
});
