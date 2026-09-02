import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, serialize, type FlowEvent } from './event.js';

/**
 * Журнал подій на диску.
 *
 * Синхронний навмисно: CLI робить одну справу й завершується, блокувати
 * нема чого, а асинхронне читання виміряно на 42 мс повільніше (ADR-005).
 */

/** Частка нечитаних подій, вище якої мовчати небезпечно. */
const SYSTEMIC_CORRUPTION_RATIO = 0.2;

export function flowitDir(root: string): string {
  return join(root, '.flowit');
}

export function eventsDir(root: string): string {
  return join(flowitDir(root), 'events');
}

/**
 * Скомпактовані події: один файл на місяць.
 *
 * Конфлікти тут неможливі за побудовою — старі події вже ніхто не пише,
 * тому злиття двох архівів того самого місяця дає той самий вміст.
 */
export function archiveDir(root: string): string {
  return join(eventsDir(root), 'archive');
}

function monthOf(ts: string): string {
  return ts.slice(0, 7); // YYYY-MM
}

/**
 * Дописує подію в журнал.
 *
 * `mkdir -p` виконується при кожному записі, і це не зайва обережність: git
 * не версіонує порожні директорії, тому тека місяця зникає при перемиканні
 * на гілку, де подій цього місяця не було.
 */
export function append(root: string, event: FlowEvent): void {
  const dir = join(eventsDir(root), monthOf(event.ts));
  mkdirSync(dir, { recursive: true });

  const target = join(dir, `${event.id}.json`);
  const tmp = join(dir, `.${event.id}.tmp`);

  // Спершу тимчасовий файл, тоді rename: перерваний процес не лишає
  // напівзаписаної події.
  //
  // Завершальний перенос рядка — щоб `cat`, `grep` і `git diff` бачили
  // подію як повноцінний текстовий рядок, а не склеювали файли докупи.
  writeFileSync(tmp, `${serialize(event)}\n`, 'utf8');
  renameSync(tmp, target);
}

export interface ReadResult {
  events: FlowEvent[];
  /** Шляхи до подій, які не вдалося прочитати. */
  corrupted: string[];
  /** Скільки подій пропущено як створені новішою версією FlowIt. */
  unknownTypes: number;
  /** Пошкоджень стільки, що це вже не одиничний збій. */
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

    // Архів — масив подій, а не одна подія.
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
    // Той самий cherry-pick міг занести подію у дві гілки.
    if (seen.has(r.event.id)) continue;
    seen.add(r.event.id);
    events.push(r.event);
  }

  // Порядок за id, а не за обходом файлової системи — інваріант I1.
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
 * `withFileTypes` навмисно: без нього кожен файл коштує окремий statSync, і
 * на 10 000 подій це десять тисяч системних викликів — виміряно як головна
 * частина перевищення guardrail.
 */
function listJsonFiles(dir: string): string[] {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // теки немає — це порожній журнал, а не помилка
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
}

/**
 * Зводить події місяців, старших за `keepFromMonth`, у файл на місяць.
 *
 * Без компакції робоча копія роздувається до 39 МБ на 10 000 подій: файлова
 * система витрачає блок у 4 КБ на подію в 200 байт (виміряно в спайку).
 *
 * Гарячі місяці не чіпаються: саме там ідуть конкурентні записи, і саме
 * там окремий файл на подію дає нуль конфліктів.
 */
export function compact(root: string, keepFromMonth: string): CompactResult {
  const base = eventsDir(root);
  const archived: string[] = [];
  let count = 0;

  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return { archivedMonths: [], archivedEvents: 0 };
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

    batch.sort((a, b) => (a.id < b.id ? -1 : 1));

    // Спершу архів, і лише тоді видалення вихідних: перерваний процес не
    // має права залишити журнал без подій.
    mkdirSync(archiveDir(root), { recursive: true });
    const target = join(archiveDir(root), `${entry.name}.json`);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, JSON.stringify(batch), 'utf8');
    renameSync(tmp, target);

    rmSync(monthDir, { recursive: true, force: true });
    archived.push(entry.name);
    count += batch.length;
  }

  return { archivedMonths: archived.sort(), archivedEvents: count };
}
