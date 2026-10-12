import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runDecisionAdd } from '../src/cli/commands/decision.js';
import { runPromptHook, runHookLog, logPrime, hookLogPath } from '../src/cli/commands/hook.js';

/**
 * What kadence put into an agent's context, and what it cost (KAD-76).
 *
 * The first outside reviewer's question was not whether it works but how:
 * "it's important to understand how my agent would utilize this context".
 * The answer lived in the README's cost table. `kadence hook log` shows it for
 * a session: what prime added at the start, what the prompt hook added to each
 * prompt, and the size — kept in the system temp directory, never in git.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const ask = (prompt: string, session = 's1') => runPromptHook(dir, env, JSON.stringify({ prompt, session_id: session }));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-hook-log-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir, 'test', { hooks: false });
  runDecisionAdd(dir, env, 'Keep sessions in Redis', { why: 'Revocation must be instant', rejected: 'JWT: cannot revoke before expiry' });
});
afterEach(() => {
  rmSync(hookLogPath(dir), { force: true });
  rmSync(dir, { recursive: true, force: true });
});

describe('kadence hook log', () => {
  it('shows, for the last session, what prime and the prompt hook added and its size', () => {
    logPrime(dir, env, 'Nothing claimed by you.\n\nDecisions in force:\n  DEC-1 Keep sessions in Redis\n');
    const said = ask('should we move sessions to JWT?');
    expect(said.length).toBeGreaterThan(0);

    const r = runHookLog(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.message).toContain('prime');
    expect(r.message).toContain('"should we move sessions to JWT?"');
    expect(r.message).toContain('DEC-1');
    expect(r.message).toMatch(/≈ \d+ tokens/);
    const data = r.data as { entries: Array<{ kind: string; bytes: number; tokens: number; records: string[] }>; total: { tokens: number } };
    expect(data.entries.map((e) => e.kind)).toEqual(['prime', 'prompt']);
    expect(data.entries[1]!.bytes).toBe(Buffer.byteLength(said, 'utf8'));
    expect(data.entries[1]!.tokens).toBe(Math.ceil(data.entries[1]!.bytes / 4));
    expect(data.entries[1]!.records).toEqual(['DEC-1']);
    expect(data.total.tokens).toBe(data.entries.reduce((n, e) => n + e.tokens, 0));
  });

  it('records a prompt the hook said nothing to, as nothing added', () => {
    ask('rename a variable in the parser');
    const r = runHookLog(dir, env, {});
    expect(r.message).toContain('nothing added');
    expect((r.data as { entries: Array<{ bytes: number }> }).entries[0]!.bytes).toBe(0);
  });

  it('shows only the latest session', () => {
    ask('should we move sessions to JWT?', 'old');
    ask('why redis for sessions?', 'new');
    const r = runHookLog(dir, env, {});
    expect(r.message).toContain('why redis for sessions?');
    expect(r.message).not.toContain('move sessions to JWT');
  });

  it('keeps the log out of the repository', () => {
    ask('should we move sessions to JWT?');
    expect(hookLogPath(dir).startsWith(tmpdir())).toBe(true);
    expect(existsSync(hookLogPath(dir))).toBe(true);
    const tracked = readdirSync(join(dir, '.kadence')).filter((f) => f.includes('log'));
    expect(tracked).toEqual([]);
  });

  it('says how to start when nothing has been logged', () => {
    const r = runHookLog(dir, env, {});
    expect(r.ok).toBe(true);
    expect(r.message).toContain('Nothing logged yet');
  });
});
