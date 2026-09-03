import { execFileSync } from 'node:child_process';

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
 * git worktree the latter points at the main repository, and sprintit would
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
