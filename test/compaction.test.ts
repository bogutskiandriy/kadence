import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlid } from '../src/core/ulid.js';
import { append, readAll, compact, archiveDir, eventsDir } from '../src/core/store.js';
import type { FlowEvent } from '../src/core/event.js';

let root: string;
const gen = createUlid();

function at(month: string, title = 'Задача'): FlowEvent {
  const id = gen();
  return {
    id,
    type: 'task.created',
    entity: id,
    actor: 'tester@example.com',
    ts: `${month}-15T10:00:00.000Z`,
    source: 'human',
    data: { title },
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'flowit-compact-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('compact', () => {
  it('зводить події старого місяця в один файл', () => {
    append(root, at('2026-01'));
    append(root, at('2026-01'));
    append(root, at('2026-09'));

    const r = compact(root, '2026-09');
    expect(r.archivedMonths).toEqual(['2026-01']);
    expect(existsSync(join(archiveDir(root), '2026-01.json'))).toBe(true);
  });

  it('не втрачає жодної події', () => {
    for (let i = 0; i < 5; i++) append(root, at('2026-01'));
    append(root, at('2026-09'));

    const before = readAll(root).events.map((e) => e.id).sort();
    compact(root, '2026-09');
    const after = readAll(root).events.map((e) => e.id).sort();

    expect(after).toEqual(before);
  });

  it('видаляє вихідні файли лише після успішного запису архіву', () => {
    append(root, at('2026-01'));
    compact(root, '2026-09');
    expect(existsSync(join(eventsDir(root), '2026-01'))).toBe(false);
    expect(existsSync(join(archiveDir(root), '2026-01.json'))).toBe(true);
  });

  it('не чіпає гарячі місяці — там ще можливі конкурентні записи', () => {
    append(root, at('2026-09'));
    compact(root, '2026-09');
    expect(existsSync(join(eventsDir(root), '2026-09'))).toBe(true);
    // Теки архіву взагалі немає: зайвих директорій не створюємо.
    expect(existsSync(archiveDir(root))).toBe(false);
  });

  it('повторний запуск нічого не ламає', () => {
    append(root, at('2026-01'));
    compact(root, '2026-09');
    const first = readAll(root).events.length;
    compact(root, '2026-09');
    expect(readAll(root).events.length).toBe(first);
  });

  it('архів зберігає події масивом — один файл замість тисяч', () => {
    for (let i = 0; i < 3; i++) append(root, at('2026-02'));
    compact(root, '2026-09');
    const raw = JSON.parse(readFileSync(join(archiveDir(root), '2026-02.json'), 'utf8'));
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).toHaveLength(3);
  });

  it('події з архіву читаються нарівні зі свіжими', () => {
    const old = at('2026-01', 'Стара');
    append(root, old);
    append(root, at('2026-09', 'Свіжа'));
    compact(root, '2026-09');

    const events = readAll(root).events;
    expect(events).toHaveLength(2);
    expect(events.some((e) => e.id === old.id)).toBe(true);
  });

  it('пошкоджений архів не ховає решту журналу', () => {
    append(root, at('2026-01'));
    append(root, at('2026-09'));
    compact(root, '2026-09');
    require('node:fs').writeFileSync(join(archiveDir(root), '2026-01.json'), '[{');

    const r = readAll(root);
    expect(r.events).toHaveLength(1);
    expect(r.corrupted).toHaveLength(1);
  });
});
