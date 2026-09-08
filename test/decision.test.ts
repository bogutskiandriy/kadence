import { describe, it, expect } from 'vitest';
import { createUlid } from '../src/core/ulid.js';
import { project } from '../src/core/projection.js';
import { validate } from '../src/core/event.js';
import type { FlowEvent } from '../src/core/event.js';

const gen = createUlid();

/** A decision is its own entity, like a task: the event id IS the decision id. */
function decision(data: Record<string, unknown>): FlowEvent {
  const id = gen();
  return {
    id,
    type: 'decision.recorded',
    entity: id,
    actor: 'ana@example.com',
    ts: '2026-09-08T10:00:00.000Z',
    source: 'human',
    data,
  };
}

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

describe('the decision event', () => {
  it('needs a title and a reason — a decision without why is a changelog line', () => {
    expect(validate(decision({ title: 'Use ULIDs' }))).toContain('data.why');
    expect(validate(decision({ why: 'because clocks disagree' }))).toContain('data.title');
  });

  it('accepts the shape we publish', () => {
    const e = decision({
      title: 'Use ULIDs for identity',
      why: 'Clocks disagree between machines, so ts cannot order events.',
      rejected: 'Auto-increment integers — they collide across branches.',
    });
    expect(validate(e)).toEqual([]);
  });
});

describe('folding decisions', () => {
  it('produces a decision with its reason', () => {
    const state = project([
      decision({ title: 'Use ULIDs', why: 'Clocks disagree between machines.' }),
    ]);

    expect(state.decisions).toHaveLength(1);
    expect(state.decisions[0]!.title).toBe('Use ULIDs');
    expect(state.decisions[0]!.why).toBe('Clocks disagree between machines.');
  });

  it('keeps the rejected alternative — the section that pays', () => {
    const state = project([
      decision({ title: 'A', why: 'because', rejected: 'B, it collides across branches' }),
    ]);
    expect(state.decisions[0]!.rejected).toBe('B, it collides across branches');
  });

  it('leaves rejected absent rather than empty when nothing was rejected', () => {
    const state = project([decision({ title: 'A', why: 'because' })]);
    expect(state.decisions[0]!.rejected).toBeNull();
  });

  it('numbers decisions in ULID order, not by timestamp (I2)', () => {
    const first = decision({ title: 'First', why: 'w' });
    const second = { ...decision({ title: 'Second', why: 'w' }), ts: '2020-01-01T00:00:00.000Z' };

    const state = project([first, second]);
    expect(state.decisions.map((d) => d.label)).toEqual(['DEC-1', 'DEC-2']);
    expect(state.decisions[0]!.title).toBe('First');
  });

  it('folds to the same state whatever order the files are read in (I1)', () => {
    const events = [
      decision({ title: 'A', why: 'w' }),
      decision({ title: 'B', why: 'w' }),
      decision({ title: 'C', why: 'w' }),
    ];
    const expected = JSON.stringify(project(events).decisions);

    for (let seed = 1; seed <= 20; seed++) {
      expect(JSON.stringify(project(shuffle(events, seed)).decisions)).toBe(expected);
    }
  });

  it('gives every decision a ULID identity, with DEC-N derived (I7)', () => {
    const e = decision({ title: 'A', why: 'w' });
    const state = project([e]);

    expect(state.decisions[0]!.id).toBe(e.id);
    expect(state.decisions[0]!.label).toBe('DEC-1');
  });
});
