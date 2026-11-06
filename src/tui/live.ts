import { readdirSync, statSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { Task } from '../core/projection.js';

/**
 * Keeping an open board current while other processes write the journal.
 *
 * The board already re-reads the journal on `r` and after its own actions;
 * what it lacked was a reason to do so when an agent in another terminal
 * moved ten tasks to done. This is that reason, and nothing else: the reload
 * itself is still `callbacks.reload()`, the same fold every command runs.
 *
 * Imported by the board alone, so it lives in the board's chunk and a
 * `kadence task add` never starts a watcher (KAD-125).
 */

/** What the status line says when something changed but no task moved. */
export const UPDATED_NOTE = 'Updated from the journal.';

/**
 * A cheap fingerprint of the journal directory.
 *
 * Events are only ever added (append-only), so a month directory changes by
 * gaining files, which moves its mtime and its count. Archives are rewritten
 * by compaction, so their files are stat'ed too. Neither `ts` nor contents are
 * read: this runs every second and must stay at a handful of syscalls.
 */
export function journalSignature(eventsDir: string): string {
  let entries;
  try {
    entries = readdirSync(eventsDir, { withFileTypes: true });
  } catch {
    // No journal yet: git does not version an empty directory.
    return '';
  }
  const parts: string[] = [];
  for (const entry of entries) {
    const full = join(eventsDir, entry.name);
    try {
      if (!entry.isDirectory()) {
        const s = statSync(full);
        parts.push(`${entry.name}:${s.size}:${s.mtimeMs}`);
        continue;
      }
      const files = readdirSync(full);
      const s = statSync(full);
      parts.push(`${entry.name}/:${files.length}:${s.mtimeMs}`);
      if (entry.name === 'archive') {
        for (const f of files) {
          const fs = statSync(join(full, f));
          parts.push(`archive/${f}:${fs.size}:${fs.mtimeMs}`);
        }
      }
    } catch {
      // Removed between readdir and stat — a branch switch mid-read. The next
      // poll sees the settled tree.
      parts.push(`${entry.name}:gone`);
    }
  }
  return parts.sort().join('|');
}

/** How many changes the status line names before it counts the rest. */
const NAMED = 3;

/**
 * What changed between two folds, in one status line: `KAD-12 → done, KAD-30 new`.
 *
 * Tasks are matched by ULID, never by label (I7). Deletions are counted, not
 * named: KAD-N is derived while folding, so after a deletion the old label can
 * belong to a different task.
 */
export function describeChanges(before: Task[], after: Task[]): string {
  const old = new Map(before.map((t) => [t.id, t]));
  const named: string[] = [];
  for (const t of after) {
    const was = old.get(t.id);
    if (was === undefined) named.push(`${t.label} new`);
    else if (was.status !== t.status) named.push(`${t.label} → ${t.status}`);
  }
  const kept = new Set(after.map((t) => t.id));
  const deleted = before.filter((t) => !kept.has(t.id)).length;

  const shown = named.slice(0, NAMED);
  const rest = named.length - shown.length;
  return [
    ...shown,
    ...(rest > 0 ? [`+${rest} more`] : []),
    ...(deleted > 0 ? [`${deleted} deleted`] : []),
  ].join(', ');
}

/** Where a task sits on the board now, by ULID — it may have changed column. */
export function locateTask(
  columns: ReadonlyArray<{ tasks: ReadonlyArray<Task> }>,
  id: string,
): { column: number; row: number } | null {
  for (let column = 0; column < columns.length; column++) {
    const row = columns[column]!.tasks.findIndex((t) => t.id === id);
    if (row !== -1) return { column, row };
  }
  return null;
}

export interface JournalWatcher {
  /**
   * Takes the journal as it is now as already seen.
   *
   * Called before the board reloads after its own action, so the watcher does
   * not reload a second time and announce the board's own move as news. Before
   * the reload, not after: a write that lands in between is then read by the
   * reload and costs at most one redundant refresh, instead of being missed.
   */
  acknowledge: () => void;
  close: () => void;
}

export interface WatchOptions {
  /** `.kadence/events`. */
  dir: string;
  onChange: () => void;
  /** Injected by tests; the real one reads the directory. */
  signature?: () => string;
  /**
   * The safety net. fs.watch misses things — a month directory created after
   * the watch began, a network drive, a platform without recursive watching —
   * so a poll catches whatever it does not, a second late at worst.
   */
  pollMs?: number;
  /** Quiet time before reloading: several agents writing at once is one repaint. */
  debounceMs?: number;
  /** False in tests that drive the poll with fake timers. */
  watch?: boolean;
}

export function watchJournal(opts: WatchOptions): JournalWatcher {
  const signature = opts.signature ?? (() => journalSignature(opts.dir));
  const pollMs = opts.pollMs ?? 1000;
  const debounceMs = opts.debounceMs ?? 150;

  /** The journal as last reported to the board. */
  let last = signature();
  /**
   * The journal as the poll last saw it. Kept apart from `last` so the poll
   * restarts the quiet period only on a new write: comparing against `last`
   * restarted it on every tick while a reload was pending, and it never came.
   */
  let polled = last;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function fire(): void {
    pending = null;
    if (closed) return;
    const now = signature();
    if (now === last) return;
    last = now;
    opts.onChange();
  }

  /** Restarts the quiet period; the reload runs once writing stops. */
  function schedule(): void {
    if (closed) return;
    if (pending !== null) clearTimeout(pending);
    pending = setTimeout(fire, debounceMs);
    pending.unref?.();
  }

  const poll = setInterval(() => {
    const now = signature();
    if (now === polled) return;
    polled = now;
    schedule();
  }, pollMs);
  poll.unref?.();

  let watcher: FSWatcher | null = null;
  if (opts.watch !== false) {
    try {
      // Recursive: events land one level down, in a month directory.
      watcher = watch(opts.dir, { recursive: true, persistent: false }, () => schedule());
      // A watch that fails later (the directory removed by a branch switch)
      // leaves the poll to carry on; it must never take the board down.
      watcher.on('error', () => {
        watcher?.close();
        watcher = null;
      });
    } catch {
      watcher = null;
    }
  }

  return {
    acknowledge() {
      last = signature();
      polled = last;
      if (pending !== null) {
        clearTimeout(pending);
        pending = null;
      }
    },
    close() {
      closed = true;
      clearInterval(poll);
      if (pending !== null) clearTimeout(pending);
      watcher?.close();
    },
  };
}
