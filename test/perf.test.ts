import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlid } from '../src/core/ulid.js';
import { readAll, eventsDir } from '../src/core/store.js';
import { project } from '../src/core/projection.js';
import { loadOrBuild, snapshotPath } from '../src/core/snapshot.js';
import { compact } from '../src/core/store.js';
import { serialize, type FlowEvent } from '../src/core/event.js';

/**
 * Guardrail із ADR-005. Тест навмисно падає при регресії: 200 мс — це не
 * побажання, а межа, за якою CLI перестає бути придатним.
 */
const COLD_BUDGET_MS = 200;
const WARM_BUDGET_MS = 20;
/** Guardrail розміру з PRD: роздування репо — вагома причина відмовитися. */
const SIZE_BUDGET_MB = 5;
const EVENT_COUNT = 10_000;

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'flowit-perf-'));
  const gen = createUlid();
  const taskIds: string[] = [];

  // 500 задач, решта подій — переміщення між станами: пропорція, близька
  // до реального репозиторію, де задачі рухають частіше, ніж створюють.
  for (let i = 0; i < EVENT_COUNT; i++) {
    const isCreate = i < 500;
    const id = gen();
    const entity = isCreate ? id : taskIds[i % taskIds.length]!;
    if (isCreate) taskIds.push(id);

    const e: FlowEvent = {
      id,
      type: isCreate ? 'task.created' : 'task.moved',
      entity,
      actor: 'perf@example.com',
      ts: new Date(1_756_800_000_000 + i * 1000).toISOString(),
      source: 'human',
      data: isCreate ? { title: `Задача ${i}`, estimate: (i % 8) + 1 } : { to: 'in_progress' },
    };

    const dir = join(eventsDir(root), e.ts.slice(0, 7));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${e.id}.json`), serialize(e));
  }
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function measure(fn: () => void): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

describe(`продуктивність на ${EVENT_COUNT} подіях`, () => {
  it('читає й згортає журнал без кешу — базовий вимір', () => {
    const ms = measure(() => {
      const r = readAll(root);
      expect(r.events).toHaveLength(EVENT_COUNT);
      project(r.events);
    });
    // eslint-disable-next-line no-console
    console.log(`  холодне читання без кешу: ${ms.toFixed(0)} мс`);
    expect(ms).toBeLessThan(COLD_BUDGET_MS * 5); // база, не guardrail
  });

  it('холодний старт БЕЗ компакції — найгірший випадок, не guardrail', () => {
    // Документує межу: 10 000 окремих файлів. Архітектура цього сценарію
    // не обіцяла тримати — саме для нього існує компакція.
    rmSync(snapshotPath(root), { force: true });
    const ms = measure(() => loadOrBuild(root));
    // eslint-disable-next-line no-console
    console.log(`  холодний старт без компакції: ${ms.toFixed(0)} мс`);
    expect(ms).toBeLessThan(COLD_BUDGET_MS * 3);
  });

  it(`холодний старт зі скомпактованим архівом вкладається у ${COLD_BUDGET_MS} мс`, () => {
    // Реальний журнал: свіжий місяць окремими файлами, старі — в архіві.
    compact(root, '2026-11');
    rmSync(snapshotPath(root), { force: true });
    const ms = measure(() => {
      const r = loadOrBuild(root);
      expect(r.state.tasks).toHaveLength(500);
    });
    // eslint-disable-next-line no-console
    console.log(`  холодний старт зі стисненим архівом: ${ms.toFixed(0)} мс`);
    expect(ms).toBeLessThan(COLD_BUDGET_MS);
  });

  it(`теплий старт вкладається у ${WARM_BUDGET_MS} мс`, () => {
    loadOrBuild(root); // прогрів — снапшот записано
    const ms = measure(() => loadOrBuild(root));
    // eslint-disable-next-line no-console
    console.log(`  теплий старт: ${ms.toFixed(0)} мс`);
    expect(ms).toBeLessThan(WARM_BUDGET_MS);
  });
});

/** Місце на диску, а не сума розмірів: файлова система бере блок на файл. */
function diskUsageMb(dir: string): number {
  const walk = (p: string): number => {
    let total = 0;
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, e.name);
      total += e.isDirectory() ? walk(full) : statSync(full).blocks * 512;
    }
    return total;
  };
  return walk(dir) / 1_048_576;
}

describe('розмір журналу', () => {
  it(`після компакції вкладається у ${SIZE_BUDGET_MB} МБ на ${EVENT_COUNT} подій`, () => {
    // Власний журнал: інші тести в цьому файлі вже викликали compact, і
    // вимір "до" на спільних даних показував би стан ПІСЛЯ компакції.
    const own = mkdtempSync(join(tmpdir(), 'flowit-size-'));
    const gen = createUlid();
    for (let i = 0; i < EVENT_COUNT; i++) {
      const id = gen();
      const ts = new Date(1_756_800_000_000 + i * 1000).toISOString();
      const dir = join(eventsDir(own), ts.slice(0, 7));
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${id}.json`),
        serialize({ id, type: 'task.created', entity: id, actor: 'p@e.co', ts, source: 'human', data: { title: `Задача ${i}` } }),
      );
    }

    const before = diskUsageMb(eventsDir(own));
    compact(own, '2026-11');
    const after = diskUsageMb(eventsDir(own));
    rmSync(own, { recursive: true, force: true });
    // eslint-disable-next-line no-console
    console.log(`  на диску: ${before.toFixed(1)} МБ → ${after.toFixed(1)} МБ після компакції`);
    expect(after).toBeLessThan(SIZE_BUDGET_MB);
  });
});
