import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-agent-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const agentsPath = () => join(dir, 'AGENTS.md');
const claudePath = () => join(dir, 'CLAUDE.md');

describe('.kadence/README.md', () => {
  it('is created on init', () => {
    runInit(dir);
    expect(existsSync(join(dir, '.kadence', 'README.md'))).toBe(true);
  });

  it('contains the commands and the contract description', () => {
    runInit(dir);
    const text = readFileSync(join(dir, '.kadence', 'README.md'), 'utf8');
    expect(text).toContain('kadence task list --json');
    expect(text).toContain('kadence/v1');
    expect(text).toContain('KADENCE_SOURCE');
  });

  it('is not overwritten when the user has edited it', () => {
    runInit(dir);
    writeFileSync(join(dir, '.kadence', 'README.md'), 'my own rules');
    runInit(dir);
    expect(readFileSync(join(dir, '.kadence', 'README.md'), 'utf8')).toBe('my own rules');
  });
});

describe('AGENTS.md', () => {
  it('is created when absent', () => {
    runInit(dir);
    expect(existsSync(agentsPath())).toBe(true);
    expect(readFileSync(agentsPath(), 'utf8')).toContain('kadence');
  });

  it('is extended while human-written text is untouched', () => {
    writeFileSync(agentsPath(), '# Project rules\n\nWrite tests before code.\n');
    runInit(dir);
    const text = readFileSync(agentsPath(), 'utf8');
    expect(text).toContain('Write tests before code.');
    expect(text).toContain('kadence');
  });

  it('the section is not duplicated on a repeat init', () => {
    runInit(dir);
    runInit(dir);
    runInit(dir);
    const text = readFileSync(agentsPath(), 'utf8');
    expect(text.split('<!-- kadence:begin -->').length - 1).toBe(1);
  });

  it('updates the section content without touching surrounding text', () => {
    runInit(dir);
    const text = readFileSync(agentsPath(), 'utf8');
    writeFileSync(agentsPath(), `${text}\n## My section below\n`);
    runInit(dir);

    const after = readFileSync(agentsPath(), 'utf8');
    expect(after).toContain('## My section below');
    expect(after.split('<!-- kadence:begin -->').length - 1).toBe(1);
  });
});

describe('CLAUDE.md', () => {
  // Claude Code loads CLAUDE.md and does not read AGENTS.md natively
  // (anthropics/claude-code#6235, verified 2026-09-07). Writing only AGENTS.md
  // left the largest agent audience with no entry point that loads on its own.
  // See docs/research/agent-readability-2026-09.md.
  it('is created when absent', () => {
    runInit(dir);
    expect(existsSync(claudePath())).toBe(true);
    expect(readFileSync(claudePath(), 'utf8')).toContain('kadence');
  });

  it('carries the same commands an agent needs as AGENTS.md', () => {
    runInit(dir);
    const text = readFileSync(claudePath(), 'utf8');
    expect(text).toContain('kadence board --json');
    expect(text).toContain('KADENCE_SOURCE');
  });

  it('is extended while human-written text is untouched', () => {
    writeFileSync(claudePath(), '# Working on this repo\n\nRun the tests first.\n');
    runInit(dir);
    const text = readFileSync(claudePath(), 'utf8');
    expect(text).toContain('Run the tests first.');
    expect(text).toContain('kadence');
  });

  it('the section is not duplicated on a repeat init', () => {
    runInit(dir);
    runInit(dir);
    runInit(dir);
    const text = readFileSync(claudePath(), 'utf8');
    expect(text.split('<!-- kadence:begin -->').length - 1).toBe(1);
  });

  it('does not import AGENTS.md — a pointer would drag in the whole file', () => {
    // An `@AGENTS.md` import is the documented bridge, but it loads someone
    // else's entire instruction file into every session. We write the same short
    // section instead, regenerated on every init, so the two cannot drift.
    runInit(dir);
    expect(readFileSync(claudePath(), 'utf8')).not.toContain('@AGENTS.md');
  });
});

describe('what the instruction files tell an agent', () => {
  it('point at the machine-readable contract rather than describing it in prose', () => {
    // The files are loaded into every session; the contract is not. Pointing at
    // a command keeps the ambient cost low and the detail current.
    runInit(dir);
    for (const file of ['AGENTS.md', 'CLAUDE.md', join('.kadence', 'README.md')]) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, file).toContain('kadence schema --json');
    }
  });

  it('warn that statuses are project-configurable', () => {
    // The most likely agent error, and the one a default list makes worse.
    runInit(dir);
    const text = readFileSync(join(dir, '.kadence', 'README.md'), 'utf8');
    expect(text).toContain('error.code');
    expect(text).toMatch(/configured per project|project-configurable/i);
  });
});

describe('provenance in the files we write into someone else\'s repository', () => {
  // Context files rot silently: a year on, nobody knows whether the section is
  // current or where it came from. The practice literature calls for metadata on
  // any file an agent reads — see docs/research/context-handoff-2026-09.md §1.5.
  // We write into other people's repositories, so this matters more for us, not
  // less.
  it('says what generated the section and how to refresh it', () => {
    runInit(dir, '9.9.9');
    for (const file of ['AGENTS.md', 'CLAUDE.md']) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, file).toContain('kadence 9.9.9');
      expect(text, file).toContain('kadence init');
    }
  });

  it('marks the standalone agent README too', () => {
    runInit(dir, '9.9.9');
    expect(readFileSync(join(dir, '.kadence', 'README.md'), 'utf8')).toContain('kadence 9.9.9');
  });

  it('carries no date, so a repeat init does not churn the file', () => {
    // A generated date would rewrite the section every day and fill diffs with
    // noise. The version changes exactly when the content might have, which is
    // the freshness signal that costs nothing.
    runInit(dir, '9.9.9');
    const first = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    runInit(dir, '9.9.9');
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toBe(first);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('replaces the marker when the version changes, without duplicating', () => {
    runInit(dir, '1.0.0');
    runInit(dir, '2.0.0');
    const text = readFileSync(join(dir, 'AGENTS.md'), 'utf8');

    expect(text).toContain('kadence 2.0.0');
    expect(text).not.toContain('kadence 1.0.0');
    expect(text.split('<!-- kadence:begin -->').length - 1).toBe(1);
  });
});
