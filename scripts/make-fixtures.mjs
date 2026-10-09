#!/usr/bin/env node
/**
 * Writes a journal with every published minor version of kadence, for the
 * compatibility test (KAD-59, gate G3 in DOC-32).
 *
 *   node scripts/make-fixtures.mjs [version ...]
 *
 * Each version is installed from npm into a scratch directory and driven
 * through the same scenario. What it wrote under .kadence/events is copied to
 * test/fixtures/journals/<version>/, beside view.json: what that version
 * itself said about the journal (task list, decision list) and which commands
 * it accepted. The compatibility test folds the events with today's code and
 * holds it to that view — so the fixture is what a user's repository really
 * contains, not what we remember the format to have been.
 *
 * Run by hand, once per release; the output is committed. It needs the
 * registry to install the old versions. kadence itself makes no network call.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'test', 'fixtures', 'journals');
const VERSIONS = process.argv.length > 2 ? process.argv.slice(2) : ['0.1.5', '0.2.2', '0.3.2', '0.4.1', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.8.1'];

/**
 * One scenario for every version. Later commands do not exist in early
 * versions; a refusal is recorded, not treated as a failure — the fixture is
 * whatever that version could write.
 */
const SCENARIO = [
  ['init', '--no-hooks'],
  ['task', 'add', 'Fix login on Safari', '-d', 'The cookie is dropped on redirect', '--type', 'bug', '--priority', 'high'],
  ['task', 'add', 'Export to CSV', '--type', 'story', '--estimate', '5'],
  ['task', 'add', 'Update dependencies'],
  ['task', 'add', 'Remove the legacy importer'],
  ['task', 'move', 'KAD-1', 'in_progress'],
  ['task', 'assign', 'KAD-2', 'dev@example.com'],
  ['task', 'block', 'KAD-3', 'KAD-1'],
  ['task', 'claim', 'KAD-2'],
  ['task', 'comment', 'KAD-1', 'Reproduced on Safari 17.4'],
  ['task', 'ac', 'add', 'KAD-2', 'Exports ten thousand rows'],
  ['task', 'ac', 'check', 'KAD-2', '1'],
  ['task', 'edit', 'KAD-1', '--add-label', 'auth'],
  ['task', 'move', 'KAD-1', 'done'],
  ['task', 'move', 'KAD-4', 'cancelled'],
  ['decision', 'add', 'Identify tasks by ULID', '--why', 'Clocks disagree between machines', '--rejected', 'Auto-increment: collides across branches'],
  ['decision', 'add', 'Identify everything by ULID', '--why', 'Notes and decisions need the same guarantee', '--supersedes', 'DEC-1'],
  ['note', 'Safari drops the cookie on a 302', '--task', 'KAD-1'],
  ['sprint', 'create', 'Sprint 1'],
  ['sprint', 'add', 'KAD-2', '--sprint', 'Sprint 1'],
  ['milestone', 'create', '1.0'],
  ['milestone', 'add', 'KAD-3', '--milestone', '1.0'],
  ['doc', 'add', 'How login works', '--body', 'Sessions live in a cookie.', '--task', 'KAD-1'],
  ['doc', 'edit', 'DOC-1', '--body', 'Sessions live in a cookie set after the redirect.'],
];

function run(cwd, cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KADENCE_SOURCE: 'agent', NO_COLOR: '1', EDITOR: 'true', VISUAL: 'true' },
  });
  return { ok: r.status === 0, out: r.stdout ?? '', err: r.stderr ?? '' };
}

/** The version's own JSON answer, or null when it had no such command. */
function view(cwd, cli, ...attempts) {
  for (const args of attempts) {
    const r = run(cwd, 'node', [cli, ...args]);
    if (!r.ok) continue;
    try {
      return JSON.parse(r.out);
    } catch {
      // Older versions printed text for some commands; try the next form.
    }
  }
  return null;
}

for (const version of VERSIONS) {
  const work = mkdtempSync(join(tmpdir(), `kadence-fixture-${version}-`));
  try {
    const install = join(work, 'install');
    mkdirSync(install);
    writeFileSync(join(install, 'package.json'), '{"private":true}');
    const npm = run(install, 'npm', ['install', `kadence@${version}`, '--ignore-scripts', '--no-audit', '--no-fund']);
    if (!npm.ok) throw new Error(`npm install kadence@${version}: ${npm.err}`);
    const pkg = JSON.parse(readFileSync(join(install, 'node_modules', 'kadence', 'package.json'), 'utf8'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.kadence;
    const cli = join(install, 'node_modules', 'kadence', bin);

    const repo = join(work, 'repo');
    mkdirSync(repo);
    run(repo, 'git', ['init', '-q']);
    run(repo, 'git', ['config', 'user.email', 'fixture@example.com']);
    run(repo, 'git', ['config', 'user.name', 'Fixture']);

    const commands = [];
    for (const args of SCENARIO) {
      let r = run(repo, 'node', [cli, ...args]);
      // init before --no-hooks existed (and before hooks did): plain init.
      if (!r.ok && args[0] === 'init') r = run(repo, 'node', [cli, 'init']);
      commands.push({ command: args.join(' '), ok: r.ok });
    }

    const tasks = view(repo, cli, ['task', 'list', '--json', '--limit', '0'], ['task', 'list', '--json']);
    const decisions = view(repo, cli, ['decision', 'list', '--all', '--json'], ['decision', 'list', '--json']);

    const dest = join(OUT, version);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    cpSync(join(repo, '.kadence', 'events'), join(dest, 'events'), { recursive: true });
    writeFileSync(
      join(dest, 'view.json'),
      `${JSON.stringify({ version, commands, tasks, decisions }, null, 2)}\n`,
    );
    const accepted = commands.filter((c) => c.ok).length;
    console.log(`${version}: ${accepted}/${commands.length} commands accepted`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
if (!existsSync(OUT)) process.exit(1);
