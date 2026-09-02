import { randomFillSync } from 'node:crypto';

/**
 * ULID — 26 символів Crockford base32: 48 біт часу, далі 80 біт випадковості.
 *
 * Обраний замість UUIDv4 тому, що лексикографічне сортування збігається з
 * хронологічним: порядок подій стає властивістю самого ідентифікатора і не
 * залежить від того, наскільки розійшлися системні годинники на різних
 * машинах (інваріант I2). Реалізація власна — ADR-003.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // без I, L, O, U
const TIME_LEN = 10;
const RANDOM_LEN = 16;
const MAX_TIME = 2 ** 48 - 1;

function encodeTime(time: number): string {
  let out = '';
  let t = time;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ALPHABET[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function encodeRandom(bytes: Uint8Array): string {
  // 80 біт → 16 символів по 5 біт.
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(acc >>> bits) & 31];
    }
    acc &= (1 << bits) - 1;
  }
  return out.slice(0, RANDOM_LEN);
}

/** Інкрементує 80-бітове число на одиницю, з переносом. */
function bumpRandom(bytes: Uint8Array): void {
  for (let i = bytes.length - 1; i >= 0; i--) {
    const v = bytes[i]!;
    if (v < 255) {
      bytes[i] = v + 1;
      return;
    }
    bytes[i] = 0;
  }
  // Переповнення всіх 80 біт за одну мілісекунду недосяжне на практиці,
  // але лишати мовчазне обнулення не можна — воно дало б колізію.
  throw new Error('ULID: вичерпано випадковий простір у межах мілісекунди');
}

export type UlidGenerator = (time?: number) => string;

/**
 * Створює генератор із власним монотонним станом.
 *
 * Стан навмисно не глобальний: він мутабельний, і спільний екземпляр робив би
 * поведінку залежною від того, хто викликав генератор раніше — включно з
 * порядком виконання тестів.
 */
export function createUlid(): UlidGenerator {
  let lastTime = -1;
  const lastRandom = new Uint8Array(10);

  return function generate(time: number = Date.now()): string {
    if (!Number.isInteger(time) || time < 0 || time > MAX_TIME) {
      throw new RangeError(`ULID: час поза діапазоном 0…${MAX_TIME}: ${time}`);
    }

    if (time > lastTime) {
      lastTime = time;
      randomFillSync(lastRandom);
    } else {
      // Той самий час або годинник відкотився назад — тримаємо монотонність,
      // інкрементуючи випадкову частину замість того, щоб довіряти годиннику.
      bumpRandom(lastRandom);
    }

    return encodeTime(lastTime) + encodeRandom(lastRandom);
  };
}

/** Спільний генератор для звичайного використання застосунком. */
export const ulid: UlidGenerator = createUlid();

export function decodeTime(id: string): number {
  let time = 0;
  for (let i = 0; i < TIME_LEN; i++) {
    const idx = ALPHABET.indexOf(id[i]!);
    if (idx === -1) throw new Error(`ULID: недопустимий символ у позиції ${i}`);
    time = time * 32 + idx;
  }
  return time;
}
