import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlid } from '../src/core/ulid.js';
import { append } from '../src/core/store.js';
import { loadOrBuild, snapshotPath } from '../src/core/snapshot.js';
import type { FlowEvent } from '../src/core/event.js';

let root: string;
const gen = createUlid();

function created(title: string): FlowEvent {
  const id = gen();
  return {
    id,
    type: 'task.created',
    entity: id,
    actor: 'tester@example.com',
    ts: '2026-09-02T10:00:00.000Z',
    source: 'human',
    data: { title },
  };
}

function moved(entity: string, to: string): FlowEvent {
  return {
    id: gen(),
    type: 'task.moved',
    entity,
    actor: 'tester@example.com',
    ts: '2026-09-02T11:00:00.000Z',
    source: 'human',
    data: { to },
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'flowit-snap-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('loadOrBuild', () => {
  it('I6: видалення state.json не змінює стан — головна властивість кешу', () => {
    // Якщо цей тест колись впаде, кеш перестав бути похідним і став
    // джерелом істини. Це найдорожчий клас багів у системі.
    const a = created('Перша');
    append(root, a);
    append(root, moved(a.entity, 'done'));

    const withCache = loadOrBuild(root);
    expect(existsSync(snapshotPath(root))).toBe(true);

    rmSync(snapshotPath(root));
    const rebuilt = loadOrBuild(root);

    expect(JSON.stringify(rebuilt.state)).toBe(JSON.stringify(withCache.state));
  });

  it('на порожньому журналі дає порожній стан', () => {
    expect(loadOrBuild(root).state.tasks).toEqual([]);
  });

  it('другий виклик бере стан із кешу', () => {
    append(root, created('Задача'));
    expect(loadOrBuild(root).fromCache).toBe(false);
    expect(loadOrBuild(root).fromCache).toBe(true);
  });

  it('нова подія робить кеш недійсним', () => {
    const a = created('Перша');
    append(root, a);
    loadOrBuild(root);

    append(root, moved(a.entity, 'done'));
    const r = loadOrBuild(root);
    expect(r.fromCache).toBe(false);
    expect(r.state.tasks[0]!.status).toBe('done');
  });

  it('видалена подія робить кеш недійсним — навіть якщо остання лишилась', () => {
    // git revert прибирає подію з середини журналу: максимальний ULID той
    // самий, тому одного лише "останнього id" для інвалідації замало.
    const a = created('Перша');
    const mid = moved(a.entity, 'in_progress');
    const last = moved(a.entity, 'done');
    append(root, a);
    append(root, mid);
    append(root, last);
    loadOrBuild(root);

    rmSync(join(root, '.flowit', 'events', '2026-09', `${mid.id}.json`));
    const r = loadOrBuild(root);
    expect(r.fromCache).toBe(false);
  });

  it('пошкоджений state.json мовчки перебудовується', () => {
    append(root, created('Задача'));
    loadOrBuild(root);
    writeFileSync(snapshotPath(root), 'не json');

    const r = loadOrBuild(root);
    expect(r.fromCache).toBe(false);
    expect(r.state.tasks).toHaveLength(1);
  });

  it('снапшот несумісної версії відкидається', () => {
    append(root, created('Задача'));
    loadOrBuild(root);
    const snap = JSON.parse(readFileSync(snapshotPath(root), 'utf8'));
    snap.version = 'flowit-snapshot/999';
    writeFileSync(snapshotPath(root), JSON.stringify(snap));

    expect(loadOrBuild(root).fromCache).toBe(false);
  });

  it('кеш зберігає номери FLOW-N незмінними', () => {
    append(root, created('Перша'));
    append(root, created('Друга'));
    const cold = loadOrBuild(root).state.tasks.map((t) => t.label);
    const warm = loadOrBuild(root).state.tasks.map((t) => t.label);
    expect(warm).toEqual(cold);
  });
});
