/**
 * The command reference, read out of the binary rather than written about it.
 *
 * The site used to carry a hand-typed CLI page. It described 0.3 for the whole
 * of 0.4 — nine commands and a dozen flags shipped without it noticing, because
 * prose has no test. This produces the same page's content from the binary that
 * is about to be published: `--help` for the shape a person reads, and
 * `schema --json` for the contract an agent reads, in one file.
 *
 * The generator lives here and not in the site because ADR-008 puts anything
 * derived from the product inside the product: the site consumes the output of
 * a release, it does not reach into the source. `dist/reference.json` ships in
 * the package, so a site build — or an agent with kadence installed — reads the
 * reference of the exact version it depends on, with no network and no
 * guessing.
 *
 * Deliberately no timestamp. It would rewrite the file on every build and fill
 * diffs with noise, while the version changes exactly when the content might
 * have. The same argument as the provenance marker `init` writes (ADR-009).
 *
 *   node scripts/reference.mjs             writes dist/reference.json
 *   node scripts/reference.mjs --stdout    prints it, for a pipe
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const OUT = fileURLToPath(new URL('../dist/reference.json', import.meta.url));

/** Runs the built CLI and returns stdout. Its stderr is never part of a contract. */
function cli(args) {
  return execFileSync('node', [CLI, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' },
  });
}

/**
 * Splits a help line into its left column and its description.
 *
 * cac pads the columns with spaces, so two or more of them is the separator.
 * A single space inside a flag — `--keep-months <n>`, `-a, --assignee <who>` —
 * is therefore safe, which is why this is not a split on whitespace.
 */
function twoColumns(line) {
  const match = line.trim().match(/^(.*?)\s{2,}(.*)$/);
  if (!match) return { left: line.trim(), right: '' };
  return { left: match[1].trim(), right: match[2].trim() };
}

/** Returns the indented body of a `Heading:` block, stopping at the next one. */
function section(help, heading) {
  const lines = help.split('\n');
  const start = lines.findIndex((l) => l.trim() === `${heading}:`);
  if (start === -1) return [];

  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    if (/^\S/.test(line)) break; // an unindented line starts the next section
    body.push(line);
  }
  return body;
}

/** One command, as `kadence <name> --help` describes it. */
function readCommand(name, summary) {
  const help = cli([name, '--help']);

  const usage = (section(help, 'Usage')[0] ?? '').trim().replace(/^\$\s*/, '');

  const options = section(help, 'Options')
    .map(twoColumns)
    .filter(({ left }) => left.startsWith('-'))
    .map(({ left, right }) => ({ flag: left, description: right }));

  // Examples keep their internal spacing: several carry an aligned note after
  // the command, and collapsing it would run the two together.
  const examples = section(help, 'Examples').map((l) => l.replace(/^\s{2}/, '').trimEnd());

  return { name, summary, usage, options, examples };
}

export function buildReference() {
  const topLevel = cli(['--help']);

  const version = (topLevel.match(/^kadence\/(\S+)/m) ?? [])[1];
  if (!version) throw new Error('could not read the version from `kadence --help`');

  const commands = section(topLevel, 'Commands')
    .map(twoColumns)
    .map(({ left, right }) => ({ name: left.split(/\s+/)[0], summary: right }))
    .filter(({ name }) => name && !name.startsWith('-'))
    .map(({ name, summary }) => readCommand(name, summary));

  const contract = JSON.parse(cli(['schema', '--json'])).contract;

  return {
    tool: { name: 'kadence', version },
    generatedFrom: 'scripts/reference.mjs, from `kadence --help` and `kadence schema --json`',
    commands,
    contract,
  };
}

// Only when run directly: importing this from a test must not write a file.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reference = buildReference();
  const json = `${JSON.stringify(reference, null, 2)}\n`;

  if (process.argv.includes('--stdout')) {
    process.stdout.write(json);
  } else {
    writeFileSync(OUT, json);
    const kb = (Buffer.byteLength(json) / 1024).toFixed(0);
    console.error(`wrote dist/reference.json (${kb} KB, ${reference.commands.length} commands)`);
  }
}
