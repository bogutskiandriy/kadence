import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import {
  runTaskAdd,
  runTaskList,
  runTaskShow,
  runTaskEdit,
  runTaskCancel,
  runTaskDelete,
  runTaskComment,
} from '../src/cli/commands/task.js';
import { editText, canUseEditor } from '../src/cli/editor.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprintit-crud-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'pm@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const tasks = () => runTaskList(dir, env, {}).data!['tasks'] as Array<Record<string, unknown>>;

describe('task edit', () => {
  it('renames a task', () => {
    runTaskAdd(dir, env, 'Old name', {});
    const r = runTaskEdit(dir, env, 'FLOW-1', { title: 'New name' });
    expect(r.ok).toBe(true);
    expect(tasks()[0]!['title']).toBe('New name');
  });

  it('changes several fields at once and names them all', () => {
    runTaskAdd(dir, env, 'Task', {});
    const r = runTaskEdit(dir, env, 'FLOW-1', { priority: 'urgent', estimate: 8, type: 'bug' });
    expect(r.message).toMatch(/type.*priority.*estimate|priority/);
    const t = tasks()[0]!;
    expect(t['priority']).toBe('urgent');
    expect(t['estimate']).toBe(8);
    expect(t['type']).toBe('bug');
  });

  it('writes no event when nothing actually differs', () => {
    runTaskAdd(dir, env, 'Task', { priority: 'high' });
    const before = (tasks()[0]!['history'] as unknown[]).length;
    const r = runTaskEdit(dir, env, 'FLOW-1', { priority: 'high', title: 'Task' });
    expect(r.message).toMatch(/nothing changed/i);
    expect((tasks()[0]!['history'] as unknown[]).length).toBe(before);
  });

  it('leaves untouched fields alone', () => {
    runTaskAdd(dir, env, 'Task', { description: 'Keep me', estimate: 3 });
    runTaskEdit(dir, env, 'FLOW-1', { title: 'Renamed' });
    const t = tasks()[0]!;
    expect(t['description']).toBe('Keep me');
    expect(t['estimate']).toBe(3);
  });

  it('replaces labels wholesale — they are a set, not an append', () => {
    runTaskAdd(dir, env, 'Task', { labels: ['old'] });
    runTaskEdit(dir, env, 'FLOW-1', { labels: ['new', 'fresh'] });
    expect(tasks()[0]!['labels']).toEqual(['new', 'fresh']);
  });

  it('validates the due date format', () => {
    runTaskAdd(dir, env, 'Task', {});
    const r = runTaskEdit(dir, env, 'FLOW-1', { due: '30.09.2026' });
    expect(r.exitCode).toBe(2);
    expect(r.message).toMatch(/YYYY-MM-DD/);
  });

  it('rejects a date that does not exist', () => {
    runTaskAdd(dir, env, 'Task', {});
    expect(runTaskEdit(dir, env, 'FLOW-1', { due: '2026-02-31' }).exitCode).toBe(2);
  });

  it('clears the due date with an empty value', () => {
    runTaskAdd(dir, env, 'Task', { due: '2026-09-30' });
    runTaskEdit(dir, env, 'FLOW-1', { due: '' });
    expect(tasks()[0]!['due']).toBeNull();
  });

  it('reports a missing task', () => {
    expect(runTaskEdit(dir, env, 'FLOW-99', { title: 'X' }).exitCode).toBe(1);
  });
});

describe('task cancel', () => {
  it('cancels a task and says it does not count as missed work', () => {
    runTaskAdd(dir, env, 'Task', {});
    const r = runTaskCancel(dir, env, 'FLOW-1');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/does not count as missed/i);
    expect(tasks()[0]!['status']).toBe('cancelled');
  });

  it('cancelling twice is a no-op', () => {
    runTaskAdd(dir, env, 'Task', {});
    runTaskCancel(dir, env, 'FLOW-1');
    const before = (tasks()[0]!['history'] as unknown[]).length;
    runTaskCancel(dir, env, 'FLOW-1');
    expect((tasks()[0]!['history'] as unknown[]).length).toBe(before);
  });
});

describe('task delete', () => {
  it('removes the task from the list', () => {
    runTaskAdd(dir, env, 'Doomed', {});
    runTaskAdd(dir, env, 'Survivor', {});
    runTaskDelete(dir, env, 'FLOW-1');
    expect(tasks().map((t) => t['title'])).toEqual(['Survivor']);
  });

  it('states plainly that the event stays in the journal', () => {
    runTaskAdd(dir, env, 'Doomed', {});
    const r = runTaskDelete(dir, env, 'FLOW-1');
    expect(r.message).toMatch(/journal|never rewritten/i);
  });

  it('renumbers the remaining tasks', () => {
    runTaskAdd(dir, env, 'A', {});
    runTaskAdd(dir, env, 'B', {});
    runTaskAdd(dir, env, 'C', {});
    runTaskDelete(dir, env, 'FLOW-2');
    expect(tasks().map((t) => t['label'])).toEqual(['FLOW-1', 'FLOW-2']);
    expect(tasks().map((t) => t['title'])).toEqual(['A', 'C']);
  });
});

describe('task comment', () => {
  it('adds a comment visible in show', () => {
    runTaskAdd(dir, env, 'Task', {});
    runTaskComment(dir, env, 'FLOW-1', 'This needs a second look');
    expect(runTaskShow(dir, env, 'FLOW-1').message).toContain('This needs a second look');
  });

  it('rejects an empty comment', () => {
    runTaskAdd(dir, env, 'Task', {});
    expect(runTaskComment(dir, env, 'FLOW-1', '   ').exitCode).toBe(2);
  });

  it('keeps several comments in order', () => {
    runTaskAdd(dir, env, 'Task', {});
    runTaskComment(dir, env, 'FLOW-1', 'First');
    runTaskComment(dir, env, 'FLOW-1', 'Second');
    const comments = tasks()[0]!['comments'] as Array<{ text: string }>;
    expect(comments.map((c) => c.text)).toEqual(['First', 'Second']);
  });
});

describe('editor', () => {
  it('strips comment lines and returns the body', () => {
    const r = editText({ EDITOR: 'true' } as NodeJS.ProcessEnv, 'Kept text', 'hint');
    expect(r.text).toBe('Kept text');
    expect(r.error).toBeNull();
  });

  it('treats an empty buffer as abort', () => {
    const r = editText({ EDITOR: 'true' } as NodeJS.ProcessEnv, '', 'hint');
    expect(r.text).toBeNull();
  });

  it('reports a failing editor with a way to fix it', () => {
    const r = editText({ EDITOR: 'false' } as NodeJS.ProcessEnv, 'text', 'hint');
    expect(r.text).toBeNull();
    expect(r.error).toMatch(/EDITOR=/);
  });

  it('refuses to open an editor for an agent — vi would hang forever', () => {
    expect(canUseEditor({ SPRINTIT_SOURCE: 'agent' } as NodeJS.ProcessEnv, true)).toBe(false);
  });

  it('refuses to open an editor without a terminal', () => {
    expect(canUseEditor({} as NodeJS.ProcessEnv, false)).toBe(false);
  });
});
