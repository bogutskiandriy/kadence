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
  it('accepts a valid event', () => {
    expect(validate(valid())).toEqual([]);
  });

  it('returns the list of invalid fields instead of throwing', () => {
    // A corrupted event must not bring down a command — M1 acceptance criterion.
    const bad = validate({ id: 'x', type: 'nope', entity: '', actor: '', ts: 'yesterday', source: 'ufo' });
    expect(bad).toEqual(expect.arrayContaining(['id', 'type', 'entity', 'actor', 'ts', 'source']));
  });

  it('survives null and non-object input', () => {
    expect(validate(null).length).toBeGreaterThan(0);
    expect(validate('string').length).toBeGreaterThan(0);
  });

  it('requires a ULID of exactly 26 characters', () => {
    expect(validate(valid({ id: 'ABC' }))).toContain('id');
  });

  it('requires entity to be a ULID, not a human-readable number', () => {
    // FLOW-42 is assigned while folding and can change after a merge, so the
    // event refers to the entity's stable ULID.
    expect(validate(valid({ entity: 'FLOW-42' }))).toContain('entity');
    expect(validate(valid({ entity: gen() }))).toEqual([]);
  });

  it('accepts only human or agent as source', () => {
    expect(validate(valid({ source: 'agent' }))).toEqual([]);
    expect(validate(valid({ source: 'bot' as never }))).toContain('source');
  });

  it('requires an ISO timestamp', () => {
    expect(validate(valid({ ts: '02.09.2026' }))).toContain('ts');
  });

  it('allows a missing data field but not a primitive one', () => {
    expect(validate(valid())).toEqual([]);
    expect(validate(valid({ data: { to: 'done' } }))).toEqual([]);
    expect(validate(valid({ data: 42 as never }))).toContain('data');
  });
});

describe('isKnownType', () => {
  it('tells a known type from one written by a newer version', () => {
    expect(isKnownType('task.created')).toBe(true);
    expect(isKnownType('task.teleported')).toBe(false);
  });
});

describe('serialize / parse', () => {
  it('serialises to a single line without indentation', () => {
    const line = serialize(valid());
    expect(line).not.toContain('\n');
    expect(JSON.parse(line).type).toBe('task.moved');
  });

  it('round-trips an event without loss', () => {
    const e = valid({ data: { from: 'todo', to: 'doing' } });
    expect(parse(serialize(e)).event).toEqual(e);
  });

  it('returns an error on damaged JSON instead of throwing', () => {
    const r = parse('{"id":');
    expect(r.event).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('names the offending fields when valid JSON holds an invalid event', () => {
    const r = parse('{"id":"x","type":"nope"}');
    expect(r.event).toBeNull();
    expect(r.error).toMatch(/id|type/);
  });

  it('flags an unknown event type separately rather than as an error', () => {
    // Throwing here would make team upgrades impossible: whoever updates first
    // would break the CLI for everyone else.
    const future = { ...valid(), type: 'task.teleported' };
    const r = parse(JSON.stringify(future));
    expect(r.unknownType).toBe(true);
    expect(r.error).toBeNull();
  });
});

describe('description readability in git diff', () => {
  const multiline = 'First paragraph.\n\nSecond paragraph with details.';

  it('an event without a description stays on one line', () => {
    expect(serialize(valid()).split('\n')).toHaveLength(1);
  });

  it('a single-line description does not expand the event', () => {
    expect(serialize(valid({ data: { description: 'Short' } })).split('\n')).toHaveLength(1);
  });

  it('a multi-line description is stored as an array of lines', () => {
    // This way git diff shows a one-paragraph edit as a one-line change instead
    // of a rewritten event.
    const text = serialize(valid({ data: { description: multiline } }));
    const raw = JSON.parse(text) as { data: { description: string[] } };
    expect(Array.isArray(raw.data.description)).toBe(true);
    expect(raw.data.description).toEqual(['First paragraph.', '', 'Second paragraph with details.']);
    expect(text.split('\n').length).toBeGreaterThan(5);
  });

  it('returns the description as a plain string — the rest of the code is unaware', () => {
    const e = valid({ data: { description: multiline, estimate: 3 } });
    const back = parse(serialize(e)).event!;
    expect(back.data!['description']).toBe(multiline);
    expect(back.data!['estimate']).toBe(3);
  });

  it('reads the older format where the description was a string with newlines', () => {
    const legacy = JSON.stringify({ ...valid(), data: { description: multiline } });
    expect(parse(legacy).event!.data!['description']).toBe(multiline);
  });
});
