import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '../../core/git.js';
import { eventsDir, dataDir } from '../../core/store.js';
import { agentReadme, upsertAgentsSection } from '../../agent/contract.js';

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

/**
 * @param version stamped into the files we write, so a reader a year later knows
 *   what produced them. Defaults for tests and any caller without a build.
 */
export interface InitOptions {
  /**
   * Write a SessionStart hook into `.claude/settings.json`.
   *
   * Off by default and only ever on by name: that file is the user's, it is
   * committed to their repository, and something else's hooks live in it.
   */
  hooks?: boolean;
}

export function runInit(cwd: string, version = 'dev', options: InitOptions = {}): InitResult {
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
  if (!existsSync(readme)) writeFileSync(readme, agentReadme(version), 'utf8');

  // Two files, not one: AGENTS.md is the cross-tool convention, and Claude Code
  // reads CLAUDE.md instead of it (ADR-009).
  for (const name of INSTRUCTION_FILES) ensureInstructionFile(root, name, version);

  const hookNote = options.hooks === true ? `\n\n${installSessionHook(root)}` : '';
  // A repository already using Claude Code is one flag away from every session
  // starting with prime. Say so once, and only where it applies.
  const hookHint =
    options.hooks !== true && existsSync(join(root, '.claude')) && !hasSessionHook(root)
      ? '\n\nkadence init --hooks adds prime at session start.'
      : '';

  const toCommit = ['.kadence/', 'AGENTS.md', 'CLAUDE.md'];
  if (options.hooks === true && hasSessionHook(root)) toCommit.push('.claude/settings.json');

  return {
    ok: true,
    alreadyInitialized: already,
    root,
    message: already
      ? `kadence is already initialised.${hookNote}${hookHint}`
      : 'kadence is ready.\n\n' +
        '  kadence task add "first task"\n' +
        '  kadence decision add "What we chose" --why "Why we chose it"\n' +
        '  kadence board\n\n' +
        `Commit ${toCommit.join(', ')} so a teammate's agent finds them.\n` +
        'Files were created but not committed — that call is yours.' +
        hookNote +
        hookHint,
  };
}

/**
 * The command the hook runs.
 *
 * POSIX sh, because `.claude/settings.json` is committed and a teammate's
 * machine may not have kadence yet. Without the check a missing binary fails
 * every session start with a shell error; with it the agent is told, in one
 * line, what to ask the human. Never `npx`: that would put the network in the
 * path of every session (DEC-12).
 */
export const HOOK_COMMAND =
  'if command -v kadence >/dev/null 2>&1; then kadence prime; else ' +
  "echo 'kadence is not installed on this machine: ask the human to run npm install -g kadence. The team journal is in .kadence/.'; fi";
/** Commands earlier versions installed. Still ours: replaced in place, never duplicated. */
const OUR_HOOK_COMMANDS: readonly string[] = ['kadence prime', HOOK_COMMAND];
/**
 * `startup` and not the omitted matcher, which would fire on resume, clear,
 * compact and fork as well — four more copies of the same preamble in one
 * session.
 */
const HOOK_MATCHER = 'startup';

interface HookEntry {
  type?: string;
  command?: string;
  timeout?: number;
}
interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
}

/**
 * Adds a SessionStart hook to `.claude/settings.json`, keeping everything else.
 *
 * Upsert, not write: hooks of other events, other matchers and other commands
 * all survive, and running this twice leaves one hook. The format was read from
 * the Claude Code documentation rather than remembered.
 */
function installSessionHook(root: string): string {
  const dir = join(root, '.claude');
  const path = join(dir, 'settings.json');

  let settings: Record<string, unknown> = {};
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8');
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      settings = parsed as Record<string, unknown>;
    } catch {
      // Never rewrite a file we could not read. A settings file that fails to
      // parse is usually mid-edit, and replacing it would lose the edit.
      return `${path} is not valid JSON, so the hook was not added. Fix it and run:\n  kadence init --hooks`;
    }
  }

  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown>;
  const sessionStart = Array.isArray(hooks['SessionStart'])
    ? (hooks['SessionStart'] as HookGroup[])
    : [];

  const ours = sessionStart.flatMap((group) =>
    (Array.isArray(group.hooks) ? group.hooks : []).filter(
      (entry) => typeof entry.command === 'string' && OUR_HOOK_COMMANDS.includes(entry.command),
    ),
  );
  if (ours.some((entry) => entry.command === HOOK_COMMAND)) {
    return `The SessionStart hook is already in ${path}.`;
  }
  if (ours.length > 0) {
    // An older hook of ours: upgrade it where it stands, keeping its neighbours
    // and their order.
    for (const entry of ours) entry.command = HOOK_COMMAND;
    writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    return `Updated the SessionStart hook in ${path}: it now prints an install hint where kadence is missing.`;
  }

  let group = sessionStart.find((g) => g.matcher === HOOK_MATCHER);
  if (group === undefined) {
    group = { matcher: HOOK_MATCHER, hooks: [] };
    sessionStart.push(group);
  }
  if (!Array.isArray(group.hooks)) group.hooks = [];
  group.hooks.push({ type: 'command', command: HOOK_COMMAND, timeout: 60 });

  hooks['SessionStart'] = sessionStart;
  settings['hooks'] = hooks;

  mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return `Added a SessionStart hook to ${path}: every session now starts with \`kadence prime\`.`;
}

/** Whether `.claude/settings.json` already carries a SessionStart hook of ours. Never throws. */
function hasSessionHook(root: string): boolean {
  const path = join(root, '.claude', 'settings.json');
  if (!existsSync(path)) return false;
  try {
    const settings = JSON.parse(readFileSync(path, 'utf8')) as {
      hooks?: { SessionStart?: HookGroup[] };
    } | null;
    const groups = settings?.hooks?.SessionStart;
    if (!Array.isArray(groups)) return false;
    return groups.some(
      (g) =>
        Array.isArray(g?.hooks) &&
        g.hooks.some((e) => typeof e?.command === 'string' && OUR_HOOK_COMMANDS.includes(e.command)),
    );
  } catch {
    return false;
  }
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
function ensureInstructionFile(root: string, name: string, version: string): void {
  const path = join(root, name);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const next = upsertAgentsSection(existing, version);
  if (next !== existing) writeFileSync(path, next, 'utf8');
}
