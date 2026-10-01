import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInit } from '../src/cli/commands/init.js';
import { runDocAdd, runDocShow, runDocEditInEditor } from '../src/cli/commands/doc.js';
import { editText, type EditorResult } from '../src/cli/editor.js';

/**
 * `doc edit` with no text opens $EDITOR for a person (KAD-39).
 *
 * The terminal itself is checked by hand; what is tested here is everything
 * either side of it: what the editor is handed, what comes back, and what is
 * written. The one trap found on the way: the editor helper strips lines that
 * start with `#`, as git does for commit messages — and in a document every
 * heading starts with `#`.
 */

let dir: string;
const env = {} as NodeJS.ProcessEnv;
const BODY = '# Auth\n\nSessions live in a cookie.\n\n## Redirects\n\nSafari drops it on a 302.';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-doc-editor-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  runInit(dir, 'dev', { hooks: false });
  runDocAdd(dir, env, 'How login works', { body: BODY });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const bodyNow = () => (runDocShow(dir, env, 'DOC-1').data!['document'] as { body: string }).body;

describe('editText for a document', () => {
  it('keeps Markdown headings: only its own hint is removed', () => {
    // An editor that saves without touching anything.
    const r = editText({ EDITOR: 'true' }, BODY, 'Editing DOC-1.', { markdown: true });
    expect(r.error).toBeNull();
    expect(r.text).toBe(BODY);
  });

  it('removes the hint even when the person edited around it', () => {
    const script = join(dir, 'append.sh');
    writeFileSync(script, '#!/bin/sh\nprintf "\\nA new line.\\n" >> "$1"\n');
    chmodSync(script, 0o755);
    const r = editText({ EDITOR: script }, BODY, 'Editing DOC-1.', { markdown: true });
    expect(r.text).toContain('# Auth');
    expect(r.text).toContain('A new line.');
    expect(r.text).not.toMatch(/Editing DOC-1|empty file to abort/);
  });
});

describe('runDocEditInEditor', () => {
  const editor = (change: (current: string) => string | null) => (current: string): EditorResult => {
    const text = change(current);
    return { text, error: null };
  };

  it('writes what the person saved as a new revision', () => {
    const r = runDocEditInEditor(dir, env, 'DOC-1', editor((c) => `${c}\n\nAnd Chrome keeps it.`));
    expect(r.ok).toBe(true);
    expect(bodyNow()).toContain('And Chrome keeps it.');
    expect(bodyNow()).toContain('## Redirects');
  });

  it('hands the editor the current text', () => {
    let seen = '';
    runDocEditInEditor(dir, env, 'DOC-1', (current) => {
      seen = current;
      return { text: null, error: null };
    });
    expect(seen).toBe(BODY);
  });

  it('changes nothing and says so when the buffer is emptied or left as it was', () => {
    for (const change of [() => null, (c: string) => c]) {
      const r = runDocEditInEditor(dir, env, 'DOC-1', editor(change));
      expect(r.ok).toBe(true);
      expect(r.exitCode).toBe(0);
      expect(r.message).toMatch(/nothing changed/i);
    }
    expect(bodyNow()).toBe(BODY);
  });

  it('reports an editor that failed, and writes nothing', () => {
    const r = runDocEditInEditor(dir, env, 'DOC-1', () => ({ text: null, error: 'Editor "nope" exited without saving.' }));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('nope');
    expect(bodyNow()).toBe(BODY);
  });
});

describe('kadence doc edit without text, as a process', () => {
  it('without a terminal, says how to pass the text instead of hanging', () => {
    const r = spawnSync('node', [resolve('dist/cli.js'), 'doc', 'edit', 'DOC-1'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, KADENCE_SOURCE: '', EDITOR: 'true' },
      timeout: 10_000,
    });
    expect(r.status).toBe(2);
    expect(`${r.stdout}${r.stderr}`).toMatch(/--file|--body/);
    expect(bodyNow()).toBe(BODY);
  });
});
