import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import type { FlowEvent, EventType } from '../src/core/event.js';

const gen = createUlid();

function ev(type: EventType, entity: string, data: Record<string, unknown> = {}): FlowEvent {
  return {
    id: gen(),
    type,
    entity,
    actor: 'tester@example.com',
    ts: '2026-09-02T10:00:00.000Z',
    source: 'human',
    data,
  };
}

function created(title = 'Задача'): FlowEvent {
  const id = gen();
  return { ...ev('task.created', id, { title }), id, entity: id };
}

/** Дає всі перестановки — для перевірки незалежності від порядку. */
function shuffle<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('project — інваріанти', () => {
  it('I1: той самий набір подій дає той самий стан за будь-якого порядку читання', () => {
    const a = created('Перша');
    const b = created('Друга');
    const events = [a, b, ev('task.moved', a.entity, { to: 'in_progress' }), ev('task.moved', b.entity, { to: 'done' })];

    const reference = JSON.stringify(project(events).tasks);
    for (let seed = 1; seed <= 50; seed++) {
      expect(JSON.stringify(project(shuffle(events, seed)).tasks)).toBe(reference);
    }
  });

  it('I2: порядок визначає id, а не ts', () => {
    const t = created();
    // Пізніша за ULID подія має ts у минулому — годинник машини відставав.
    const first = { ...ev('task.moved', t.entity, { to: 'in_progress' }), ts: '2026-09-02T23:00:00.000Z' };
    const second = { ...ev('task.moved', t.entity, { to: 'done' }), ts: '2026-09-02T01:00:00.000Z' };
    expect(project([t, first, second]).tasks[0]!.status).toBe('done');
  });

  it('I3: задача перебуває рівно в одному стані', () => {
    const t = created();
    const s = project([t, ev('task.moved', t.entity, { to: 'in_progress' }), ev('task.moved', t.entity, { to: 'done' })]);
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0]!.status).toBe('done');
  });

  it('є чистою функцією — не змінює вхідний масив', () => {
    const t = created();
    const events = [t, ev('task.moved', t.entity, { to: 'done' })];
    const copy = JSON.stringify(events);
    project(events);
    expect(JSON.stringify(events)).toBe(copy);
  });
});

describe('project — конкурентні наміри', () => {
  it('дві гілки перевели задачу по-різному: перемагає більший ULID', () => {
    const t = created();
    const branchA = ev('task.moved', t.entity, { to: 'in_progress' });
    const branchB = ev('task.moved', t.entity, { to: 'done' });
    const s = project([t, branchA, branchB]);
    expect(s.tasks[0]!.status).toBe('done');
  });

  it('програна подія лишається в історії задачі', () => {
    const t = created();
    const lost = ev('task.moved', t.entity, { to: 'in_progress' });
    const won = ev('task.moved', t.entity, { to: 'done' });
    const s = project([t, lost, won]);
    expect(s.tasks[0]!.history.map((h) => h.id)).toContain(lost.id);
  });

  it('подія про ще не змерджену задачу тримається в очікуванні, не втрачається', () => {
    const orphan = ev('task.moved', gen(), { to: 'done' });
    const s = project([orphan]);
    expect(s.tasks).toHaveLength(0);
    expect(s.pending).toHaveLength(1);
  });

  it('відкладена подія застосовується, коли задача нарешті прибуває', () => {
    const t = created();
    const move = ev('task.moved', t.entity, { to: 'done' });
    // Гілку зі створенням змерджили пізніше — але id створення менший.
    const s = project([move, t]);
    expect(s.pending).toHaveLength(0);
    expect(s.tasks[0]!.status).toBe('done');
  });
});

describe('project — спринти', () => {
  it('sprint.closed розв\'язується first-write-wins, на відміну від решти', () => {
    // Закриття фіксує факт, який міг бути опублікований. Пізніше закриття
    // з іншої гілки не переписує velocity — інваріант I5.
    const sp = gen();
    const create = { ...ev('sprint.created', sp, { name: 'Спринт 1' }), id: sp, entity: sp };
    const closeA = ev('sprint.closed', sp, { note: 'перше' });
    const closeB = ev('sprint.closed', sp, { note: 'друге' });
    const s = project([create, closeA, closeB]);
    expect(s.sprints[0]!.status).toBe('closed');
    expect(s.sprints[0]!.closedBy).toBe(closeA.id);
  });

  it('подія в закритий спринт відхиляється, але лишається в журналі', () => {
    const sp = gen();
    const create = { ...ev('sprint.created', sp, { name: 'С1' }), id: sp, entity: sp };
    const close = ev('sprint.closed', sp, {});
    const t = created();
    const late = ev('sprint.task_added', sp, { task: t.entity });
    const s = project([create, t, close, late]);
    expect(s.tasks[0]!.sprint).toBeNull();
    expect(s.rejected.map((r) => r.id)).toContain(late.id);
  });

  it('задача, додана у відкритий спринт, до нього належить', () => {
    const sp = gen();
    const create = { ...ev('sprint.created', sp, { name: 'С1' }), id: sp, entity: sp };
    const t = created();
    const s = project([create, t, ev('sprint.task_added', sp, { task: t.entity })]);
    expect(s.tasks[0]!.sprint).toBe(sp);
  });
});

describe('project — нумерація FLOW-N', () => {
  it('присвоює номери за порядком ULID, а не за порядком читання', () => {
    const a = created('Перша');
    const b = created('Друга');
    const s = project([b, a]);
    const first = s.tasks.find((t) => t.id === a.entity)!;
    const second = s.tasks.find((t) => t.id === b.entity)!;
    expect(first.label).toBe('FLOW-1');
    expect(second.label).toBe('FLOW-2');
  });

  it('дві гілки, що створили задачі незалежно, отримують РІЗНІ номери', () => {
    // Саме та колізія, яку Probe A знайшов як CONFLICT (add/add)
    // у реальних репозиторіях на файлових трекерах.
    const fromBranchA = created('З гілки A');
    const fromBranchB = created('З гілки B');
    const labels = project([fromBranchA, fromBranchB]).tasks.map((t) => t.label);
    expect(new Set(labels).size).toBe(2);
  });

  it('номер задачі не змінюється від появи новішої задачі', () => {
    const a = created('Перша');
    const before = project([a]).tasks[0]!.label;
    const after = project([a, created('Друга')]).tasks.find((t) => t.id === a.entity)!.label;
    expect(after).toBe(before);
  });
});
