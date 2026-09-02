import { execFileSync } from 'node:child_process';

/**
 * Тонка обгортка над git CLI.
 *
 * У `.git/` не заглядаємо напряму — тільки через git, як записано в межах
 * SPEC. Це дорожче на кілька мілісекунд, але переживає зміни формату.
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
 * Корінь ПОТОЧНОГО робочого дерева, не головного репозиторію.
 *
 * `--show-toplevel` навмисно замість `--git-common-dir`: у git worktree
 * друге вказало б на головний репозиторій, і FlowIt писав би журнал не туди.
 * Саме ця помилка живе відкритою issue #558 у Backlog.md.
 */
export function findRepoRoot(cwd: string): string | null {
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  return root === null || root.length === 0 ? null : root;
}

export function getActorEmail(cwd: string): string | null {
  const email = git(cwd, ['config', 'user.email']);
  return email === null || email.length === 0 ? null : email;
}

export function currentBranch(cwd: string): string | null {
  const b = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return b === null || b.length === 0 ? null : b;
}
