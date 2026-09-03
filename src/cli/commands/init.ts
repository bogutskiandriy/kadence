import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '../../core/git.js';
import { eventsDir, dataDir } from '../../core/store.js';
import { AGENT_README, upsertAgentsSection } from '../../agent/contract.js';

const GITIGNORE_ENTRY = '.kadence/state.json';

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
        'kadence lives inside a git repository, and there is none here.\n' +
        'Create one and try again:\n  git init',
    };
  }

  const already = existsSync(eventsDir(root));

  mkdirSync(eventsDir(root), { recursive: true });
  ensureGitignore(root);

  // Never overwrite the README: the user may have added their own rules.
  const readme = join(dataDir(root), 'README.md');
  if (!existsSync(readme)) writeFileSync(readme, AGENT_README, 'utf8');

  ensureAgentsFile(root);

  return {
    ok: true,
    alreadyInitialized: already,
    root,
    message: already
      ? 'kadence is already initialised.'
      : 'kadence is ready.\n\n' +
        '  kadence task add "first task"\n' +
        '  kadence board\n\n' +
        'Files were created but not committed — that call is yours.',
  };
}

/** state.json is a derived cache and must never reach git (ADR-005). */
function ensureGitignore(root: string): void {
  const path = join(root, '.gitignore');
  let content = '';
  if (existsSync(path)) content = readFileSync(path, 'utf8');

  if (content.includes(GITIGNORE_ENTRY)) return;

  const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  writeFileSync(path, `${content}${prefix}${GITIGNORE_ENTRY}\n`, 'utf8');
}

/** Extends AGENTS.md without touching what a human wrote. */
function ensureAgentsFile(root: string): void {
  const path = join(root, 'AGENTS.md');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const next = upsertAgentsSection(existing);
  if (next !== existing) writeFileSync(path, next, 'utf8');
}
