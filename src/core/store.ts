import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, serialize, type FlowEvent } from './event.js';

/**
 * The on-disk event journal.
 *
 * Synchronous on purpose: the CLI does one thing and exits, there is nothing
 * to block, and async reading measured 42 ms slower (ADR-005).
 */

/** Share of unreadable events above which staying silent is unsafe. */
const SYSTEMIC_CORRUPTION_RATIO = 0.2;

export function dataDir(root: string): string {
  return join(root, '.kadence');
}

export function eventsDir(root: string): string {
  return join(dataDir(root), 'events');
}

/**
 * Compacted events: one file per month.
 *
 * Conflicts are impossible here by construction — nobody writes old events any
 * more, so merging two archives of the same month yields identical content.
 */
export function archiveDir(root: string): string {
  return join(eventsDir(root), 'archive');
}

function monthOf(ts: string): string {
  return ts.slice(0, 7); // YYYY-MM
}

/**
 * Appends an event to the journal.
 *
 * `mkdir -p` runs on every write, and that is not excess caution: git does not
 * version empty directories, so the month folder disappears when you switch to
 * a branch that had no events that month.
 */
export function append(root: string, event: FlowEvent): void {
  const dir = join(eventsDir(root), monthOf(event.ts));
  mkdirSync(dir, { recursive: true });

  const target = join(dir, `${event.id}.json`);
  const tmp = join(dir, `.${event.id}.tmp`);

  // Temp file first, then rename: an interrupted process leaves no
  // half-written event behind.
  //
  // The trailing newline makes `cat`, `grep` and `git diff` treat the event as
  // a proper text line instead of gluing files together.
  writeFileSync(tmp, `${serialize(event)}\n`, 'utf8');
  renameSync(tmp, target);
}

export interface ReadResult {
  events: FlowEvent[];
  /** Paths of events that could not be read. */
  corrupted: string[];
  /** How many events were skipped as written by a newer kadence. */
  unknownTypes: number;
  /** Enough corruption that this is no longer a one-off failure. */
  systemicCorruption: boolean;
}

export function readAll(root: string): ReadResult {
  const base = eventsDir(root);
  const events: FlowEvent[] = [];
  const corrupted: string[] = [];
  const seen = new Set<string>();
  let unknownTypes = 0;

  const archives = listJsonFiles(archiveDir(root));
  const archiveSet = new Set(archives);

  for (const file of listJsonFiles(base)) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      corrupted.push(file);
      continue;
    }

    // An archive holds an array of events, not a single event.
    if (archiveSet.has(file)) {
      let batch: unknown;
      try {
        batch = JSON.parse(text);
      } catch {
        corrupted.push(file);
        continue;
      }
      if (!Array.isArray(batch)) {
        corrupted.push(file);
        continue;
      }
      for (const item of batch) {
        const one = parse(JSON.stringify(item));
        if (one.unknownType) {
          unknownTypes++;
        } else if (one.error !== null || one.event === null) {
          corrupted.push(file);
        } else if (!seen.has(one.event.id)) {
          seen.add(one.event.id);
          events.push(one.event);
        }
      }
      continue;
    }

    const r = parse(text);
    if (r.unknownType) {
      unknownTypes++;
      continue;
    }
    if (r.error !== null || r.event === null) {
      corrupted.push(file);
      continue;
    }
    // A cherry-pick can land the same event on two branches.
    if (seen.has(r.event.id)) continue;
    seen.add(r.event.id);
    events.push(r.event);
  }

  // Ordering by id, not by filesystem traversal — invariant I1.
  events.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const total = events.length + corrupted.length;
  return {
    events,
    corrupted,
    unknownTypes,
    systemicCorruption: total > 0 && corrupted.length / total > SYSTEMIC_CORRUPTION_RATIO,
  };
}

/**
 * `withFileTypes` is deliberate: without it every file costs a separate
 * statSync, and on 10,000 events that is ten thousand syscalls — measured as
 * the main reason the guardrail was exceeded.
 */
function listJsonFiles(dir: string): string[] {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // no folder means an empty journal, not an error
  }

  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsonFiles(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

export interface CompactResult {
  archivedMonths: string[];
  archivedEvents: number;
  /**
   * Archive files that exist but could not be read, by path. The month each
   * one belongs to was left untouched — sources and all — so that a damaged
   * archive costs disk space rather than history.
   */
  skipped: string[];
}

/**
 * Folds events from months older than `keepFromMonth` into one file per month.
 *
 * Without compaction the working copy swells to 39 MB per 10,000 events: the
 * filesystem spends a 4 KB block on a 200-byte event (measured in the spike).
 *
 * Hot months are left alone: that is where concurrent writes happen, and where
 * one file per event is what delivers zero conflicts.
 */
/**
 * One archive file's events, `[]` when there is no such file — and `null` when
 * the file is there and cannot be read.
 *
 * The three cases must stay distinct. An archive is the only copy of every
 * event compacted before it, so a caller that reads "unreadable" as "absent"
 * is one write away from replacing months of history with whatever batch it
 * happens to be holding.
 */
function readArchive(path: string): FlowEvent[] | null {
  if (!existsSync(path)) return [];
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(raw)) return null;
    return raw.map((x) => parse(JSON.stringify(x)).event).filter((e): e is FlowEvent => e !== null);
  } catch {
    return null;
  }
}

export interface CompactionPlan {
  months: Array<{ month: string; events: number }>;
  events: number;
}

/**
 * What `compact` would do, without doing it.
 *
 * Read-only on purpose: the dry run and the summary line both need the answer,
 * and neither may write. Counts parse each file the way the archive would, so
 * a corrupted event that compaction skips is not counted as archived either.
 */
export function compactionPlan(root: string, keepFromMonth: string): CompactionPlan {
  const base = eventsDir(root);
  const months: Array<{ month: string; events: number }> = [];
  let total = 0;

  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return { months: [], events: 0 };
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'archive') continue;
    if (entry.name >= keepFromMonth) continue;
    // Counted against the archive that is already there: re-archiving an
    // event that is in it moves nothing, and saying otherwise would make the
    // dry run and the summary disagree.
    // A month whose archive is unreadable will be skipped, not archived; the
    // plan says so by counting nothing already filed rather than guessing.
    const already = new Set(
      (readArchive(join(archiveDir(root), `${entry.name}.json`)) ?? []).map((e) => e.id),
    );
    let count = 0;
    for (const file of listJsonFiles(join(base, entry.name))) {
      const e = parse(readFileSync(file, 'utf8')).event;
      if (e !== null && !already.has(e.id)) count += 1;
    }
    if (count === 0) continue;
    months.push({ month: entry.name, events: count });
    total += count;
  }

  months.sort((a, b) => (a.month < b.month ? -1 : 1));
  return { months, events: total };
}

export function compact(root: string, keepFromMonth: string): CompactResult {
  const base = eventsDir(root);
  const archived: string[] = [];
  const skipped: string[] = [];
  let count = 0;

  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return { archivedMonths: [], archivedEvents: 0, skipped: [] };
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'archive') continue;
    if (entry.name >= keepFromMonth) continue;

    const monthDir = join(base, entry.name);
    const files = listJsonFiles(monthDir);
    const batch: FlowEvent[] = [];

    for (const file of files) {
      const r = parse(readFileSync(file, 'utf8'));
      if (r.event !== null) batch.push(r.event);
    }
    if (batch.length === 0) continue;

    // An archive for this month may already exist: a branch that compacted
    // earlier, merged, and then delivered more events for the same month —
    // `append` files an event by its own `ts`, so a January event written
    // today lands in a January directory next to an archived January.
    // Overwriting here deleted every event already archived, silently, in a
    // journal whose whole promise is that nothing is ever lost.
    mkdirSync(archiveDir(root), { recursive: true });
    const target = join(archiveDir(root), `${entry.name}.json`);
    const existing = readArchive(target);
    if (existing === null) {
      // Stop before the first write. Overwriting would drop every event the
      // archive already holds, and `rmSync` below would then drop the sources
      // too — two silent losses from one unreadable file.
      skipped.push(target);
      continue;
    }
    const merged = new Map<string, FlowEvent>();
    for (const e of existing) merged.set(e.id, e);
    let added = 0;
    for (const e of batch) {
      if (!merged.has(e.id)) added += 1;
      merged.set(e.id, e);
    }

    const all = [...merged.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    const tmp = `${target}.tmp`;
    // Archive first, delete the sources only after: an interrupted process
    // must never leave the journal without its events.
    writeFileSync(tmp, JSON.stringify(all), 'utf8');
    renameSync(tmp, target);

    rmSync(monthDir, { recursive: true, force: true });
    archived.push(entry.name);
    count += added;
  }

  return { archivedMonths: archived.sort(), archivedEvents: count, skipped: skipped.sort() };
}
