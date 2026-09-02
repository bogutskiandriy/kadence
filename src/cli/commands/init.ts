import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '../../core/git.js';
import { eventsDir, flowitDir } from '../../core/store.js';
import { AGENT_README, upsertAgentsSection } from '../../agent/contract.js';

const GITIGNORE_ENTRY = '.flowit/state.json';

export interface InitResult {
  ok: boolean;
  message: string;
  alreadyInitialized: boolean;
  root: string | null;
}

export function runInit(cwd: string): InitResult {
  const root = findRepoRoot(cwd);
  if (root === null) {
    return {
      ok: false,
      alreadyInitialized: false,
      root: null,
      message:
        'FlowIt живе всередині git-репозиторію, а тут його немає.\n' +
        'Створіть репозиторій і спробуйте знову:\n  git init',
    };
  }

  const already = existsSync(eventsDir(root));

  mkdirSync(eventsDir(root), { recursive: true });
  ensureGitignore(root);

  // README не перезаписуємо: користувач міг дописати туди свої правила.
  const readme = join(flowitDir(root), 'README.md');
  if (!existsSync(readme)) writeFileSync(readme, AGENT_README, 'utf8');

  ensureAgentsFile(root);

  return {
    ok: true,
    alreadyInitialized: already,
    root,
    message: already
      ? 'FlowIt уже ініціалізовано.'
      : 'FlowIt готовий.\n\n' +
        '  flowit task add "перша задача"\n' +
        '  flowit task list\n\n' +
        'Файли створено, але не закомічено — це ваше рішення.',
  };
}

/** state.json — похідний кеш, він не має потрапляти в git (ADR-005). */
function ensureGitignore(root: string): void {
  const path = join(root, '.gitignore');
  let content = '';
  if (existsSync(path)) content = readFileSync(path, 'utf8');

  if (content.includes(GITIGNORE_ENTRY)) return;

  const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  writeFileSync(path, `${content}${prefix}${GITIGNORE_ENTRY}\n`, 'utf8');
}

/** Доповнює AGENTS.md, не чіпаючи того, що написала людина. */
function ensureAgentsFile(root: string): void {
  const path = join(root, 'AGENTS.md');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const next = upsertAgentsSection(existing);
  if (next !== existing) writeFileSync(path, next, 'utf8');
}
