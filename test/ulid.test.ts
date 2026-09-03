import { describe, it, expect } from 'vitest';
import { ulid, createUlid, decodeTime } from '../src/core/ulid.js';

const CROCKFORD = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

describe('ulid', () => {
  it('is 26 characters of Crockford base32', () => {
    expect(ulid()).toMatch(CROCKFORD);
  });

  it('omits I, L, O and U — they are misread', () => {
    const many = Array.from({ length: 200 }, () => ulid()).join('');
    expect(many).not.toMatch(/[ILOU]/);
  });

  it('sorts as a string in the same order as in time', () => {
    const gen = createUlid();
    expect(gen(1_000_000_000_000) < gen(2_000_000_000_000)).toBe(true);
  });

  it('decodes the time from an existing identifier', () => {
    // decodeTime is pure, so it is checked against a fixed string, independent
    // of the generator's monotonic state.
    expect(decodeTime('01K44Q1800' + 'ZZZZZZZZZZZZZZZZ')).toBe(1_756_800_000_000);
  });

  it('keeps the given time while it is not below the previous one', () => {
    const gen = createUlid();
    const t = 1_756_800_000_000;
    expect(decodeTime(gen(t))).toBe(t);
  });

  it('keeps the previous time when the clock moves backwards', () => {
    // Not a bug but a direct consequence of monotonicity: the time in a ULID is
    // max(given, previous).
    const gen = createUlid();
    const t = 1_756_800_000_000;
    gen(t);
    expect(decodeTime(gen(t - 5_000))).toBe(t);
  });

  it('stays monotonic when the clock moves backwards', () => {
    // Invariant I2: event order must not depend on the system clock.
    const gen = createUlid();
    const a = gen(1_000_000_000_000);
    const b = gen(999_999_999_000); // the clock jumped into the past
    const c = gen(999_999_999_000);
    expect(b > a).toBe(true);
    expect(c > b).toBe(true);
  });

  it('increases across calls within the same millisecond', () => {
    const gen = createUlid();
    const t = 1_756_800_000_000;
    const ids = Array.from({ length: 1000 }, () => gen(t));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(1000);
  });

  it('produces no collisions across 50,000 calls', () => {
    const ids = new Set(Array.from({ length: 50_000 }, () => ulid()));
    expect(ids.size).toBe(50_000);
  });

  it('rejects a time outside the valid range', () => {
    expect(() => ulid(-1)).toThrow();
    expect(() => ulid(2 ** 48)).toThrow();
  });
});
