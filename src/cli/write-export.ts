import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { failure, repoRelative, type CommandResult } from './commands/task.js';

/**
 * Writing an exported file, once, for every command that exports one.
 *
 * The board export and the report exports must fail the same way — a path
 * outside the repository refused before anything is written, a directory at
 * the target reported rather than thrown — or the two would drift into two
 * different ideas of what `--file` means.
 */
export function writeExport(
  root: string,
  file: string | undefined,
  defaultName: string,
  content: string,
  hint: string,
): { path: string; bytes: number } | CommandResult {
  const resolved = repoRelative(root, file ?? defaultName, hint);
  if ('exitCode' in resolved) return resolved;

  // git does not version empty directories, so the parent may not be there.
  mkdirSync(dirname(resolved.full), { recursive: true });
  try {
    writeFileSync(resolved.full, content, 'utf8');
  } catch (err) {
    // A directory at the target throws EISDIR out of the command, past the
    // JSON contract, and the caller gets a libuv message on stderr with no
    // response at all.
    return failure(
      1,
      'conflicting_state',
      `Could not write ${resolved.full}: ${(err as NodeJS.ErrnoException).code ?? 'unknown error'}.`,
      { received: resolved.rel, hint },
    );
  }
  return { path: resolved.full, bytes: Buffer.byteLength(content) };
}
