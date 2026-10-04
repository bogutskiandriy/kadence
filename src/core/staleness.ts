import type { Doc, ProjectState, Task } from './projection.js';
import { TERMINAL_STATUS } from './projection.js';
import { decodeTime } from './ulid.js';

/**
 * A document older than the work it describes (KAD-67).
 *
 * Documentation drifting from the code is one of the strongest pains found in
 * the category (spec-kit #1191, 115 reactions). kadence cannot read the code,
 * but it knows which tasks a document explains, so it can say when one of
 * them reached done after the document was last revised. A document is behind
 * from that moment until a new revision is written.
 *
 * "After" is ULID order, never `ts` (I2): the revision shown is the highest
 * head, and the close is the last move to done. A cancelled task built
 * nothing the document could miss, and a reopened one is not finished, so
 * neither counts. Nothing is stored — this is a reading of events the journal
 * already has, so deleting state.json changes nothing (I6).
 *
 * Not within a day of the revision. The literal rule — any close after the
 * last revision — flagged two documents on this repository's own journal, and
 * both had been written minutes before their task closed: a task that ships a
 * document ends that way. The gap is read from the two ULIDs, so it is the
 * writers' clocks and only a threshold; which came first is still ULID order.
 */
export const STALE_AFTER_MS = 24 * 3_600_000;

export interface StaleDocument {
  doc: Doc;
  /** The linked tasks that closed after the revision shown, in link order. */
  tasks: Task[];
  /** ULID of the latest of those closes; the list is ordered by it. */
  closedBy: string;
}

/** ULID of the event that last moved the task to done, or null if it is not done now. */
export function closedEvent(task: Task): string | null {
  if (task.status !== TERMINAL_STATUS) return null;
  let last: string | null = null;
  for (const h of task.history) {
    if (h.type === 'task.moved' && h.data['to'] === TERMINAL_STATUS && (last === null || h.id > last)) last = h.id;
  }
  return last;
}

/** Whether this task closed a day or more after the document's revision shown. */
export function outran(doc: Doc, task: Task): boolean {
  const closed = closedEvent(task);
  if (closed === null || closed <= doc.revision) return false;
  return decodeTime(closed) - decodeTime(doc.revision) >= STALE_AFTER_MS;
}

/** Every document behind its work, the most recently outrun first. */
export function staleDocuments(state: ProjectState): StaleDocument[] {
  const byId = new Map(state.tasks.map((t) => [t.id, t]));
  const out: StaleDocument[] = [];
  for (const doc of state.documents) {
    const tasks = doc.tasks
      .map((id) => byId.get(id))
      .filter((t): t is Task => t !== undefined && outran(doc, t));
    if (tasks.length === 0) continue;
    const closedBy = tasks.map((t) => closedEvent(t)!).reduce((a, b) => (b > a ? b : a));
    out.push({ doc, tasks, closedBy });
  }
  // Ties cannot happen between different events; the doc id settles the rest
  // so the order never depends on how the files were read (I1).
  return out.sort((a, b) => (a.closedBy === b.closedBy ? a.doc.id.localeCompare(b.doc.id) : a.closedBy > b.closedBy ? -1 : 1));
}
