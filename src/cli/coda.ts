/**
 * Coda — the character the site and the terminal share (KAD-80).
 *
 * In the terminal it is small on purpose: three rows of half blocks in one
 * colour, the size and restraint of the mark in a CLI's own header (variant B
 * of four, chosen by the owner on 2026-10-10). The site shows the same
 * character rendered in 3D.
 *
 * It appears in exactly one place in the product: the success message of
 * `kadence init`, when a person is reading it in a terminal. Never in a pipe,
 * never in `--json`, never in prime or the hooks — those are read by agents,
 * and a drawing there would cost tokens and change a contract.
 */

/**
 * The drawing — a notehead with an eighth-note flag and two eyes — from this
 * 10×6 pixel grid, two pixels per cell (▀ ▄ █):
 *
 *     ......##..
 *     ......#.#.
 *     ..#####...
 *     .##.#.##..
 *     .#######..
 *     ..##.##...
 */
export const CODA_ART: readonly string[] = ['      █▀▄ ', ' ▄█▀█▀█▄  ', ' ▀██▀██▀  '];

const PETROL = '\u001b[38;5;30m';
const BOLD = '\u001b[1m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';

const LINE = 'Coda keeps what you decide, and why.';

/**
 * The init message with Coda's header — name and version, the message's first
 * line, and Coda's line, set beside the drawing — or the message untouched
 * when stdout is not a terminal. `color` follows `colorsEnabled` (NO_COLOR).
 */
export function codaGreeting(message: string, opts: { tty: boolean; color: boolean; version: string }): string {
  if (!opts.tty) return message;

  const [first = '', ...rest] = message.split('\n');
  const c = (code: string, text: string) => (opts.color ? `${code}${text}${RESET}` : text);
  const beside = [`${c(BOLD, 'kadence')} ${c(DIM, `v${opts.version}`)}`, first, c(DIM, LINE)];
  const header = CODA_ART.map((row, i) => `${c(PETROL, row)}  ${beside[i]}`);

  return [...header, ...rest].join('\n');
}
