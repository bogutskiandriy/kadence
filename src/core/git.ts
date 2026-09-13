import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

/**
 * Thin wrapper around the git CLI.
 *
 * We never read `.git/` directly — only through git, as the SPEC boundaries
 * require. That costs a few milliseconds but survives format changes.
 */

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Root of the CURRENT working tree, not of the main repository.
 *
 * `--show-toplevel` is deliberate rather than `--git-common-dir`: inside a
 * git worktree the latter points at the main repository, and kadence would
 * write its journal to the wrong place. That exact mistake is an open issue
 * (#558) in Backlog.md.
 */
export function findRepoRoot(cwd: string): string | null {
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  return root === null || root.length === 0 ? null : root;
}

export function getActorEmail(cwd: string): string | null {
  const email = git(cwd, ['config', 'user.email']);
  return email === null || email.length === 0 ? null : email;
}

/**
 * The branch HEAD is on, or null on a detached HEAD.
 *
 * `--abbrev-ref` prints the literal string `HEAD` rather than a sha when HEAD
 * is detached, which is exactly the distinction the caller needs: there is no
 * branch to compare, and a sha would let the command answer a question nobody
 * asked.
 */
export function currentBranch(cwd: string): string | null {
  const name = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (name === null || name.length === 0 || name === 'HEAD') return null;
  return name;
}

/**
 * The branch to compare against when nobody says.
 *
 * `main` if it exists, otherwise whatever this git is configured to create.
 * Guessing is unavoidable here — git has no notion of a trunk — so the guess is
 * cheap to override with `--base`, and wrong guesses fail by name rather than
 * silently returning the whole board.
 */
export function defaultBaseBranch(cwd: string): string {
  if (branchExists(cwd, 'main')) return 'main';
  const configured = git(cwd, ['config', 'init.defaultBranch']);
  if (configured !== null && configured.length > 0) return configured;
  return 'main';
}

export function branchExists(cwd: string, name: string): boolean {
  return git(cwd, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`]) !== null;
}

/**
 * ULIDs of the events a branch introduced, relative to a base.
 *
 * Nothing is stored: membership lives in git's history and is read at the
 * moment it is asked for. Writing a branch name into an event would go stale
 * the moment the branch is renamed or merged, and would make the same events
 * fold differently depending on where they were written (I1).
 *
 * Returns null when the range cannot be resolved — an unknown base, usually —
 * so the caller can say which name was wrong instead of reporting no work.
 */
export function eventIdsOnBranch(cwd: string, base: string, head: string): Set<string> | null {
  const out = git(cwd, [
    'log',
    `${base}..${head}`,
    '--name-only',
    '--pretty=format:',
    '--',
    '.kadence/events',
  ]);
  if (out === null) return null;

  const ids = new Set<string>();
  for (const line of out.split('\n')) {
    const path = line.trim();
    if (path.endsWith('.json')) ids.add(basename(path, '.json'));
  }
  return ids;
}
