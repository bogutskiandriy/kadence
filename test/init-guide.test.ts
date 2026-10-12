import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInit, shouldGuide, greetsPerson } from '../src/cli/commands/init.js';

/**
 * Who `kadence init` is talking to (KAD-89, KAD-90).
 *
 * A person at a terminal gets a guided setup; everything else — an agent, a
 * script, CI, anyone who passed a flag — gets no question at all. A prompt an
 * agent cannot answer hangs it until a timeout (claude-code#30555), and in a
 * neighbouring tool exited 0 having created nothing (Backlog.md#1012), so the
 * default when in doubt is never to ask.
 */

const terminal = { stdin: true, stdout: true, flags: false };

describe('shouldGuide', () => {
  it('guides a person at a terminal who passed no flag', () => {
    expect(shouldGuide({}, terminal)).toBe(true);
  });

  it.each([
    ['stdin is a pipe', {}, { ...terminal, stdin: false }],
    ['stdout is a pipe', {}, { ...terminal, stdout: false }],
    ['a flag was given', {}, { ...terminal, flags: true }],
    ['CI', { CI: 'true' }, terminal],
    ['KADENCE_SOURCE=agent', { KADENCE_SOURCE: 'agent' }, terminal],
    ['AI_AGENT, the generic marker', { AI_AGENT: 'claude-code_2' }, terminal],
    ['Claude Code', { CLAUDECODE: '1' }, terminal],
    ['Cursor’s agent', { CURSOR_AGENT: '1' }, terminal],
    ['Codex', { CODEX_SANDBOX: 'seatbelt' }, terminal],
    ['Gemini CLI', { GEMINI_CLI: '1' }, terminal],
    ['a dumb terminal', { TERM: 'dumb' }, terminal],
    ['KADENCE_INTERACTIVE=0', { KADENCE_INTERACTIVE: '0' }, terminal],
  ] as const)('never asks when %s', (_why, env, io) => {
    expect(shouldGuide(env, io)).toBe(false);
  });

  it('lets KADENCE_INTERACTIVE=1 win over an agent marker, but never over a pipe', () => {
    expect(shouldGuide({ KADENCE_INTERACTIVE: '1', CLAUDECODE: '1' }, terminal)).toBe(true);
    expect(shouldGuide({ KADENCE_INTERACTIVE: '1' }, { ...terminal, stdin: false })).toBe(false);
  });
});

describe('greetsPerson — who sees Coda', () => {
  // KAD-80: Coda is for the person who ran init, never for an agent. A TTY was
  // the whole test, so an agent running in a pty with AI_AGENT set got the
  // drawing — seen in a recording, not in the suite.
  it('greets a person at a terminal, flags or not', () => {
    expect(greetsPerson({}, true)).toBe(true);
  });
  it('never greets an agent, even on a terminal', () => {
    expect(greetsPerson({ AI_AGENT: 'claude-code' }, true)).toBe(false);
    expect(greetsPerson({ KADENCE_SOURCE: 'agent' }, true)).toBe(false);
  });
  it('never draws into a pipe', () => {
    expect(greetsPerson({}, false)).toBe(false);
  });
});

describe('what init tells an agent to do next', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kadence-init-guide-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'you@example.com'], { cwd: dir });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('asks the agent for one decision and points the person at the guided setup', () => {
    const r = runInit(dir, 'test', { hooks: false });
    expect(r.message).toContain('Next, if an agent is reading this:');
    expect(r.message).toContain('Ask the human for one decision the team already made');
    expect(r.message).toContain('kadence init in a terminal');
  });

  it('names the ADR folder and the command to record each one', () => {
    mkdirSync(join(dir, 'docs', 'adr'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'adr', '0001-postgres.md'), '# Postgres\n');
    writeFileSync(join(dir, 'docs', 'adr', '0002-rest.md'), '# REST\n');
    const r = runInit(dir, 'test', { hooks: false });
    expect(r.message).toContain('docs/adr/ holds 2 ADRs');
    expect(r.message).toContain('--doc docs/adr/<file>');
  });

  it('says what it wrote, for the guided setup to show', () => {
    const r = runInit(dir, 'test', { hooks: false });
    expect(r.written).toEqual(['.kadence/', 'AGENTS.md', 'CLAUDE.md']);
  });

  it('never waits for an answer in a pipe, even with a terminal-looking environment', () => {
    // Exactly how an agent runs it: stdin and stdout are pipes.
    const r = spawnSync('node', [resolve('dist/cli.js'), 'init'], {
      cwd: dir,
      input: '',
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, KADENCE_INTERACTIVE: '1', TERM: 'xterm-256color' },
    });
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Next, if an agent is reading this:');
    expect(r.stdout).not.toMatch(/\x1b\[\?25l/);
  });
});
