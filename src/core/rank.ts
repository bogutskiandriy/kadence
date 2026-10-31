/**
 * Backlog order as fractional keys.
 *
 * A position in the Product Backlog is a string that sorts between its
 * neighbours, so placing one task writes one event about that task and
 * nothing about the others. Integer positions would renumber the tail on every
 * move — many events, and every one of them a merge conflict waiting for the
 * next branch that moved something else.
 *
 * Keys use 0-9a-z and never end in '0', which is what guarantees there is
 * always room before any key. The algorithm is the usual midpoint over digit
 * strings, without an integer part: a backlog is ranked by people, a few
 * hundred moves at most, and the keys stay short enough to read in a diff.
 */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const ZERO = DIGITS[0]!;

/** A key strictly between `a` and `b`. `null` means the open end. */
export function rankBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`rankBetween: "${a}" is not before "${b}"`);
  }
  return midpoint(a ?? '', b);
}

function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    // The common prefix, padding `a` with zeros: "a" and "a5" share "a".
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }

  const lo = a.length > 0 ? DIGITS.indexOf(a[0]!) : 0;
  const hi = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length;
  if (hi - lo > 1) return DIGITS[Math.round((lo + hi) / 2)]!;

  // Adjacent first digits. A longer `b` leaves room at its own first digit;
  // otherwise keep `a`'s and look for room after it.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[lo]! + midpoint(a.slice(1), null);
}

/**
 * Backlog order: ranked tasks first by key, the task's ULID breaking a tie
 * two branches can produce; unranked after, in whatever order the caller
 * already had. Returns 0 between two unranked tasks so a stable sort keeps it.
 */
export function compareRank(a: { id: string; rank: string | null }, b: { id: string; rank: string | null }): number {
  if (a.rank === null && b.rank === null) return 0;
  if (a.rank === null) return 1;
  if (b.rank === null) return -1;
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
