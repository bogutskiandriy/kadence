import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The command surface, read from the built binary: what `--help` lists, in what
 * order, and whether `schema --json` names every one of it.
 *
 * Both halves read the binary rather than the source. The contract said "lists
 * every command" while sprint, template, completion, ui and four task actions
 * were missing from it — a promise nothing checked. An agent that trusts the
 * contract never learns those commands exist.
 */

const CLI = resolve('dist/cli.js');
let dir: string;

function run(args: string[]): { stdout: string; stderr: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

/** `name` and its first positional, as the top-level `--help` lists them. */
function topLevelCommands(): { name: string; firstArg: string | undefined }[] {
  const lines = run(['--help']).stdout.split('\n');
  const start = lines.findIndex((l) => l.trim() === 'Commands:');
  const out: { name: string; firstArg: string | undefined }[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') break;
    const [name, firstArg] = line.trim().split(/\s+/);
    out.push({ name: name!, firstArg: firstArg?.startsWith('[') ? firstArg : undefined });
  }
  return out;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-surface-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run(['init']);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('kadence --help', () => {
  it('lists commands in the order a session meets them, the rest after', () => {
    // Start of a session, the daily loop, then planning, then reading back,
    // then maintenance. Alphabetical would put `board` before `init`; the
    // registration order put `milestone` first, which nobody reaches for first.
    const ORDER = [
      'init', 'prime', 'ready', 'task', 'decision', 'note', 'doc', 'board', 'ui', 'schema',
      'sprint', 'milestone', 'template',
      'report', 'stats',
      'compact', 'completion',
    ];
    const names = topLevelCommands().map((c) => c.name);
    expect(names.slice(0, ORDER.length)).toEqual(ORDER);
  });
});

describe('schema --json names every shipped command', () => {
  /**
   * Actions no error can list: `note` takes free text, so an unknown word is a
   * note and not a mistake. Its summary names `note list` instead.
   */
  const ACTIONS_NO_ERROR_CAN_LIST: Record<string, string[]> = { note: ['list'] };

  /**
   * The actions of a command, as the command itself states them.
   *
   * An unknown action answers `invalid_argument` with `allowed` — the same
   * list an agent receives when it guesses wrong, so this is the set agents
   * already see. Only commands whose first positional is an action or a name
   * are asked: `note xyz` would record a note.
   */
  function actionsOf(name: string, firstArg: string | undefined): string[] {
    const extra = ACTIONS_NO_ERROR_CAN_LIST[name] ?? [];
    if (firstArg !== '[action]' && firstArg !== '[name]') return extra;
    const r = run([name, 'no-such-action-xyz', '--json']);
    const error = (JSON.parse(r.stdout) as { error?: { code?: string; allowed?: string[] } }).error;
    expect(error?.code, `${name}: an unknown action should be invalid_argument`).toBe('invalid_argument');
    expect(error?.allowed, `${name}: an unknown action should carry \`allowed\``).toBeDefined();
    return [...(error?.allowed ?? []), ...extra];
  }

  function published(): string[] {
    const contract = JSON.parse(run(['schema', '--json']).stdout).contract as {
      commands: { name: string }[];
    };
    return contract.commands.map((c) => c.name);
  }

  it('has an entry for every command and every action the CLI accepts', () => {
    const names = published();
    const missing: string[] = [];
    for (const { name, firstArg } of topLevelCommands()) {
      const actions = actionsOf(name, firstArg);
      const expected = actions.length === 0 ? [name] : actions.map((a) => `${name} ${a}`);
      for (const entry of expected) if (!names.includes(entry)) missing.push(entry);
    }
    expect(missing).toEqual([]);
  });

  it('names nothing the CLI does not have', () => {
    const real = new Map(topLevelCommands().map((c) => [c.name, actionsOf(c.name, c.firstArg)]));
    const phantom = published().filter((entry) => {
      const [name, action] = entry.split(' ');
      const actions = real.get(name!);
      if (actions === undefined) return true;
      return action !== undefined && !actions.includes(action);
    });
    expect(phantom).toEqual([]);
  });

  it('publishes each command once', () => {
    const names = published();
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });
});
