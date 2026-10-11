import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli.js');
let dir: string;

function run(args: string[]): { stdout: string; stderr: string; code: number } {
  const r = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status ?? -1 };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function doctor(): { code: number; body: any; stderr: string } {
  const r = run(['doctor', '--json']);
  return { code: r.code, body: JSON.parse(r.stdout), stderr: r.stderr };
}

/** Every event file and its bytes, so a test can prove none was touched. */
function journalFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[full] = readFileSync(full, 'utf8');
    }
  };
  walk(join(dir, '.kadence', 'events'));
  return out;
}

const cache = (): string => join(dir, '.kadence', 'state.json');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kadence-doctor-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });
  run(['init']);
  run(['task', 'add', 'Write the parser']);
  run(['task', 'add', 'Ship it']);
  run(['task', 'move', 'KAD-1', 'in_progress']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('kadence doctor (G5)', () => {
  it('reports a healthy journal and exits 0', () => {
    const { code, body } = doctor();

    expect(code).toBe(0);
    expect(body.ok).toBe(true);
    expect(body.events.total).toBe(Object.keys(journalFiles()).length);
    expect(body.events.damaged).toEqual([]);
  });

  it('never touches an event, whatever it finds', () => {
    const before = journalFiles();
    doctor();
    expect(journalFiles()).toEqual(before);
  });

  it('rebuilds a deleted cache, and the state is what it was (I6)', () => {
    const board = run(['board', '--json']).stdout;
    rmSync(cache());

    const { body } = doctor();

    expect(body.cache.before).toBe('missing');
    expect(body.cache.written).toBe(true);
    expect(existsSync(cache())).toBe(true);
    expect(run(['board', '--json']).stdout).toBe(board);
  });

  it('finds a cache that disagrees with the journal and replaces it', () => {
    // The fingerprint is names, count and bytes. An edit that keeps all three
    // passes it: a cache can claim to be fresh and still serve a lie.
    run(['board', '--json']);
    const text = readFileSync(cache(), 'utf8');
    writeFileSync(cache(), text.replace('Write the parser', 'Write the PARSER'), 'utf8');
    expect(run(['task', 'show', 'KAD-1', '--json']).stdout).toContain('Write the PARSER');

    const { code, body } = doctor();

    expect(code).toBe(0);
    expect(body.cache.before).toBe('fresh');
    expect(body.cache.agreed).toBe(false);
    expect(run(['task', 'show', 'KAD-1', '--json']).stdout).toContain('Write the parser');
  });

  it('says the cache agreed when it did', () => {
    run(['board', '--json']);
    expect(doctor().body.cache).toMatchObject({ before: 'fresh', agreed: true });
  });

  it('fails with journal_damaged and names the file when an event cannot be read', () => {
    const month = join(dir, '.kadence', 'events', '2026-10');
    mkdirSync(month, { recursive: true });
    writeFileSync(join(month, '01M4ZZZZZZZZZZZZZZZZZZZZZZ.json'), '{"half an event', 'utf8');

    const { code, body } = doctor();

    expect(code).toBe(1);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('journal_damaged');
    expect(body.events.damaged).toEqual(['.kadence/events/2026-10/01M4ZZZZZZZZZZZZZZZZZZZZZZ.json']);
    // A damaged journal is not cached, here as everywhere else.
    expect(body.cache.written).toBe(false);
  });

  it('reports what the fold surfaces without calling it an error', () => {
    // Conflicts are kept and reported, never resolved by rejection: a doctor
    // that failed on them would fail on every healthy team that merges.
    run(['task', 'claim', 'KAD-2']);
    execFileSync('git', ['config', 'user.email', 'other@example.com'], { cwd: dir });
    run(['task', 'claim', 'KAD-2']);

    const { code, body } = doctor();

    expect(code).toBe(0);
    expect(body.surfaced.contested).toEqual(['KAD-2']);
  });

  it('speaks to a person without --json', () => {
    const r = run(['doctor']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/events/i);
    expect(r.stdout).toMatch(/cache/i);
  });

  it('is published in the contract, with its error code', () => {
    const contract = JSON.parse(run(['schema', '--json']).stdout).contract;
    expect(contract.commands.map((c: { name: string }) => c.name)).toContain('doctor');
    expect(contract.errors.map((e: { code: string }) => e.code)).toContain('journal_damaged');
  });
});
