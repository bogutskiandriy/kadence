import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Opening $EDITOR for long text.
 *
 * A multi-line description does not fit a command-line flag, and `git commit`
 * has already taught everyone what to expect here: an editor opens, you write,
 * you save, an empty buffer means "never mind".
 */

/** Lines starting with this are stripped, exactly as git does. */
const COMMENT_PREFIX = '#';

export interface EditorResult {
  /** null means the user aborted — an empty buffer or a failed editor. */
  text: string | null;
  error: string | null;
}

function resolveEditor(env: NodeJS.ProcessEnv): string {
  // GIT_EDITOR first: someone who configured it for git meant it for this too.
  return env['GIT_EDITOR'] ?? env['VISUAL'] ?? env['EDITOR'] ?? 'vi';
}

/**
 * Opens an editor pre-filled with `initial` plus a commented hint.
 *
 * The hint explains the abort rule, because a silent empty buffer that quietly
 * cancels the command is the kind of behaviour people discover by losing work.
 */
export function editText(
  env: NodeJS.ProcessEnv,
  initial: string,
  hint: string,
): EditorResult {
  const dir = mkdtempSync(join(tmpdir(), 'kadence-edit-'));
  const file = join(dir, 'KADENCE_EDITMSG.md');

  const header = [
    '',
    `${COMMENT_PREFIX} ${hint}`,
    `${COMMENT_PREFIX} Lines starting with '${COMMENT_PREFIX}' are ignored.`,
    `${COMMENT_PREFIX} Save an empty file to abort.`,
  ].join('\n');

  try {
    writeFileSync(file, `${initial}${header}\n`, 'utf8');

    const editor = resolveEditor(env);
    // stdio inherit: the editor takes over the terminal, as it must.
    const r = spawnSync(editor, [file], { stdio: 'inherit', shell: true });

    if (r.error !== undefined || (r.status !== null && r.status !== 0)) {
      return {
        text: null,
        error: `Editor "${editor}" exited without saving.\nSet one explicitly:\n  export EDITOR=nano`,
      };
    }

    const raw = readFileSync(file, 'utf8');
    const body = raw
      .split('\n')
      .filter((line) => !line.startsWith(COMMENT_PREFIX))
      .join('\n')
      .trim();

    return { text: body.length === 0 ? null : body, error: null };
  } catch (err) {
    return { text: null, error: `Could not open an editor: ${(err as Error).message}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** True when there is no terminal to hand over to an editor. */
export function canUseEditor(env: NodeJS.ProcessEnv, isTty: boolean): boolean {
  // An agent piping --json has no terminal; opening vi there would hang forever.
  if (env['KADENCE_SOURCE'] === 'agent') return false;
  return isTty;
}
