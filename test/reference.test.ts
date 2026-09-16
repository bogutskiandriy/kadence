import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * The reference the site publishes is generated from the built binary, never
 * typed by hand.
 *
 * A hand-written CLI page drifts the moment a flag is added, and nothing
 * fails when it does — the site kept describing `kadence task` as it was at
 * 0.3 for the whole of 0.4. This suite is what makes that impossible: the
 * generator reads `--help` and `schema --json` from the binary that is about
 * to ship, and a command the CLI does not describe fails the build here rather
 * than appearing as a gap on the site.
 *
 * The generator is spawned rather than imported. It is plain JavaScript (as
 * `scripts/build.mjs` is, and for the same reason — it runs before anything is
 * compiled), and spawning it tests the entry point that CI and `prepublishOnly`
 * actually run.
 */

const GENERATOR = resolve('scripts/reference.mjs');

/** Commands that exist but have no file of their own in `src/cli/commands/`. */
const COMMANDS_WITHOUT_A_FILE = ['schema'];

interface ReferenceOption {
  flag: string;
  description: string;
}

interface ReferenceCommand {
  name: string;
  summary: string;
  usage: string;
  options: ReferenceOption[];
  examples: string[];
}

interface Reference {
  tool: { name: string; version: string };
  generatedFrom: string;
  commands: ReferenceCommand[];
  contract: Record<string, unknown>;
}

let reference: Reference;

beforeAll(() => {
  const r = spawnSync('node', [GENERATOR, '--stdout'], { encoding: 'utf8' });
  expect(r.status, `generator failed:\n${r.stderr}`).toBe(0);
  reference = JSON.parse(r.stdout) as Reference;
}, 30_000);

function command(name: string): ReferenceCommand {
  const found = reference.commands.find((c) => c.name === name);
  expect(found, `no command "${name}" in the reference`).toBeDefined();
  return found as ReferenceCommand;
}

describe('the generated reference', () => {
  it('describes every command the CLI has a file for', () => {
    // The acceptance criterion this whole file exists for: a new command
    // whose help is never registered cannot reach a release unnoticed.
    const fromFiles = readdirSync('src/cli/commands')
      .filter((f) => f.endsWith('.ts'))
      .map((f) => f.replace(/\.ts$/, ''));

    const expected = [...fromFiles, ...COMMANDS_WITHOUT_A_FILE].sort();
    const described = reference.commands.map((c) => c.name).sort();

    expect(described).toEqual(expect.arrayContaining(expected));
  });

  it('carries the version of the binary it read, not of the checkout', () => {
    // The site states a version beside the reference. If that came from
    // anywhere but the binary, the two could disagree and nothing would say so.
    const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(reference.tool.version).toBe(version);
    expect(reference.tool.name).toBe('kadence');
  });

  it('splits options into a flag and a description', () => {
    // A page that prints raw help is still a page nobody can style or search.
    const compact = command('compact');
    expect(compact.options).toContainEqual({
      flag: '--dry-run',
      description: 'Say what would be archived and write nothing',
    });
    expect(compact.options.some((o) => o.flag === '--keep-months <n>')).toBe(true);
  });

  it('keeps the examples, which are the part people actually copy', () => {
    const compact = command('compact');
    expect(compact.examples).toContain('kadence compact --dry-run');
    expect(compact.examples).toContain('kadence compact --keep-months 3');
  });

  it('keeps the usage line', () => {
    expect(command('ready').usage).toBe('kadence ready');
    expect(command('milestone').usage).toBe('kadence milestone [action] [arg]');
  });

  it('carries the one-line summary from the top-level help', () => {
    // Two different texts describe a command: the summary in `kadence --help`
    // and the detail in `kadence <cmd> --help`. The page needs both.
    expect(command('ready').summary).toMatch(/open, unblocked, unclaimed/i);
  });

  it('embeds the machine contract, so one file answers both audiences', () => {
    const contract = reference.contract as {
      version: string;
      errors: { code: string }[];
      shapes: Record<string, unknown>;
      commands: { name: string }[];
    };
    expect(contract.version).toBe('kadence/v1');
    expect(contract.errors.length).toBeGreaterThan(10);
    expect(contract.shapes).toHaveProperty('task');
    expect(contract.commands.length).toBeGreaterThan(30);
  });

  it('names what produced it, because a generated file with no marker rots', () => {
    // The same argument as the provenance comment `init` writes into other
    // people's repositories (ADR-009).
    expect(reference.generatedFrom).toMatch(/scripts\/reference\.mjs/);
  });

  it('writes JSON and nothing else to stdout', () => {
    // The site reads this through a pipe at build time. A stray warning on
    // stdout is the fifth bug in the family CLAUDE.md lists.
    const r = spawnSync('node', [GENERATOR, '--stdout'], { encoding: 'utf8' });
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });
});
