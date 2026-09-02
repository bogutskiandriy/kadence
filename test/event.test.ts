import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { validate, serialize, parse, isKnownType, type FlowEvent } from '../src/core/event.js';

const gen = createUlid();
const valid = (over: Partial<FlowEvent> = {}): FlowEvent => ({
  id: gen(),
  type: 'task.moved',
  entity: gen(),
  actor: 'bogun@example.com',
  ts: '2026-09-02T10:00:00.000Z',
  source: 'human',
  ...over,
});

describe('validate', () => {
  it('приймає коректну подію', () => {
    expect(validate(valid())).toEqual([]);
  });

  it('повертає перелік невалідних полів, а не кидає виняток', () => {
    // Зіпсована подія не має ронити команду — критерій приймання M1.
    const bad = validate({ id: 'x', type: 'nope', entity: '', actor: '', ts: 'вчора', source: 'ufo' });
    expect(bad).toEqual(expect.arrayContaining(['id', 'type', 'entity', 'actor', 'ts', 'source']));
  });

  it('не падає на null і на не-об\'єкті', () => {
    expect(validate(null).length).toBeGreaterThan(0);
    expect(validate('рядок').length).toBeGreaterThan(0);
  });

  it('вимагає ULID рівно 26 символів', () => {
    expect(validate(valid({ id: 'ABC' }))).toContain('id');
  });

  it('вимагає, щоб entity був ULID, а не людиночитаним номером', () => {
    // FLOW-42 присвоюється при згортанні й може змінитися після злиття,
    // тому подія посилається на стабільний ULID сутності.
    expect(validate(valid({ entity: 'FLOW-42' }))).toContain('entity');
    expect(validate(valid({ entity: gen() }))).toEqual([]);
  });

  it('приймає лише human або agent як source', () => {
    expect(validate(valid({ source: 'agent' }))).toEqual([]);
    expect(validate(valid({ source: 'bot' as never }))).toContain('source');
  });

  it('вимагає ISO-час', () => {
    expect(validate(valid({ ts: '02.09.2026' }))).toContain('ts');
  });

  it('дозволяє відсутній data, але не data-примітив', () => {
    expect(validate(valid())).toEqual([]);
    expect(validate(valid({ data: { to: 'done' } }))).toEqual([]);
    expect(validate(valid({ data: 42 as never }))).toContain('data');
  });
});

describe('isKnownType', () => {
  it('відрізняє відомий тип від типу з майбутньої версії', () => {
    expect(isKnownType('task.created')).toBe(true);
    expect(isKnownType('task.teleported')).toBe(false);
  });
});

describe('serialize / parse', () => {
  it('серіалізує в один рядок без відступів', () => {
    const line = serialize(valid());
    expect(line).not.toContain('\n');
    expect(JSON.parse(line).type).toBe('task.moved');
  });

  it('повертає подію без втрат', () => {
    const e = valid({ data: { from: 'todo', to: 'doing' } });
    expect(parse(serialize(e)).event).toEqual(e);
  });

  it('на пошкодженому JSON повертає помилку, а не кидає', () => {
    const r = parse('{"id":');
    expect(r.event).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('на валідному JSON з невалідною подією повідомляє, які поля не так', () => {
    const r = parse('{"id":"x","type":"nope"}');
    expect(r.event).toBeNull();
    expect(r.error).toMatch(/id|type/);
  });

  it('подію невідомого типу віддає окремою ознакою, а не помилкою', () => {
    // Падіння тут зробило б оновлення в команді неможливим: перший, хто
    // оновиться, зламав би CLI решті.
    const future = { ...valid(), type: 'task.teleported' };
    const r = parse(JSON.stringify(future));
    expect(r.unknownType).toBe(true);
    expect(r.error).toBeNull();
  });
});
