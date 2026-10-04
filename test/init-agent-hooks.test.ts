import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInit, HOOK_COMMAND, PROMPT_HOOK_COMMAND } from '../src/cli/commands/init.js';
import { runSessionHook } from '../src/cli/commands/hook.js';
import { runTaskAdd } from '../src/cli/commands/task.js';

/**
 * Hooks for the agents that are not Claude Code (KAD-71, DEC-48).
 *
 * The prompt hook took journal use from 1 agent in 10 to 9 in 10 (KAD-53);
 * instructions alone did not move the first step. Three other agents run a
 * project-level shell command whose output reaches the model:
 *
 * - Codex reads `.codex/hooks.json` in Claude Code's own shape, with
 *   SessionStart and UserPromptSubmit, and adds plain stdout as context. Its
 *   UserPromptSubmit payload carries `prompt` and `session_id`, the fields
 *   `kadence hook prompt` reads.
 * - Cursor reads `.cursor/hooks.json`, and only `sessionStart` can add context
 *   — as JSON, `{"additional_context": "…"}`, never plain text.
 * - Copilot (CLI and cloud agent) reads `.github/hooks/*.json`; `sessionStart`
 *   adds context as `{"additionalContext": "…"}`, and the output of a command
 *   hook on userPromptSubmitted is dropped.
 *
 * Each directory belongs to another tool, so init writes one only where the
 * tool is visibly in use, or when asked by name.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const json = (path: string): Record<string, unknown> => JSON.parse(readFileSync(join(dir, path), 'utf8'));
type Group = { matcher?: string; hooks?: Array<{ command?: string; type?: string; timeout?: number }> };
type CursorEntry = { command?: string; timeout?: number };
type CopilotEntry = { type?: string; bash?: string; timeoutSec?: number };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-agent-hooks-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('which agents init writes for', () => {
  it('writes nothing for an agent the repository shows no sign of', () => {
    runInit(dir);
    expect(existsSync(join(dir, '.codex'))).toBe(false);
    expect(existsSync(join(dir, '.cursor'))).toBe(false);
    expect(existsSync(join(dir, '.github', 'hooks'))).toBe(false);
  });

  it('says how to ask for them, so a team on Codex or Cursor is not left guessing', () => {
    expect(runInit(dir).message).toMatch(/--hooks-for codex,cursor,copilot/);
  });

  it('writes for an agent whose directory is already there', () => {
    mkdirSync(join(dir, '.codex'));
    mkdirSync(join(dir, '.cursor'));
    mkdirSync(join(dir, '.github'));
    writeFileSync(join(dir, '.github', 'copilot-instructions.md'), '# Copilot\n');
    runInit(dir);
    expect(existsSync(join(dir, '.codex', 'hooks.json'))).toBe(true);
    expect(existsSync(join(dir, '.cursor', 'hooks.json'))).toBe(true);
    expect(existsSync(join(dir, '.github', 'hooks', 'kadence.json'))).toBe(true);
  });

  it('writes for the agents named, whether or not they are in use yet', () => {
    runInit(dir, 'dev', { hooksFor: ['cursor'] });
    expect(existsSync(join(dir, '.cursor', 'hooks.json'))).toBe(true);
    expect(existsSync(join(dir, '.codex'))).toBe(false);
  });

  it('writes none of them with --no-hooks, even where the directories are there', () => {
    mkdirSync(join(dir, '.codex'));
    mkdirSync(join(dir, '.cursor'));
    runInit(dir, 'dev', { hooks: false });
    expect(existsSync(join(dir, '.codex', 'hooks.json'))).toBe(false);
    expect(existsSync(join(dir, '.cursor', 'hooks.json'))).toBe(false);
  });

  it('names every file it wrote among the ones to commit', () => {
    const r = runInit(dir, 'dev', { hooksFor: ['codex', 'cursor', 'copilot'] });
    expect(r.message).toMatch(/\.codex\/hooks\.json/);
    expect(r.message).toMatch(/\.cursor\/hooks\.json/);
    expect(r.message).toMatch(/\.github\/hooks\/kadence\.json/);
  });
});

describe('Codex: .codex/hooks.json', () => {
  it('starts each session with prime and searches each prompt, as in Claude Code', () => {
    runInit(dir, 'dev', { hooksFor: ['codex'] });
    const hooks = json('.codex/hooks.json')['hooks'] as Record<string, Group[]>;
    const start = hooks['SessionStart']!.find((g) => g.hooks?.some((h) => h.command === HOOK_COMMAND));
    expect(start?.matcher).toBe('startup');
    expect(hooks['UserPromptSubmit']!.some((g) => g.hooks?.some((h) => h.command === PROMPT_HOOK_COMMAND))).toBe(true);
  });

  it('says that Codex will ask to trust the project hooks before running them', () => {
    expect(runInit(dir, 'dev', { hooksFor: ['codex'] }).message).toMatch(/trust/i);
  });
});

describe('Cursor: .cursor/hooks.json', () => {
  it('adds a sessionStart hook that answers in the JSON Cursor reads, and no prompt hook', () => {
    runInit(dir, 'dev', { hooksFor: ['cursor'] });
    const file = json('.cursor/hooks.json');
    expect(file['version']).toBe(1);
    const hooks = file['hooks'] as Record<string, CursorEntry[]>;
    expect(hooks['sessionStart']!.some((h) => h.command?.includes('kadence hook cursor-session'))).toBe(true);
    // beforeSubmitPrompt can only allow or block: a search there would reach nobody.
    expect(hooks['beforeSubmitPrompt']).toBeUndefined();
  });
});

describe('Copilot: .github/hooks/kadence.json', () => {
  it('adds a sessionStart command hook that answers with additionalContext', () => {
    runInit(dir, 'dev', { hooksFor: ['copilot'] });
    const file = json('.github/hooks/kadence.json');
    expect(file['version']).toBe(1);
    const hooks = file['hooks'] as Record<string, CopilotEntry[]>;
    const entry = hooks['sessionStart']![0]!;
    expect(entry.type).toBe('command');
    expect(entry.bash).toMatch(/kadence hook copilot-session/);
    expect(hooks['userPromptSubmitted']).toBeUndefined();
  });
});

describe('a file that is already there', () => {
  it('keeps every hook that is not ours, and adds ours once however often init runs', () => {
    mkdirSync(join(dir, '.cursor'));
    writeFileSync(
      join(dir, '.cursor', 'hooks.json'),
      JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: './format.sh' }], sessionStart: [{ command: './mine.sh' }] } }),
    );
    runInit(dir);
    runInit(dir);
    const hooks = json('.cursor/hooks.json')['hooks'] as Record<string, CursorEntry[]>;
    expect(hooks['afterFileEdit']).toEqual([{ command: './format.sh' }]);
    expect(hooks['sessionStart']!.map((h) => h.command)).toContain('./mine.sh');
    expect(hooks['sessionStart']!.filter((h) => h.command?.includes('kadence hook cursor-session'))).toHaveLength(1);
  });

  it('keeps the other hooks in .codex/hooks.json and adds ours once', () => {
    mkdirSync(join(dir, '.codex'));
    writeFileSync(
      join(dir, '.codex', 'hooks.json'),
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'notify' }] }] } }),
    );
    runInit(dir);
    runInit(dir);
    const hooks = json('.codex/hooks.json')['hooks'] as Record<string, Group[]>;
    expect(hooks['Stop']).toEqual([{ hooks: [{ type: 'command', command: 'notify' }] }]);
    expect(hooks['SessionStart']!.flatMap((g) => g.hooks ?? []).filter((h) => h.command === HOOK_COMMAND)).toHaveLength(1);
    expect(hooks['UserPromptSubmit']!.flatMap((g) => g.hooks ?? []).filter((h) => h.command === PROMPT_HOOK_COMMAND)).toHaveLength(1);
  });

  it('never rewrites a file it cannot parse, and says so', () => {
    mkdirSync(join(dir, '.cursor'));
    writeFileSync(join(dir, '.cursor', 'hooks.json'), '{ "version": 1, ');
    const r = runInit(dir);
    expect(readFileSync(join(dir, '.cursor', 'hooks.json'), 'utf8')).toBe('{ "version": 1, ');
    expect(r.message).toMatch(/not valid JSON/);
  });
});

describe('kadence hook cursor-session / copilot-session', () => {
  beforeEach(() => {
    runInit(dir, 'dev', { hooks: false });
    runTaskAdd(dir, env, 'Fix login', {});
  });

  it('wraps prime in the JSON Cursor reads', () => {
    const out = JSON.parse(runSessionHook(dir, env, 'cursor')) as { additional_context: string };
    expect(out.additional_context).toMatch(/Ready to start: 1/);
  });

  it('wraps prime in the JSON Copilot reads', () => {
    const out = JSON.parse(runSessionHook(dir, env, 'copilot')) as { additionalContext: string };
    expect(out.additionalContext).toMatch(/Ready to start: 1/);
  });

  it('answers {} outside a kadence repository rather than failing the session', () => {
    const outside = mkdtempSync(join(tmpdir(), 'kadence-nowhere-'));
    try {
      expect(runSessionHook(outside, env, 'cursor')).toBe('{}');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('prints valid JSON and exits 0 through the real binary', () => {
    const r = spawnSync('node', [resolve('dist/cli.js'), 'hook', 'cursor-session'], { cwd: dir, encoding: 'utf8', input: '{}' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).additional_context).toMatch(/kadence|Ready/);
  });

  it('the installed command prints valid JSON where kadence is missing, too', () => {
    runInit(dir, 'dev', { hooksFor: ['cursor', 'copilot'] });
    const cursor = (json('.cursor/hooks.json')['hooks'] as Record<string, CursorEntry[]>)['sessionStart']![0]!.command!;
    const copilot = (json('.github/hooks/kadence.json')['hooks'] as Record<string, CopilotEntry[]>)['sessionStart']![0]!.bash!;
    for (const [command, key] of [[cursor, 'additional_context'], [copilot, 'additionalContext']] as const) {
      // An empty PATH: `command -v kadence` fails, as on a teammate's machine without it.
      const r = spawnSync('/bin/sh', ['-c', command], { cwd: dir, encoding: 'utf8', env: { PATH: '/nonexistent' } });
      expect(r.status, command).toBe(0);
      expect(JSON.parse(r.stdout)[key]).toMatch(/npm install -g kadence/);
    }
  });
});

describe('kadence init --hooks-for through the binary', () => {
  it('refuses an agent it does not know, naming the ones it does', () => {
    const r = spawnSync('node', [resolve('dist/cli.js'), 'init', '--hooks-for', 'windsurf'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).toMatch(/codex, cursor, copilot/);
  });

  it('writes the named ones', () => {
    const r = spawnSync('node', [resolve('dist/cli.js'), 'init', '--hooks-for', 'codex,copilot'], { cwd: dir, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(dir, '.codex', 'hooks.json'))).toBe(true);
    expect(existsSync(join(dir, '.github', 'hooks', 'kadence.json'))).toBe(true);
  });
});
