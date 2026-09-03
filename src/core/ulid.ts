import { randomFillSync } from 'node:crypto';

/**
 * ULID — 26 characters of Crockford base32: 48 bits of time, then 80 bits of
 * randomness.
 *
 * Chosen over UUIDv4 because lexicographic sorting matches chronological
 * order: event ordering becomes a property of the identifier itself and no
 * longer depends on how far apart the clocks on different machines have
 * drifted (invariant I2). Hand-rolled on purpose — see ADR-003.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I, L, O, U
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
  // 80 bits to 16 characters, 5 bits each.
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

/** Increments an 80-bit number by one, carrying between bytes. */
function bumpRandom(bytes: Uint8Array): void {
  for (let i = bytes.length - 1; i >= 0; i--) {
    const v = bytes[i]!;
    if (v < 255) {
      bytes[i] = v + 1;
      return;
    }
    bytes[i] = 0;
  }
  // Exhausting all 80 bits within one millisecond is unreachable in practice,
  // but silently wrapping around would produce a collision.
  throw new Error('ULID: random space exhausted within a single millisecond');
}

export type UlidGenerator = (time?: number) => string;

/**
 * Creates a generator with its own monotonic state.
 *
 * The state is deliberately not global: it is mutable, and a shared instance
 * would make behaviour depend on who called the generator earlier — including
 * the order in which tests happen to run.
 */
export function createUlid(): UlidGenerator {
  let lastTime = -1;
  const lastRandom = new Uint8Array(10);

  return function generate(time: number = Date.now()): string {
    if (!Number.isInteger(time) || time < 0 || time > MAX_TIME) {
      throw new RangeError(`ULID: time out of range 0..${MAX_TIME}: ${time}`);
    }

    if (time > lastTime) {
      lastTime = time;
      randomFillSync(lastRandom);
    } else {
      // Same millisecond, or the clock moved backwards: keep monotonicity by
      // incrementing the random part instead of trusting the clock.
      bumpRandom(lastRandom);
    }

    return encodeTime(lastTime) + encodeRandom(lastRandom);
  };
}

/** Shared generator for ordinary application use. */
export const ulid: UlidGenerator = createUlid();

export function decodeTime(id: string): number {
  let time = 0;
  for (let i = 0; i < TIME_LEN; i++) {
    const idx = ALPHABET.indexOf(id[i]!);
    if (idx === -1) throw new Error(`ULID: invalid character at position ${i}`);
    time = time * 32 + idx;
  }
  return time;
}
