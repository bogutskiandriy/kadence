import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runTaskAdd, runTaskMove, runTaskAssign, runTaskBlock, runTaskClaim } from '../src/cli/commands/task.js';
import { runSprintCreate, runSprintStart, runSprintAdd, runSprintClose } from '../src/cli/commands/sprint.js';
import { runStats } from '../src/cli/commands/stats.js';
import {
  runCompletion,
  completionScript,
  completionPath,
  detectShell,
  SHELLS,
} from '../src/cli/commands/completion.js';

let dir: string;
const env = {} as NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-stats-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('runStats', () => {
  it('says what to do on an empty repository', () => {
    const r = runStats(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/task add/);
    expect(r.data!['tasks']).toBe(0);
  });

  it('counts tasks by status and open work by assignee', () => {
    runTaskAdd(dir, env, 'One', {});
    runTaskAdd(dir, env, 'Two', {});
    runTaskAdd(dir, env, 'Three', {});
    runTaskMove(dir, env, 'KAD-3', 'done');
    runTaskAssign(dir, env, 'KAD-1', 'alice@example.com');

    const r = runStats(dir, env, { json: true });
    expect(r.data!['tasks']).toBe(3);
    expect(r.data!['open']).toBe(2);
    expect(r.data!['byStatus']).toEqual(
      expect.arrayContaining([
        { status: 'backlog', count: 2 },
        { status: 'done', count: 1 },
      ]),
    );
    // Done work is not open work: an assignee count that includes it would
    // read as a workload and be wrong.
    expect(r.data!['byAssignee']).toEqual(
      expect.arrayContaining([
        { assignee: 'alice@example.com', count: 1 },
        { assignee: 'unassigned', count: 1 },
      ]),
    );
  });

  it('names blocked and contested tasks rather than only counting them', () => {
    runTaskAdd(dir, env, 'Blocker', {});
    runTaskAdd(dir, env, 'Blocked', {});
    runTaskBlock(dir, env, 'KAD-2', 'KAD-1', false);
    runTaskClaim(dir, env, 'KAD-1', {});
    execFileSync('git', ['config', 'user.email', 'other@example.com'], { cwd: dir });
    runTaskClaim(dir, env, 'KAD-1', {});

    const r = runStats(dir, env, { json: true });
    expect(r.data!['blocked']).toEqual(['KAD-2']);
    expect(r.data!['contested']).toEqual(['KAD-1']);
    expect(r.message).toMatch(/Blocked \(1\): KAD-2/);
    expect(r.message).toMatch(/Contested \(1\): KAD-1/);
  });

  it('stops counting a task as blocked once the blocker is done', () => {
    runTaskAdd(dir, env, 'Blocker', {});
    runTaskAdd(dir, env, 'Blocked', {});
    runTaskBlock(dir, env, 'KAD-2', 'KAD-1', false);
    runTaskMove(dir, env, 'KAD-1', 'done');
    expect(runStats(dir, env, { json: true }).data!['blocked']).toEqual([]);
  });

  it('reports the velocity of closed sprints, newest first', () => {
    for (const name of ['Sprint 1', 'Sprint 2']) {
      runSprintCreate(dir, env, name);
      runSprintStart(dir, env, name);
      const label = name === 'Sprint 1' ? 'KAD-1' : 'KAD-2';
      runTaskAdd(dir, env, `Work for ${name}`, { estimate: name === 'Sprint 1' ? 3 : 5 });
      runSprintAdd(dir, env, label, {});
      runTaskMove(dir, env, label, 'done');
      runSprintClose(dir, env);
    }
    const velocity = runStats(dir, env, { json: true }).data!['velocity'] as Array<{
      name: string;
      velocity: number;
    }>;
    expect(velocity.map((v) => v.name)).toEqual(['Sprint 2', 'Sprint 1']);
    expect(velocity.map((v) => v.velocity)).toEqual([5, 3]);
  });
});

describe('completion', () => {
  it('generates a script for every shell it claims to support', () => {
    for (const shell of SHELLS) {
      const script = completionScript(shell);
      expect(script.length).toBeGreaterThan(100);
      expect(script).toMatch(/kadence/);
      // Every script offers the commands, or it is not completing anything.
      expect(script).toMatch(/ready/);
      expect(script).toMatch(/milestone/);
    }
  });

  it('prints the script rather than writing when install is not asked for', () => {
    const r = runCompletion(env, { shell: 'zsh' });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/#compdef kadence/);
  });

  it('prints to stdout instead of writing when there is no terminal', () => {
    const home = mkdtempSync(join(tmpdir(), 'kadence-home-'));
    try {
      const r = runCompletion(env, { shell: 'fish', install: true, home, isTty: false });
      expect(r.message).toMatch(/complete -c kadence/);
      expect(existsSync(completionPath('fish', home))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('writes the file and says where, then is idempotent', () => {
    const home = mkdtempSync(join(tmpdir(), 'kadence-home-'));
    try {
      const first = runCompletion(env, { shell: 'bash', install: true, home, isTty: true });
      const path = completionPath('bash', home);
      expect(first.data!['written']).toBe(true);
      expect(first.message).toContain(path);
      expect(readFileSync(path, 'utf8')).toBe(completionScript('bash'));

      const second = runCompletion(env, { shell: 'bash', install: true, home, isTty: true });
      expect(second.data!['written']).toBe(false);
      expect(second.message).toMatch(/already/i);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('refuses to replace a file it did not write', () => {
    // These directories are shared: a distribution package writes into the
    // bash one, and the zsh one is where people keep their own functions.
    const home = mkdtempSync(join(tmpdir(), 'kadence-home-'));
    try {
      const path = completionPath('zsh', home);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, '# hand-written by the user, do not lose me\n', 'utf8');

      const r = runCompletion(env, { shell: 'zsh', install: true, home, isTty: true });
      expect(r.ok).toBe(false);
      expect(r.error!.code).toBe('conflicting_state');
      expect(r.message).toMatch(/--force/);
      expect(readFileSync(path, 'utf8')).toBe('# hand-written by the user, do not lose me\n');

      const forced = runCompletion(env, { shell: 'zsh', install: true, home, isTty: true, force: true });
      expect(forced.data!['written']).toBe(true);
      expect(readFileSync(path, 'utf8')).toBe(completionScript('zsh'));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('replaces its own older script without being asked', () => {
    const home = mkdtempSync(join(tmpdir(), 'kadence-home-'));
    try {
      const path = completionPath('fish', home);
      mkdirSync(dirname(path), { recursive: true });
      // An earlier version of the same script: ours, and safe to update.
      writeFileSync(path, '# kadence completion for fish\ncomplete -c kadence -f\n', 'utf8');
      const r = runCompletion(env, { shell: 'fish', install: true, home, isTty: true });
      expect(r.data!['written']).toBe(true);
      expect(readFileSync(path, 'utf8')).toBe(completionScript('fish'));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('tells a zsh user the one line only they can add', () => {
    const home = mkdtempSync(join(tmpdir(), 'kadence-home-'));
    try {
      const r = runCompletion(env, { shell: 'zsh', install: true, home, isTty: true });
      // The shell rc is the user's file; we write the script and say the line.
      expect(r.message).toMatch(/fpath/);
      expect(r.message).toMatch(/compinit/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('detects the shell from $SHELL and refuses to guess when it cannot', () => {
    expect(detectShell({ SHELL: '/bin/zsh' } as NodeJS.ProcessEnv)).toBe('zsh');
    expect(detectShell({ SHELL: '/usr/local/bin/fish' } as NodeJS.ProcessEnv)).toBe('fish');
    expect(detectShell({} as NodeJS.ProcessEnv)).toBeNull();

    const r = runCompletion({} as NodeJS.ProcessEnv, {});
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('invalid_argument');
  });

  it('names the shells it knows when given one it does not', () => {
    const r = runCompletion(env, { shell: 'nushell' });
    expect(r.ok).toBe(false);
    expect(r.error!.allowed).toEqual([...SHELLS]);
  });
});
