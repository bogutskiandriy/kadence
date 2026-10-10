import { describe, expect, it } from 'vitest';
import { CODA_ART, codaGreeting } from '../src/cli/coda.js';

const MESSAGE =
  'kadence is ready.\n\n' +
  '  kadence task add "first task"\n' +
  'Files were created but not committed — that call is yours.';

const opts = (tty: boolean, color: boolean) => ({ tty, color, version: '0.8.1' });

describe('codaGreeting — the character in kadence init (KAD-80)', () => {
  it('leaves the message byte-for-byte alone when stdout is not a terminal', () => {
    // Agents run init through a pipe: they must never pay for the drawing.
    expect(codaGreeting(MESSAGE, opts(false, false))).toBe(MESSAGE);
    expect(codaGreeting(MESSAGE, opts(false, true))).toBe(MESSAGE);
  });

  it('is three rows tall, like the mark in a CLI header — small, not a banner', () => {
    expect(CODA_ART).toHaveLength(3);
  });

  it('sets the name and version, the first line and Coda’s line beside the drawing, then the rest whole', () => {
    const out = codaGreeting(MESSAGE, opts(true, false));
    const lines = out.split('\n');
    expect(lines[0]).toContain('kadence v0.8.1');
    expect(lines[1]).toContain('kadence is ready.');
    expect(lines[2]).toContain('Coda keeps what you decide, and why.');
    expect(out.match(/kadence is ready\./g)).toHaveLength(1);
    expect(out.endsWith(MESSAGE.split('\n').slice(1).join('\n'))).toBe(true);
    for (const row of CODA_ART) expect(out).toContain(row.trimEnd());
  });

  it('uses no escape codes when colours are off (NO_COLOR, or a terminal without them)', () => {
    expect(codaGreeting(MESSAGE, opts(true, false))).not.toMatch(/\u001b\[/);
  });

  it('paints only the header — the commands and notes below stay plain', () => {
    const out = codaGreeting(MESSAGE, opts(true, true));
    expect(out.split('\n').slice(0, 3).join('\n')).toMatch(/\u001b\[/);
    expect(out.split('\n').slice(3).join('\n')).not.toMatch(/\u001b\[/);
  });

  it('keeps every row of the drawing the same width, so the text beside it lines up', () => {
    const widths = new Set(CODA_ART.map((row) => [...row].length));
    expect(widths.size).toBe(1);
  });
});

describe('kadence init through a pipe — how an agent runs it', () => {
  it('prints no drawing: the message an agent reads is unchanged', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { execFileSync, spawnSync } = await import('node:child_process');
    const { tmpdir } = await import('node:os');
    const { join, resolve } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'kadence-coda-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      execFileSync('git', ['config', 'user.email', 'you@example.com'], { cwd: dir });
      execFileSync('git', ['config', 'user.name', 'you'], { cwd: dir });
      const r = spawnSync('node', [resolve('dist/cli.js'), 'init', '--no-hooks'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(r.stdout.startsWith('kadence is ready.')).toBe(true);
      for (const row of CODA_ART) expect(r.stdout).not.toContain(row.trim());
      expect(r.stdout).not.toContain('Coda');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
