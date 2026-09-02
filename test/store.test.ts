import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlid } from '../src/core/ulid.js';
import { append, readAll, eventsDir } from '../src/core/store.js';
import type { FlowEvent } from '../src/core/event.js';

let root: string;
const gen = createUlid();

const ev = (over: Partial<FlowEvent> = {}): FlowEvent => ({
  id: gen(),
  type: 'task.created',
  entity: gen(),
  actor: 'bogun@example.com',
  ts: '2026-09-02T10:00:00.000Z',
  source: 'human',
  ...over,
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'flowit-store-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('append', () => {
  it('створює теку під подію, якої ще немає', () => {
    append(root, ev());
    expect(readAll(root).events).toHaveLength(1);
  });

  it('створює теку заново, якщо вона зникла після перемикання гілки', () => {
    // Git не версіонує порожні директорії, тому events/2026-09/ зникає при
    // checkout на гілку без подій цього місяця. Під час спайку це
    // відтворилося двічі — тому mkdir -p при КОЖНОМУ записі.
    const e1 = ev();
    append(root, e1);
    rmSync(eventsDir(root), { recursive: true, force: true });
    expect(existsSync(eventsDir(root))).toBe(false);

    append(root, ev());
    expect(readAll(root).events).toHaveLength(1);
  });

  it('кладе кожну подію в окремий файл — джерело нуля конфліктів', () => {
    append(root, ev());
    append(root, ev());
    append(root, ev());
    const files = readdirSync(eventsDir(root), { recursive: true }) as string[];
    expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(3);
  });

  it('розкладає події по теках за місяцем', () => {
    append(root, ev({ ts: '2026-09-02T10:00:00.000Z' }));
    expect(readdirSync(eventsDir(root))).toContain('2026-09');
  });

  it('завершує файл переносом рядка — інакше cat склеює події', () => {
    const e = ev();
    append(root, e);
    const path = join(eventsDir(root), '2026-09', `${e.id}.json`);
    expect(readFileSync(path, 'utf8').endsWith('\n')).toBe(true);
  });

  it('не лишає тимчасових файлів після запису', () => {
    append(root, ev());
    const files = readdirSync(eventsDir(root), { recursive: true }) as string[];
    expect(files.some((f) => f.includes('.tmp'))).toBe(false);
  });
});

describe('readAll', () => {
  it('повертає події, впорядковані за id, а не за порядком файлів', () => {
    // Інваріант I1: результат не залежить від порядку обходу файлової системи.
    const a = ev({ id: '01AAAAAAAAAAAAAAAAAAAAAAAA' });
    const b = ev({ id: '01BBBBBBBBBBBBBBBBBBBBBBBB' });
    const c = ev({ id: '01CCCCCCCCCCCCCCCCCCCCCCCC' });
    append(root, c);
    append(root, a);
    append(root, b);
    expect(readAll(root).events.map((e) => e.id)).toEqual([a.id, b.id, c.id]);
  });

  it('на порожньому репозиторії повертає порожній список, а не помилку', () => {
    expect(readAll(root).events).toEqual([]);
  });

  it('пошкоджена подія не ховає решту журналу', () => {
    append(root, ev());
    append(root, ev());
    const dir = join(eventsDir(root), '2026-09');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '01ZZZZZZZZZZZZZZZZZZZZZZZZ.json'), '{"id":');

    const r = readAll(root);
    expect(r.events).toHaveLength(2);
    expect(r.corrupted).toHaveLength(1);
    expect(r.corrupted[0]).toContain('01ZZZ');
  });

  it('пропускає подію новішого формату, не рахуючи її пошкодженою', () => {
    append(root, ev());
    const dir = join(eventsDir(root), '2026-09');
    writeFileSync(
      join(dir, '01YYYYYYYYYYYYYYYYYYYYYYYY.json'),
      JSON.stringify({ ...ev(), type: 'task.teleported' }),
    );
    const r = readAll(root);
    expect(r.events).toHaveLength(1);
    expect(r.corrupted).toHaveLength(0);
    expect(r.unknownTypes).toBe(1);
  });

  it('дедуплікує подію, що потрапила у дві гілки через cherry-pick', () => {
    const e = ev();
    append(root, e);
    const dir = join(eventsDir(root), '2026-09');
    writeFileSync(join(dir, `copy-${e.id}.json`), JSON.stringify(e));
    expect(readAll(root).events).toHaveLength(1);
  });

  it('позначає системне пошкодження, коли биті понад 20% подій', () => {
    for (let i = 0; i < 4; i++) append(root, ev());
    const dir = join(eventsDir(root), '2026-09');
    for (let i = 0; i < 3; i++) {
      writeFileSync(join(dir, `01Q${i}ZZZZZZZZZZZZZZZZZZZZZZ.json`), 'зламано');
    }
    expect(readAll(root).systemicCorruption).toBe(true);
  });

  it('не вважає системним пошкодженням одну биту подію з багатьох', () => {
    for (let i = 0; i < 20; i++) append(root, ev());
    writeFileSync(join(eventsDir(root), '2026-09', '01WZZZZZZZZZZZZZZZZZZZZZZZ.json'), 'x');
    expect(readAll(root).systemicCorruption).toBe(false);
  });
});
