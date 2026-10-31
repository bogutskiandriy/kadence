import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskShow } from '../src/cli/commands/task.js';
import { runSprintCreate, runSprintClose, runSprintList, runSprintStart } from '../src/cli/commands/sprint.js';
import { runSprintRetro } from '../src/cli/commands/sprint.js';
import { runNoteList } from '../src/cli/commands/note.js';

/**
 * The Sprint Retrospective (Scrum Guide 2020): the team inspects how the
 * sprint went and picks the most helpful changes, which may go straight into
 * the next Sprint Backlog. In a journal that is two things it already has — a
 * note, and a task — tied to the sprint they came out of.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-retro-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'team@example.com'], { cwd: dir });
  runInit(dir);
  runSprintCreate(dir, env, 'Sprint 1');
  runSprintCreate(dir, env, 'Sprint 2');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('sprint retro', () => {
  it('records an observation against the active sprint', () => {
    const r = runSprintRetro(dir, env, 'Reviews waited two days for a reviewer', {});
    expect(r.ok).toBe(true);

    const notes = runNoteList(dir, env, { json: true }).data!['notes'] as Array<Record<string, unknown>>;
    expect(notes[0]).toMatchObject({ text: 'Reviews waited two days for a reviewer', sprint: 'Sprint 1' });
  });

  it('with no active sprint, lands on the one that closed last', () => {
    runSprintClose(dir, env);
    runSprintRetro(dir, env, 'Late', {});

    const listed = runSprintRetro(dir, env, undefined, { sprint: 'Sprint 1' });
    expect(listed.message).toContain('Late');
  });

  it('--action makes a task labelled retro and puts it in the next planned sprint', () => {
    const r = runSprintRetro(dir, env, 'Pair on every review', { action: true });
    expect(r.ok).toBe(true);

    const task = runTaskShow(dir, env, 'KAD-1').data!['task'] as Record<string, unknown>;
    expect(task['labels']).toEqual(['retro']);
    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list[1]!['taskCount']).toBe(1);
    expect(r.message).toContain('"Sprint 2"');
  });

  it('--action with no planned sprint leaves the task in the backlog and says so', () => {
    runSprintClose(dir, env);
    runSprintStart(dir, env, 'Sprint 2');

    const r = runSprintRetro(dir, env, 'Write the runbook', { action: true });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/No planned sprint/);
    const list = runSprintList(dir, env).data!['sprints'] as Array<Record<string, unknown>>;
    expect(list.every((sp) => sp['taskCount'] === 0)).toBe(true);
  });

  it('without text, lists what the retro of that sprint recorded, actions with their status', () => {
    runSprintRetro(dir, env, 'Builds were slow', {});
    runSprintRetro(dir, env, 'Cache the build', { action: true });

    const r = runSprintRetro(dir, env, undefined, {});
    expect(r.message).toContain('Builds were slow');
    expect(r.message).toMatch(/KAD-1 .*Cache the build/);
    const data = r.data!['retro'] as Record<string, unknown>;
    expect((data['notes'] as unknown[]).length).toBe(2);
    expect(data['actions']).toEqual([{ label: 'KAD-1', title: 'Cache the build', status: 'backlog' }]);
  });

  it('an unknown sprint fails with the list hint', () => {
    const r = runSprintRetro(dir, env, 'x', { sprint: 'Nope' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ code: 'sprint_not_found' });
  });
});
