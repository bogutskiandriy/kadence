#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeSync as require$writeSync } from 'node:fs';
import { publish, realRunner, type Task } from './publish.js';

/**
 * A write that finishes before the process does.
 *
 * `process.stdout.write` is asynchronous on a pipe, and `process.exit` does not
 * wait for it — which is how every `--json` response over 128 KiB came back
 * truncated once already in this project. The payloads here are small today;
 * the fix costs fifteen lines and the bug cost a release.
 */
function writeAll(fd: number, text: string): void {
  const buffer = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < buffer.length) {
    try {
      offset += require$writeSync(fd, buffer, offset, buffer.length - offset);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EAGAIN') continue;
      if (code === 'EPIPE') return;
      throw err;
    }
  }
}

/**
 * `kadence-github publish KAD-1[,KAD-2]`
 *
 * Deliberately small, and deliberately separate. The tasks come from
 * `kadence board --json`, read the way any other consumer would read it —
 * this package does not import kadence, and kadence does not import it
 * (ADR-012).
 */

const USAGE = `kadence-github — publish kadence tasks to GitHub Issues, one way

  kadence-github publish KAD-1
  kadence-github publish KAD-1,KAD-2 --dry-run
  kadence-github publish KAD-1 --repo owner/name

Nothing is ever read back. Editing the issue on GitHub edits the issue, not the
task, and the next publish replaces the body.

Needs \`gh\` on your PATH and logged in. kadence itself makes no network
requests; this package is the only part that does.`;

/** Every task on the board, read from the tracker's own JSON contract. */
function readBoard(): Task[] | null {
  // `--summary` exists for exactly this: the publisher needs no history and no
  // comments, and asking for them on a large board is the cost Probe C measured.
  const r = spawnSync('kadence', ['board', '--json', '--summary'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  try {
    const parsed = JSON.parse(r.stdout) as { columns: Record<string, Task[]> };
    return Object.values(parsed.columns).flat();
  } catch {
    return null;
  }
}

function main(argv: readonly string[]): number {
  const args = [...argv];
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    writeAll(1, `${USAGE}\n`);
    return 0;
  }
  if (args[0] !== 'publish') {
    writeAll(2, `Unknown command "${args[0]}".\n\n${USAGE}\n`);
    return 2;
  }

  const refs = (args[1] ?? '').split(',').map((r) => r.trim()).filter((r) => r.length > 0);
  const dryRun = args.includes('--dry-run');
  const repoAt = args.indexOf('--repo');
  const repoValue = repoAt === -1 ? undefined : args[repoAt + 1];
  if (repoAt !== -1 && (repoValue === undefined || repoValue.startsWith('-'))) {
    // Without this, `--repo` at the end silently publishes wherever `gh`
    // happens to infer, which is not the repository the user named.
    writeAll(2, '--repo needs a value, e.g. --repo owner/name\n');
    return 2;
  }
  const repo = repoValue;
  const json = args.includes('--json');

  const tasks = readBoard();
  if (tasks === null) {
    writeAll(
      2,
      'Could not read the board. Run this inside a kadence repository:\n  kadence board --json\n',
    );
    return 1;
  }

  const result = publish(realRunner, tasks, {
    refs,
    ...(dryRun ? { dryRun: true } : {}),
    ...(repo === undefined ? {} : { repo }),
  });

  if (json) {
    // The partial record survives the failure: a caller told only "it failed"
    // has no way to learn that one issue is already live.
    const payload = result.ok
      ? result.data
      : { ...(result.data ?? {}), schema: 'kadence/v1', ok: false, error: { message: result.message } };
    writeAll(1, `${JSON.stringify(payload)}\n`);
  } else {
    writeAll(result.ok ? 1 : 2, `${result.message}\n`);
  }
  return result.exitCode;
}

process.exit(main(process.argv.slice(2)));
