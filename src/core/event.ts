/**
 * Journal event schema.
 *
 * Validation is hand-rolled rather than taken from a library: the shape of an
 * event is fixed in the types at compile time, and the check is needed exactly
 * at the boundary — when reading a file a human or a merge could have
 * corrupted. A general-purpose engine would cost 15% of the startup budget for
 * the same thing (ADR-003).
 */

export const EVENT_TYPES = [
  'task.created',
  'task.moved',
  'task.assigned',
  'task.commented',
  'task.updated',
  'task.cancelled',
  'task.reopened',
  'task.deleted',
  'task.parent_set',
  'task.blocked_by_added',
  'task.blocked_by_removed',
  'task.time_logged',
  'template.saved',
  'template.deleted',
  'board.configured',
  'sprint.created',
  'sprint.started',
  'sprint.updated',
  'sprint.closed',
  'sprint.cancelled',
  'sprint.task_added',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface FlowEvent {
  /** ULID — it also defines event ordering (invariant I2). */
  id: string;
  type: EventType;
  /**
   * ULID of the entity this event refers to.
   *
   * A ULID, not `FLOW-42`: the human-readable number is derived and assigned
   * while folding the journal, so referring to it would mean referring to a
   * value that can change after branches are merged (invariant I7).
   */
  entity: string;
  actor: string;
  /** ISO 8601. Informational: ordering uses id, not ts. */
  ts: string;
  source: 'human' | 'agent';
  data?: Record<string, unknown>;
}

const KNOWN = new Set<string>(EVENT_TYPES);
const ULID_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

// Date.parse is too permissive: it accepts '02.09.2026', which is not ISO
// and reads differently across locales. Check the format explicitly.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export function isKnownType(type: unknown): type is EventType {
  return typeof type === 'string' && KNOWN.has(type);
}

/**
 * Returns the list of invalid fields. Never throws: a corrupted event must not
 * bring down a command — the rest of the journal stays readable.
 */
export function validate(input: unknown): string[] {
  if (typeof input !== 'object' || input === null) return ['event'];
  const e = input as Record<string, unknown>;
  const bad: string[] = [];

  if (typeof e['id'] !== 'string' || !ULID_RE.test(e['id'])) bad.push('id');
  if (!isKnownType(e['type'])) bad.push('type');
  if (typeof e['entity'] !== 'string' || !ULID_RE.test(e['entity'])) bad.push('entity');
  if (typeof e['actor'] !== 'string' || e['actor'].length === 0) bad.push('actor');
  if (typeof e['ts'] !== 'string' || !ISO_RE.test(e['ts']) || Number.isNaN(Date.parse(e['ts']))) {
    bad.push('ts');
  }
  if (e['source'] !== 'human' && e['source'] !== 'agent') bad.push('source');
  if (e['data'] !== undefined && (typeof e['data'] !== 'object' || e['data'] === null)) {
    bad.push('data');
  }
  return bad;
}

/**
 * An event as JSON.
 *
 * One line by default (ADR-002): a seven-field event already reads as a whole
 * in `git diff`.
 *
 * Events carrying a description are the exception. The description lives in
 * the event rather than a separate file, because a file per task would hand us
 * back our competitors' conflicts. But single-line JSON would make `git diff`
 * unreadable when one sentence changes. So those events are written indented,
 * with the description as an array of lines: editing one paragraph shows up as
 * one changed line instead of a rewritten event.
 */
export function serialize(event: FlowEvent): string {
  const description = event.data?.['description'];
  if (typeof description !== 'string' || !description.includes('\n')) {
    return JSON.stringify(event);
  }

  const readable = {
    ...event,
    data: { ...event.data, description: description.split('\n') },
  };
  return JSON.stringify(readable, null, 2);
}

export interface ParseResult {
  event: FlowEvent | null;
  error: string | null;
  /** Event from a newer FlowIt: not an error, just a reason to skip it. */
  unknownType: boolean;
}

export function parse(line: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (err) {
    return { event: null, error: `unreadable JSON: ${(err as Error).message}`, unknownType: false };
  }

  raw = normalizeDescription(raw);
  const bad = validate(raw);

  // The only fault is an unknown type: the event is structurally intact,
  // just from the future.
  if (bad.length === 1 && bad[0] === 'type') {
    return { event: null, error: null, unknownType: true };
  }
  if (bad.length > 0) {
    return { event: null, error: `invalid fields: ${bad.join(', ')}`, unknownType: false };
  }
  return { event: raw as FlowEvent, error: null, unknownType: false };
}

/**
 * A description stored as an array of lines is turned back into a plain string.
 *
 * The on-disk shape exists for a readable `git diff`; the rest of the code
 * works with ordinary text and knows nothing about it.
 */
function normalizeDescription(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;

  const e = raw as Record<string, unknown>;
  const data = e['data'];
  if (typeof data !== 'object' || data === null) return raw;

  const description = (data as Record<string, unknown>)['description'];
  if (!Array.isArray(description)) return raw;

  return {
    ...e,
    data: {
      ...(data as Record<string, unknown>),
      description: description.filter((x) => typeof x === 'string').join('\n'),
    },
  };
}
