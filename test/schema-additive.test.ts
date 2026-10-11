import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

/**
 * `schema --json` only ever gains (G3 in DOC-32; DOC-65).
 *
 * The contract says so about itself — "fields and error codes may be added,
 * never renamed or removed within kadence/v1" — and nothing held it to that.
 * Each fixture directory keeps the contract that version published, captured
 * by scripts/make-fixtures.mjs from the package installed from npm, so the
 * comparison is with what agents were really told, not with our memory of it.
 *
 * Checked on 2026-10-12 against every release from 0.2.2 (the first with a
 * schema) to 0.8.2: none had removed anything, so every one is held here, not
 * only the latest. A deliberate 0.x break would be a ⚠️ section in the
 * CHANGELOG and an entry below saying which version and why.
 */

const FIXTURES = join(import.meta.dirname, 'fixtures', 'journals');
const CLI = resolve('dist/cli.js');

/* eslint-disable @typescript-eslint/no-explicit-any */
type Contract = any;

const released = readdirSync(FIXTURES)
  .filter((v) => existsSync(join(FIXTURES, v, 'schema.json')))
  .sort();

function contractOf(version: string): Contract {
  return JSON.parse(readFileSync(join(FIXTURES, version, 'schema.json'), 'utf8')).contract;
}

/** Everything in `old` that `now` no longer has, one line per loss. */
export function lost(old: Contract, now: Contract): string[] {
  const out: string[] = [];
  const commands = new Map<string, any>(now.commands.map((c: any) => [c.name, c]));
  for (const c of old.commands) {
    const n = commands.get(c.name);
    if (n === undefined) {
      out.push(`command "${c.name}"`);
      continue;
    }
    for (const f of c.flags ?? []) if (!(n.flags ?? []).includes(f)) out.push(`flag ${f} of "${c.name}"`);
    if (c.json === true && n.json !== true) out.push(`--json of "${c.name}"`);
  }
  const codes = new Set(now.errors.map((e: any) => e.code));
  for (const e of old.errors) if (!codes.has(e.code)) out.push(`error code ${e.code}`);
  for (const k of Object.keys(old.exitCodes ?? {})) if (!(k in (now.exitCodes ?? {}))) out.push(`exit code ${k}`);
  for (const k of Object.keys(old.env ?? {})) if (!(k in (now.env ?? {}))) out.push(`env ${k}`);
  for (const [name, shape] of Object.entries<any>(old.shapes ?? {})) {
    const n = now.shapes?.[name];
    if (n === undefined) {
      out.push(`shape ${name}`);
      continue;
    }
    // required: what a consumer may rely on being there; selectable: what
    // --fields accepts; optional: what it may meet. Losing any breaks a caller.
    for (const list of ['required', 'selectable', 'optional']) {
      for (const f of shape[list] ?? []) if (!(n[list] ?? []).includes(f)) out.push(`${name}.${list} ${f}`);
    }
  }
  return out;
}

describe('schema --json only ever gains', () => {
  const current: Contract = JSON.parse(
    spawnSync('node', [CLI, 'schema', '--json'], { encoding: 'utf8' }).stdout,
  ).contract;

  it('has the contract of every release since the schema existed', () => {
    // 0.2.2 is the first release with `schema`; 0.8.2 the last when this was
    // written. Fewer means a fixture went missing, and the test below would
    // quietly hold the contract to less.
    expect(released.length).toBeGreaterThanOrEqual(9);
    expect(released).toContain('0.2.2');
    expect(released).toContain('0.8.2');
  });

  for (const version of released) {
    it(`keeps everything ${version} published`, () => {
      expect(lost(contractOf(version), current), `lost since ${version}`).toEqual([]);
    });
  }

  it('notices a loss — the comparison is not vacuous', () => {
    const latest = contractOf(released[released.length - 1]!);
    const trimmed = {
      ...latest,
      errors: latest.errors.slice(1),
      commands: latest.commands.map((c: any) =>
        c.name === 'board' ? { ...c, flags: (c.flags ?? []).filter((f: string) => f !== '--fields') } : c,
      ),
    };
    expect(lost(latest, trimmed)).toEqual([`flag --fields of "board"`, `error code ${latest.errors[0].code}`]);
  });
});
