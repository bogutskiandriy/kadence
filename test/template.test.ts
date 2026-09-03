import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskList, parseDuration, runTaskLog } from '../src/cli/commands/task.js';
import {
  runTemplateSave,
  runTemplateList,
  runTemplateDelete,
  findTemplate,
} from '../src/cli/commands/template.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flowit-tpl-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('templates', () => {
  it('saves a template and lists it', () => {
    runTemplateSave(dir, env, 'bug', { type: 'bug', priority: 'high' });
    expect(runTemplateList(dir, env).message).toContain('bug');
  });

  it('rejects a template with no fields', () => {
    const r = runTemplateSave(dir, env, 'empty', {});
    expect(r.exitCode).toBe(2);
    expect(r.message).toMatch(/at least one field/i);
  });

  it('rejects an empty name', () => {
    expect(runTemplateSave(dir, env, '  ', { type: 'bug' }).exitCode).toBe(2);
  });

  it('ignores fields that are not part of a task', () => {
    // A typo must not silently become a custom field.
    runTemplateSave(dir, env, 'weird', { type: 'bug', nonsense: 'x' } as Record<string, unknown>);
    const found = findTemplate(dir, env, 'weird');
    expect('fields' in found && found.fields).not.toHaveProperty('nonsense');
  });

  it('the last save wins — templates are configuration, not history', () => {
    runTemplateSave(dir, env, 'bug', { priority: 'low' });
    runTemplateSave(dir, env, 'bug', { priority: 'urgent' });
    const found = findTemplate(dir, env, 'bug');
    expect('fields' in found && found.fields['priority']).toBe('urgent');
  });

  it('deletes a template', () => {
    runTemplateSave(dir, env, 'bug', { type: 'bug' });
    expect(runTemplateDelete(dir, env, 'bug').ok).toBe(true);
    expect(runTemplateList(dir, env).message).toMatch(/no templates/i);
  });

  it('reports a template that does not exist', () => {
    expect(runTemplateDelete(dir, env, 'ghost').exitCode).toBe(1);
    const found = findTemplate(dir, env, 'ghost');
    expect('error' in found).toBe(true);
  });

  it('lists known names when one is not found', () => {
    runTemplateSave(dir, env, 'bug', { type: 'bug' });
    const found = findTemplate(dir, env, 'typo');
    expect('error' in found && found.error.message).toContain('bug');
  });

  it('empty list points at how to create one', () => {
    expect(runTemplateList(dir, env).message).toMatch(/template save/);
  });
});

describe('parseDuration', () => {
  it('reads bare numbers as hours', () => {
    expect(parseDuration('2')).toBe(2);
    expect(parseDuration('1.5')).toBe(1.5);
  });

  it('reads hours and minutes', () => {
    expect(parseDuration('2h')).toBe(2);
    expect(parseDuration('90m')).toBe(1.5);
    expect(parseDuration('45 min')).toBeCloseTo(0.75, 5);
  });

  it('accepts negatives as corrections', () => {
    expect(parseDuration('-30m')).toBe(-0.5);
  });

  it('rejects nonsense and zero', () => {
    for (const bad of ['abc', '', 'h', '0', '2 days']) {
      expect(parseDuration(bad)).toBeNull();
    }
  });
});

describe('time logging', () => {
  it('accumulates and never goes below zero', () => {
    runTaskAdd(dir, env, 'Task', { estimate: 3 });
    runTaskLog(dir, env, 'FLOW-1', '2h');
    runTaskLog(dir, env, 'FLOW-1', '-5h');
    const tasks = runTaskList(dir, env, {}).data!['tasks'] as Array<Record<string, unknown>>;
    expect(tasks[0]!['loggedHours']).toBe(0);
  });

  it('says there is nothing to compare against without an estimate', () => {
    runTaskAdd(dir, env, 'Task', {});
    expect(runTaskLog(dir, env, 'FLOW-1', '1h').message).toMatch(/no estimate/i);
  });
});
