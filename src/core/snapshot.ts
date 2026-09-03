import { readFileSync, writeFileSync, renameSync, readdirSync, mkdirSync } from 'node:fs';
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

const SNAPSHOT_VERSION = 'kadence-snapshot/1';

interface Snapshot {
  version: string;
  /** Highest ULID among the events at build time. */
  lastEventId: string;
  /** Event count. Together with lastEventId it also catches mid-journal deletions. */
  eventCount: number;
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
}

/**
 * Returns state from the cache, or rebuilds it from the journal.
 *
 * The cheap part is walking file names: it never reads contents, so answering
 * "did anything change" costs an order of magnitude less than reading the
 * journal itself.
 */
export function loadOrBuild(root: string, currentActor?: string): LoadResult {
  const fingerprint = scanFingerprint(eventsDir(root));
  const cached = readSnapshot(root);

  if (
    cached !== null &&
    cached.version === SNAPSHOT_VERSION &&
    cached.lastEventId === fingerprint.lastEventId &&
    cached.eventCount === fingerprint.count
  ) {
    return { state: cached.state, fromCache: true, incomingEvents: 0 };
  }

  const read = readAll(root);
  const state = project(read.events);

  const incomingEvents =
    cached === null || currentActor === undefined
      ? 0
      : countIncoming(read.events, cached, currentActor);

  writeSnapshot(root, {
    version: SNAPSHOT_VERSION,
    lastEventId: fingerprint.lastEventId,
    eventCount: fingerprint.count,
    state,
  });
  return { state, fromCache: false, incomingEvents };
}

interface Fingerprint {
  lastEventId: string;
  count: number;
}

/**
 * A fingerprint of the journal taken from file names.
 *
 * The highest ULID alone is not enough: `git revert` can remove an event from
 * the middle, leaving the maximum unchanged while the state differs. Hence the
 * count as well.
 */
function scanFingerprint(dir: string): Fingerprint {
  let lastEventId = '';
  let count = 0;

  const walk = (path: string): void => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(join(path, entry.name));
      } else if (entry.name.endsWith('.json')) {
        count++;
        const id = entry.name.slice(0, -5);
        if (id > lastEventId) lastEventId = id;
      }
    }
  };

  walk(dir);
  return { lastEventId, count };
}

function readSnapshot(root: string): Snapshot | null {
  try {
    const raw = JSON.parse(readFileSync(snapshotPath(root), 'utf8')) as unknown;
    if (typeof raw !== 'object' || raw === null) return null;
    const s = raw as Snapshot;
    if (typeof s.version !== 'string' || typeof s.lastEventId !== 'string') return null;
    if (typeof s.eventCount !== 'number' || typeof s.state !== 'object') return null;
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
