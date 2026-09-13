import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';

/**
 * `.claude/settings.json` is the user's file, not ours.
 *
 * So the hook goes in only when asked for by name, and an upsert must survive
 * whatever is already there. Writing over someone's hooks would be the kind of
 * damage that is noticed weeks later, when the thing that stopped running is
 * the thing nobody thought about.
 */

let dir: string;
const settingsPath = (): string => join(dir, '.claude', 'settings.json');
const read = (): Record<string, unknown> => JSON.parse(readFileSync(settingsPath(), 'utf8'));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-hooks-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('init --hooks', () => {
  it('does not touch .claude/ without the flag', () => {
    runInit(dir);
    expect(existsSync(join(dir, '.claude'))).toBe(false);
  });

  it('creates the file with a SessionStart hook when asked', () => {
    const r = runInit(dir, 'dev', { hooks: true });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/settings\.json/);

    const hooks = read()['hooks'] as Record<string, unknown>;
    const sessionStart = hooks['SessionStart'] as Array<Record<string, unknown>>;
    expect(sessionStart).toHaveLength(1);
    expect(sessionStart[0]!['matcher']).toBe('startup');
    const entries = sessionStart[0]!['hooks'] as Array<Record<string, unknown>>;
    expect(entries[0]!['type']).toBe('command');
    expect(entries[0]!['command']).toBe('kadence prime');
  });

  it('keeps hooks that were already there, of any event', () => {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath(),
      JSON.stringify({
        model: 'opus',
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'audit.sh' }] }],
          SessionStart: [{ matcher: 'resume', hooks: [{ type: 'command', command: 'mine.sh' }] }],
        },
      }),
      'utf8',
    );

    runInit(dir, 'dev', { hooks: true });
    const settings = read();
    expect(settings['model']).toBe('opus');
    const hooks = settings['hooks'] as Record<string, unknown>;
    expect(hooks['PreToolUse']).toHaveLength(1);
    const sessionStart = hooks['SessionStart'] as Array<Record<string, unknown>>;
    // The existing `resume` group survives; ours is added beside it.
    expect(sessionStart).toHaveLength(2);
    expect(sessionStart.map((g) => g['matcher']).sort()).toEqual(['resume', 'startup']);
  });

  it('adds to an existing startup group instead of creating a second one', () => {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath(),
      JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: 'startup', hooks: [{ type: 'command', command: 'greet.sh' }] },
          ],
        },
      }),
      'utf8',
    );

    runInit(dir, 'dev', { hooks: true });
    const sessionStart = (read()['hooks'] as Record<string, unknown>)['SessionStart'] as Array<
      Record<string, unknown>
    >;
    expect(sessionStart).toHaveLength(1);
    const entries = sessionStart[0]!['hooks'] as Array<Record<string, unknown>>;
    expect(entries.map((e) => e['command'])).toEqual(['greet.sh', 'kadence prime']);
  });

  it('is idempotent — running it twice leaves one hook', () => {
    runInit(dir, 'dev', { hooks: true });
    const second = runInit(dir, 'dev', { hooks: true });
    const sessionStart = (read()['hooks'] as Record<string, unknown>)['SessionStart'] as Array<
      Record<string, unknown>
    >;
    const entries = sessionStart[0]!['hooks'] as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(second.message).toMatch(/already/i);
  });

  it('refuses to rewrite a settings file it cannot parse', () => {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(settingsPath(), '{ not json', 'utf8');
    const r = runInit(dir, 'dev', { hooks: true });
    // The repository is still initialised; only the hook is skipped, loudly.
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/could not read|not valid JSON/i);
    expect(readFileSync(settingsPath(), 'utf8')).toBe('{ not json');
  });
});
