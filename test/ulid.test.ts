import { describe, it, expect } from 'vitest';
import { ulid, createUlid, decodeTime } from '../src/core/ulid.js';

const CROCKFORD = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

describe('ulid', () => {
  it('має 26 символів алфавіту Crockford base32', () => {
    expect(ulid()).toMatch(CROCKFORD);
  });

  it('не містить літер I, L, O, U — їх плутають при читанні', () => {
    const many = Array.from({ length: 200 }, () => ulid()).join('');
    expect(many).not.toMatch(/[ILOU]/);
  });

  it('сортується як рядок у тому ж порядку, що й у часі', () => {
    const gen = createUlid();
    expect(gen(1_000_000_000_000) < gen(2_000_000_000_000)).toBe(true);
  });

  it('декодує час із готового ідентифікатора', () => {
    // decodeTime — чиста функція, тому перевіряється на сталому рядку,
    // без залежності від монотонного стану генератора.
    expect(decodeTime('01K44Q1800' + 'ZZZZZZZZZZZZZZZZ')).toBe(1_756_800_000_000);
  });

  it('зберігає переданий час, поки той не менший за попередній', () => {
    const gen = createUlid();
    const t = 1_756_800_000_000;
    expect(decodeTime(gen(t))).toBe(t);
  });

  it('за відкоту годинника лишає попередній час, а не менший', () => {
    // Це не помилка, а прямий наслідок монотонності: час у ULID —
    // це max(переданий, попередній).
    const gen = createUlid();
    const t = 1_756_800_000_000;
    gen(t);
    expect(decodeTime(gen(t - 5_000))).toBe(t);
  });

  it('лишається монотонним, коли годинник відкотився назад', () => {
    // Інваріант I2: порядок подій не має залежати від системного часу.
    const gen = createUlid();
    const a = gen(1_000_000_000_000);
    const b = gen(999_999_999_000); // годинник стрибнув у минуле
    const c = gen(999_999_999_000);
    expect(b > a).toBe(true);
    expect(c > b).toBe(true);
  });

  it('зростає при кількох викликах у ту саму мілісекунду', () => {
    const gen = createUlid();
    const t = 1_756_800_000_000;
    const ids = Array.from({ length: 1000 }, () => gen(t));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(1000);
  });

  it('не дає колізій на 50 000 викликів', () => {
    const ids = new Set(Array.from({ length: 50_000 }, () => ulid()));
    expect(ids.size).toBe(50_000);
  });

  it('відкидає час поза допустимим діапазоном', () => {
    expect(() => ulid(-1)).toThrow();
    expect(() => ulid(2 ** 48)).toThrow();
  });
});
