import { readFileSync, writeFileSync, renameSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { flowitDir, eventsDir, readAll } from './store.js';
import { project, type ProjectState } from './projection.js';

/**
 * Снапшот-кеш поточного стану.
 *
 * Похідний за визначенням: його видалення нічого не змінює (інваріант I6).
 * Існує тому, що читання 10k подій із диска займає 140 мс із 200 доступних,
 * а той самий стан із кешу — 6 мс (ADR-005).
 *
 * НІКОЛИ не є джерелом істини. Якщо доводиться питати «а що як кеш
 * розійшовся з журналом» — відповідь завжди «перебудувати».
 */

const SNAPSHOT_VERSION = 'flowit-snapshot/1';

interface Snapshot {
  version: string;
  /** Найбільший ULID серед подій на момент побудови. */
  lastEventId: string;
  /** Кількість подій. Разом із lastEventId ловить і видалення з середини. */
  eventCount: number;
  state: ProjectState;
}

export function snapshotPath(root: string): string {
  return join(flowitDir(root), 'state.json');
}

export interface LoadResult {
  state: ProjectState;
  fromCache: boolean;
}

/**
 * Повертає стан із кешу або перебудовує його з журналу.
 *
 * Дешева частина — обхід імен файлів: він не читає вміст, тому дізнатися
 * «чи щось змінилося» коштує на порядок менше, ніж прочитати журнал.
 */
export function loadOrBuild(root: string): LoadResult {
  const fingerprint = scanFingerprint(eventsDir(root));
  const cached = readSnapshot(root);

  if (
    cached !== null &&
    cached.version === SNAPSHOT_VERSION &&
    cached.lastEventId === fingerprint.lastEventId &&
    cached.eventCount === fingerprint.count
  ) {
    return { state: cached.state, fromCache: true };
  }

  const read = readAll(root);
  const state = project(read.events);
  writeSnapshot(root, {
    version: SNAPSHOT_VERSION,
    lastEventId: fingerprint.lastEventId,
    eventCount: fingerprint.count,
    state,
  });
  return { state, fromCache: false };
}

interface Fingerprint {
  lastEventId: string;
  count: number;
}

/**
 * Відбиток журналу за іменами файлів.
 *
 * Самого лише найбільшого ULID замало: `git revert` може прибрати подію з
 * середини, і тоді максимум лишиться той самий, а стан зміниться. Тому ще
 * й кількість.
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
    // Пошкоджений або відсутній кеш — не подія, гідна уваги користувача.
    return null;
  }
}

function writeSnapshot(root: string, snapshot: Snapshot): void {
  try {
    mkdirSync(flowitDir(root), { recursive: true });
    const target = snapshotPath(root);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot), 'utf8');
    renameSync(tmp, target);
  } catch {
    // Немає прав на запис — CLI має працювати далі, просто повільніше.
  }
}
