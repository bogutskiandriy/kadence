import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '../../core/git.js';
import { eventsDir, dataDir } from '../../core/store.js';
import { AGENT_README, upsertAgentsSection } from '../../agent/contract.js';

const GITIGNORE_ENTRY = '.kadence/state.json';

/**
 * Where agents look for project instructions.
 *
 * AGENTS.md is the cross-tool convention (Codex, Cursor, Copilot, Gemini CLI and
 * ~30 others). Claude Code loads CLAUDE.md and does not read AGENTS.md — so a
 * repository with only the former is invisible to the largest agent audience.
 * The same section goes into both, regenerated on every init, so they cannot
 * drift (ADR-009).
 */
const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'] as const;

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

  // Two files, not one: AGENTS.md is the cross-tool convention, and Claude Code
  // reads CLAUDE.md instead of it (ADR-009).
  for (const name of INSTRUCTION_FILES) ensureInstructionFile(root, name);

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

/** Extends an instruction file without touching what a human wrote. */
function ensureInstructionFile(root: string, name: string): void {
  const path = join(root, name);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const next = upsertAgentsSection(existing);
  if (next !== existing) writeFileSync(path, next, 'utf8');
}
