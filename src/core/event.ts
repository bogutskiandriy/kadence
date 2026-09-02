/**
 * Схема події журналу.
 *
 * Валідація власна, без бібліотеки: форма події фіксована в типах на етапі
 * компіляції, а перевірка потрібна рівно на межі — коли читаємо файл, який
 * могли зіпсувати людина або merge. Узагальнений рушій коштував би 15%
 * бюджету запуску за те саме (ADR-003).
 */

export const EVENT_TYPES = [
  'task.created',
  'task.moved',
  'task.assigned',
  'task.commented',
  'task.updated',
  'task.cancelled',
  'task.reopened',
  'sprint.created',
  'sprint.started',
  'sprint.closed',
  'sprint.cancelled',
  'sprint.task_added',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface FlowEvent {
  /** ULID — він же визначає порядок подій (інваріант I2). */
  id: string;
  type: EventType;
  /**
   * ULID сутності, якої стосується подія.
   *
   * Саме ULID, а не `FLOW-42`: людиночитаний номер похідний і присвоюється
   * при згортанні журналу, тому посилатися на нього означало б посилатися
   * на значення, яке може змінитися після злиття гілок (інваріант I7).
   */
  entity: string;
  actor: string;
  /** ISO 8601. Довідковий: для порядку використовується id, не ts. */
  ts: string;
  source: 'human' | 'agent';
  data?: Record<string, unknown>;
}

const KNOWN = new Set<string>(EVENT_TYPES);
const ULID_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

// Date.parse надто поблажливий: '02.09.2026' він приймає, хоч це не ISO і
// читається по-різному в різних локалях. Формат перевіряємо явно.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export function isKnownType(type: unknown): type is EventType {
  return typeof type === 'string' && KNOWN.has(type);
}

/**
 * Повертає перелік невалідних полів. Ніколи не кидає: пошкоджена подія не
 * має ронити команду — решта журналу лишається придатною для читання.
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

/** Один об'єкт на рядок, без відступів — ADR-002. */
export function serialize(event: FlowEvent): string {
  return JSON.stringify(event);
}

export interface ParseResult {
  event: FlowEvent | null;
  error: string | null;
  /** Подія з новішої версії FlowIt: не помилка, а привід пропустити. */
  unknownType: boolean;
}

export function parse(line: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (err) {
    return { event: null, error: `нечитаний JSON: ${(err as Error).message}`, unknownType: false };
  }

  const bad = validate(raw);

  // Єдина хиба — невідомий тип: подія структурно ціла, просто з майбутнього.
  if (bad.length === 1 && bad[0] === 'type') {
    return { event: null, error: null, unknownType: true };
  }
  if (bad.length > 0) {
    return { event: null, error: `невалідні поля: ${bad.join(', ')}`, unknownType: false };
  }
  return { event: raw as FlowEvent, error: null, unknownType: false };
}
