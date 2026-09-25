import { readFileSync, writeFileSync, renameSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, eventsDir, readAll } from './store.js';
import { project, type ProjectState } from './projection.js';

/**
 * Snapshot cache of the current state.
 *
 * Derived by definition: deleting it changes nothing (invariant I6). It exists
 * because reading 10k events from disk takes 140 ms out of the 200 available,
 * while the same state from cache takes 6 ms (ADR-005).
 *
 * NEVER a source of truth. Whenever the question "what if the cache drifted
 * from the journal" comes up, the answer is always "rebuild it".
 */

/**
 * Bumped whenever a projected record gains or loses a field.
 *
 * The cache is derived and safe to delete (I6) — but keeping a stale one is not
 * safe, because it serves a shape folded by an older version of the code. After
 * `Decision` gained `source`, existing caches kept returning decisions without
 * it, and every consumer branching on that field saw undefined.
 *
 * `test/snapshot.test.ts` pins this constant to the field lists, so changing a
 * shape without bumping it fails the build.
 */
export const SNAPSHOT_VERSION = 'kadence-snapshot/12';

/**
 * What the journal was found to be worth reporting, at build time.
 *
 * It lives here because it is the only reason `loadState` used to read the
 * journal a second time: the state came from this cache, and then every command
 * re-read all 10k files to count two numbers for a warning (KAD-45).
 *
 * Caching it is sound for the same reason caching the state is: it is derived
 * from exactly the files the fingerprint covers, so whatever invalidates one
 * invalidates the other. They are written together and served together, and
 * the answer to any doubt about either is the same — delete it (I6).
 */
export interface JournalHealth {
  /** Events that could not be parsed. */
  corrupted: number;
  /** Corrupted plus readable, so the message can give a ratio. */
  total: number;
  /** Events from a newer kadence. Not damage — a reason to update. */
  unknownTypes: number;
  /** Corruption wide enough that the journal itself is suspect, not one file. */
  systemic: boolean;
}

interface Snapshot {
  version: string;
  /** Highest ULID among the events at build time. */
  lastEventId: string;
  /** Event count. Together with lastEventId it also catches mid-journal deletions. */
  eventCount: number;
  /** Total bytes across every event file, so content changes invalidate too. */
  eventBytes: number;
  health: JournalHealth;
  state: ProjectState;
}

export function snapshotPath(root: string): string {
  return join(dataDir(root), 'state.json');
}

export interface LoadResult {
  state: ProjectState;
  fromCache: boolean;
  /**
   * How many events by other people appeared since the previous read.
   *
   * The first attempt counted events "from the past" — with a ULID lower than
   * the one already seen. That heuristic was wrong: after a merge, events from
   * other branches carry a HIGHER ULID if they were created later than ours.
   * The reliable signal is authorship: an event absent at the last read and
   * written by someone other than the current user came from outside.
   */
  incomingEvents: number;
  /** What the journal was found to be. Served from the cache on a warm read. */
  health: JournalHealth;
}

/**
 * Returns state from the cache, or rebuilds it from the journal.
 *
 * The cheap part is walking the directory: names, count and sizes, never
 * contents. Answering "did anything change" that way costs 5 ms warm at 10k
 * events, against 200 for reading the journal itself.
 */
export function loadOrBuild(root: string, currentActor?: string): LoadResult {
  const fingerprint = scanFingerprint(eventsDir(root));
  const cached = readSnapshot(root);

  if (
    cached !== null &&
    cached.version === SNAPSHOT_VERSION &&
    cached.lastEventId === fingerprint.lastEventId &&
    cached.eventCount === fingerprint.count &&
    cached.eventBytes === fingerprint.bytes
  ) {
    return { state: cached.state, fromCache: true, incomingEvents: 0, health: cached.health };
  }

  const read = readAll(root);
  const state = project(read.events);
  const health: JournalHealth = {
    corrupted: read.corrupted.length,
    total: read.corrupted.length + read.events.length,
    unknownTypes: read.unknownTypes,
    systemic: read.systemicCorruption,
  };

  const incomingEvents =
    cached === null || currentActor === undefined
      ? 0
      : countIncoming(read.events, cached, currentActor);

  // A damaged journal is not cached.
  //
  // The size in the fingerprint already catches the ordinary repair, because
  // restoring a truncated or overwritten file changes its length. It does not
  // catch a repair that lands on the same number of bytes, and a corrupted file
  // is precisely the file someone is about to edit — the warning tells them to.
  // Reporting damage that is already fixed is worse than being slow, so a
  // damaged journal pays a full read until it stops being damaged.
  if (health.corrupted === 0) {
    writeSnapshot(root, {
      version: SNAPSHOT_VERSION,
      lastEventId: fingerprint.lastEventId,
      eventCount: fingerprint.count,
      eventBytes: fingerprint.bytes,
      health,
      state,
    });
  }
  return { state, fromCache: false, incomingEvents, health };
}

interface Fingerprint {
  lastEventId: string;
  count: number;
  /**
   * Total bytes across every event file.
   *
   * Names alone answer "was anything added or removed", which is all an
   * append-only journal of immutable files should ever need. It is not all that
   * happens to files: a truncated write, a damaged disk, or the `git checkout
   * .kadence/` that the corruption warning itself tells you to run all change
   * content while leaving every name in place. Without this, that remedy does
   * not invalidate the cache, so the command that told you to run it keeps
   * serving the state from before you did.
   *
   * It costs one `statSync` per file. ADR-005 declined that on the cost of a
   * cold walk — 11 ms of names against 34 with sizes, on files just written.
   * Warm, which is every call that matters, the inodes are already in the
   * operating system's cache and the whole scan is 5 ms at 10k events. The
   * measurement that rejected this was of the wrong run.
   */
  bytes: number;
}

/**
 * A fingerprint of the journal, taken without opening a file.
 *
 * The highest ULID alone is not enough: `git revert` can remove an event from
 * the middle, leaving the maximum unchanged while the state differs. Hence the
 * count as well — and the byte total, for the changes that leave both alone.
 */
function scanFingerprint(dir: string): Fingerprint {
  let lastEventId = '';
  let count = 0;
  let bytes = 0;

  const walk = (path: string): void => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.json')) {
        count++;
        const id = entry.name.slice(0, -5);
        if (id > lastEventId) lastEventId = id;
        // A file that vanished between the listing and the stat is a file that
        // is not there: no throw, and the count below will not match either.
        bytes += statSync(full, { throwIfNoEntry: false })?.size ?? 0;
      }
    }
  };

  walk(dir);
  return { lastEventId, count, bytes };
}

function readSnapshot(root: string): Snapshot | null {
  try {
    const raw = JSON.parse(readFileSync(snapshotPath(root), 'utf8')) as unknown;
    if (typeof raw !== 'object' || raw === null) return null;
    const s = raw as Snapshot;
    if (typeof s.version !== 'string' || typeof s.lastEventId !== 'string') return null;
    if (typeof s.eventCount !== 'number' || typeof s.state !== 'object') return null;
    // A cache written before health was recorded is not wrong, just short of
    // what the caller now needs. Treated as missing, and rebuilt.
    const h = s.health as Partial<JournalHealth> | undefined;
    if (
      h === undefined ||
      typeof h.corrupted !== 'number' ||
      typeof h.total !== 'number' ||
      typeof h.unknownTypes !== 'number' ||
      typeof h.systemic !== 'boolean'
    ) {
      return null;
    }
    return s;
  } catch {
    // A corrupt or missing cache is not worth the user's attention.
    return null;
  }
}

function writeSnapshot(root: string, snapshot: Snapshot): void {
  try {
    mkdirSync(dataDir(root), { recursive: true });
    const target = snapshotPath(root);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot), 'utf8');
    renameSync(tmp, target);
  } catch {
    // No write permission — the CLI must keep working, just slower.
  }
}

/**
 * Events by other people that appeared since the previous snapshot.
 *
 * New ones are those above the previous boundary, plus the growth below it
 * (events that arrived with a merge and landed in the middle).
 */
function countIncoming(
  events: readonly { id: string; actor: string }[],
  cached: { lastEventId: string; eventCount: number },
  currentActor: string,
): number {
  let upToBoundary = 0;
  let newerForeign = 0;

  for (const e of events) {
    if (e.id <= cached.lastEventId) {
      upToBoundary++;
    } else if (e.actor !== currentActor) {
      newerForeign++;
    }
  }

  const arrivedInMiddle = Math.max(0, upToBoundary - cached.eventCount);
  return newerForeign + arrivedInMiddle;
}
