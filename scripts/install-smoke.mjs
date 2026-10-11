#!/usr/bin/env node
/**
 * Installs the packed tarball with one package manager and drives the binary
 * the way a person would — the G4 gate (DOC-32): "it installs everywhere it
 * claims to".
 *
 *   node scripts/install-smoke.mjs <npm|pnpm|yarn|bun|bun-runtime> <kadence-x.y.z.tgz>
 *   node scripts/install-smoke.mjs <npx|pnpm-dlx|bunx> <kadence-x.y.z.tgz>
 *
 * The second form is the first thing a person tries: run it without
 * installing anything. No install step runs, and the project must still have
 * no node_modules at the end — otherwise the run proved the install path again.
 *
 * The test suite runs `dist/cli.js` from the working tree; nothing in it
 * proves the published shape — the `files` list, the bin shim each manager
 * writes, a Windows `.cmd` wrapper, a runtime other than Node. That is what
 * this checks, in a throwaway project that is also a git repository, so
 * `init` has somewhere to write.
 *
 * Plain Node and no shell syntax, so the same script runs on Windows. It
 * needs the registry once, for the one dependency (blessed); kadence itself
 * makes no network call, and nothing here changes that.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const [manager, tarballArg] = process.argv.slice(2);
const MANAGERS = ['npm', 'pnpm', 'yarn', 'bun', 'bun-runtime', 'npx', 'pnpm-dlx', 'bunx'];
if (!MANAGERS.includes(manager ?? '') || tarballArg === undefined) {
  console.error(`usage: install-smoke.mjs <${MANAGERS.join('|')}> <tarball>`);
  process.exit(2);
}

// A directory is accepted too, so CI can pass `npm pack --pack-destination`'s
// folder without knowing the version in the file name.
let tarball = resolve(tarballArg);
if (existsSync(tarball) && statSync(tarball).isDirectory()) {
  const packed = readdirSync(tarball).filter((f) => /^kadence-.*\.tgz$/.test(f));
  if (packed.length !== 1) {
    console.error(`expected one kadence-*.tgz in ${tarball}, found ${packed.length}`);
    process.exit(2);
  }
  tarball = join(tarball, packed[0]);
}
const version = readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8').match(/"version":\s*"([^"]+)"/)[1];
const windows = process.platform === 'win32';
const dir = mkdtempSync(join(tmpdir(), `kadence-smoke-${manager}-`));

/**
 * With `shell` on Windows, Node joins the arguments with spaces and quotes
 * nothing, so "Smoke test the install" arrived as four arguments — the first
 * Windows run failed exactly the three checks whose arguments had spaces.
 */
const quote = (arg) => (/[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);

/**
 * Without an install there is no shim in the project to check, and npx falls
 * back to any `kadence` on PATH when the package brings no bin — a tarball
 * with dist/cli.js removed passed every check here, answered by a global
 * install of the same version. So the run-without-installing modes get a PATH
 * with every directory that holds a `kadence` taken out. A hosted runner has
 * none; a developer's machine usually does.
 */
const dlx = ['npx', 'pnpm-dlx', 'bunx'].includes(manager);
const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
const holdsKadence = (d) => ['kadence', 'kadence.cmd', 'kadence.exe'].some((n) => existsSync(join(d, n)));
const shadowing = (process.env[pathKey] ?? '').split(delimiter).filter((d) => d !== '' && holdsKadence(d));
const childPath = (process.env[pathKey] ?? '')
  .split(delimiter)
  .filter((d) => !(dlx && shadowing.includes(d)))
  .join(delimiter);

/** Runs a command in the project; `shell` on Windows so `.cmd` shims resolve. */
function run(cmd, args, input) {
  const r = spawnSync(cmd, windows ? args.map(quote) : args, {
    cwd: dir,
    input,
    encoding: 'utf8',
    shell: windows,
    env: { ...process.env, [pathKey]: childPath, KADENCE_SOURCE: 'agent', NO_COLOR: '1' },
  });
  return { code: r.status, out: r.stdout ?? '', err: (r.stderr ?? '') + (r.error ? String(r.error) : '') };
}

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${manager}: ${name}${ok ? '' : `\n     ${detail.trim().split('\n').slice(0, 6).join('\n     ')}`}`);
  if (!ok) failed++;
}

/** How each manager installs a local tarball, and how it runs the installed bin. */
const how = {
  npm: { install: ['npm', ['install', tarball, '--no-audit', '--no-fund', '--ignore-scripts']], exec: ['npx', ['--no-install', 'kadence']] },
  pnpm: { install: ['pnpm', ['add', tarball, '--ignore-scripts']], exec: ['pnpm', ['exec', 'kadence']] },
  yarn: { install: ['yarn', ['add', `file:${tarball}`, '--ignore-scripts', '--silent']], exec: ['yarn', ['--silent', 'kadence']] },
  bun: { install: ['bun', ['add', tarball, '--ignore-scripts']], exec: ['bunx', ['kadence']] },
  // The one path where something other than Node executes the code.
  'bun-runtime': { install: ['bun', ['add', tarball, '--ignore-scripts']], exec: ['bunx', ['--bun', 'kadence']] },
  // Run without installing: each fetches the tarball into its own cache.
  npx: { install: null, exec: ['npx', ['--yes', `--package=${tarball}`, 'kadence']] },
  'pnpm-dlx': { install: null, exec: ['pnpm', [`--package=${tarball}`, 'dlx', 'kadence']] },
  bunx: { install: null, exec: ['bunx', [`--package=${tarball}`, 'kadence']] },
}[manager];

const kadence = (...args) => run(how.exec[0], [...how.exec[1], ...args]);
const json = (r) => {
  try {
    return JSON.parse(r.out);
  } catch {
    return { unparsed: true, out: r.out.slice(0, 300), err: r.err.slice(0, 300) };
  }
};
/** What to print when a JSON check fails: the answer, or why there was none. */
const why = (v) => JSON.stringify(v).slice(0, 400);

try {
  check('the tarball exists', existsSync(tarball), tarball);
  if (dlx && shadowing.length > 0) {
    // Said, not hidden: a check that a global install could answer for.
    console.log(`     (a kadence on PATH in ${shadowing.join(', ')} is left out of this run)`);
    const found = run(how.exec[0], ['--version']);
    check(`${how.exec[0]} is still reachable without those directories`, found.code === 0, found.err || found.out);
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'smoke', private: true, version: '0.0.0' }));
  run('git', ['init', '-q']);
  run('git', ['config', 'user.email', 'smoke@example.com']);
  run('git', ['config', 'user.name', 'Smoke']);

  if (how.install !== null) {
    const installed = run(...how.install);
    check('installs', installed.code === 0, installed.err || installed.out);

    // npx, pnpm exec and bunx fall back to whatever `kadence` is on PATH when
    // the package did not install a bin — found by running this on a tarball
    // with dist/cli.js removed: a global 0.7.0 answered instead and most checks
    // passed. The shim has to be in this project, or nothing below means much.
    const bin = join(dir, 'node_modules', '.bin');
    const shim = ['kadence', 'kadence.cmd', 'kadence.exe', 'kadence.bunx'].some((n) => existsSync(join(bin, n)));
    const entry = existsSync(join(dir, 'node_modules', 'kadence', 'dist', 'cli.js'));
    check('the bin is installed in the project', shim && entry, `shim: ${shim}, dist/cli.js: ${entry}`);
  }

  const v = kadence('--version');
  check(`--version names ${version}`, v.code === 0 && v.out.includes(version), v.err || v.out);

  const schema = json(kadence('schema', '--json'));
  check('schema --json is the kadence/v1 contract', schema?.schema === 'kadence/v1' && Array.isArray(schema?.contract?.commands), why(schema));

  const init = kadence('init', '--no-hooks');
  check('init writes .kadence/', init.code === 0 && existsSync(join(dir, '.kadence')), init.err || init.out);

  const added = json(kadence('task', 'add', 'Smoke test the install', '--json'));
  check('task add answers in JSON', added?.ok === true && typeof added?.task?.id === 'string', why(added));

  const listed = json(kadence('task', 'list', '--json'));
  check('task list reads it back', listed?.tasks?.some((t) => t.title === 'Smoke test the install') === true, why(listed));

  const found = json(kadence('search', 'smoke install', '--json'));
  check('search finds it', (found?.hits?.length ?? 0) > 0, why(found));

  const prime = kadence('prime');
  check('prime runs', prime.code === 0 && prime.out.includes('Go deeper'), prime.err || prime.out);

  // Exit 2 from this hook would erase a person's prompt; it must never fail.
  const hook = kadence('hook', 'prompt');
  const hooked = run(how.exec[0], [...how.exec[1], 'hook', 'prompt'], JSON.stringify({ prompt: 'smoke install', session_id: 'smoke' }));
  check('hook prompt exits 0', hook.code === 0 && hooked.code === 0, hooked.err);

  if (how.install === null) {
    check('nothing was installed into the project', !existsSync(join(dir, 'node_modules')), readdirSync(dir).join(', '));
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`${failed} check(s) failed for ${manager}`);
  process.exit(1);
}
console.log(`${manager}: kadence ${version} ${how.install === null ? 'runs without installing' : 'installs and runs'}`);
