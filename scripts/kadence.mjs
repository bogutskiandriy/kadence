/**
 * Runs kadence on kadence — the build in this working tree, never the one on
 * PATH.
 *
 * The distinction is not pedantry. The global install here was 0.1.5 while the
 * repository was at 0.4.1, so `kadence prime` in this directory ran a version
 * that has no `prime` command; a session hook pointed at the global binary
 * would have failed silently every morning. And dogfooding the published
 * version defeats the purpose: the point of using the product while building it
 * is to meet the bugs before anyone else does. Two were found on the first
 * afternoon — labels shifting under a bulk delete, and a repeated flag crashing
 * `decision add`.
 *
 * Rebuilds when `src/` is newer than `dist/cli.js`, so what you drive is always
 * the code you just changed. That check costs a few milliseconds; forgetting it
 * costs a confusing hour.
 *
 *   node scripts/kadence.mjs prime
 *   node scripts/kadence.mjs ready --json
 */
import { spawnSync } from 'node:child_process';
import { statSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'dist', 'cli.js');

/** The newest mtime under a directory, in milliseconds. */
function newest(dir) {
  let latest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    latest = Math.max(latest, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs);
  }
  return latest;
}

const stale = !existsSync(cli) || newest(join(root, 'src')) > statSync(cli).mtimeMs;

if (stale) {
  const build = spawnSync('node', [join(root, 'scripts', 'build.mjs')], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  // The build announces itself on stdout, and this wrapper is used with
  // `--json`: a build line in front of a JSON response is Probe C's truncation
  // bug in a new costume. It is worth seeing, so it moves to stderr.
  if (build.stdout) process.stderr.write(build.stdout);
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const run = spawnSync('node', [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(run.status ?? 1);
