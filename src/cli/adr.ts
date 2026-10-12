import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * The decisions a team already wrote down, read from its ADR folder.
 *
 * A first journal answers nothing (KAD-77), and the decisions a team has are
 * usually in one of these folders. Onboarding offers them as decisions, each
 * linked back to its file. Two formats cover almost everyone — MADR and
 * Nygard's — and anything else gets its title and its file, nothing guessed:
 * the journal is append-only, so a wrong import cannot be taken back.
 */

export interface Adr {
  /** Relative to the repository root, with forward slashes. */
  path: string;
  title: string;
  /** The reason it was chosen, or '' when the record does not say in a known shape. */
  why: string;
  /** The options it beat, as the record names them. */
  rejected: string[];
}

/** Where ADRs live, in the order the tools that write them use. */
export const ADR_DIRS = ['docs/adr', 'docs/adrs', 'docs/decisions', 'doc/adr', 'adr', 'decisions'] as const;

/** Files in an ADR folder that are not decisions. */
const NOT_A_DECISION = /^(readme|index|template)/i;

function section(text: string, name: string): string {
  const at = text.search(new RegExp(`^##\\s+${name}\\b.*$`, 'mi'));
  if (at === -1) return '';
  const rest = text.slice(at).split('\n').slice(1).join('\n');
  const next = rest.search(/^##\s/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

export function parseAdr(text: string, path: string): Adr {
  const heading = text.match(/^#\s+(?:\d+\.\s*)?(.+?)\s*$/m)?.[1];
  const title = heading ?? basename(path).replace(/\.md$/i, '');

  const outcome = section(text, 'Decision Outcome') || section(text, 'Decision');
  const chosen = outcome.match(/Chosen option:\s*"([^"]+)"/i)?.[1]?.trim();
  const because = outcome.match(/\bbecause,?\s+([^\n]+?)\.?\s*$/im)?.[1]?.trim();
  const firstLine = outcome.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
  const why = because ?? (chosen !== undefined ? '' : firstLine);

  const options = section(text, 'Considered Options')
    .split('\n')
    .map((l) => l.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1])
    .filter((o): o is string => o !== undefined);
  const rejected = chosen === undefined ? [] : options.filter((o) => o.toLowerCase() !== chosen.toLowerCase());

  return { path, title, why, rejected };
}

/** The first ADR folder found and its records, in file order. */
export function findAdrs(root: string): { dir: string | null; adrs: Adr[] } {
  for (const dir of ADR_DIRS) {
    const full = join(root, ...dir.split('/'));
    if (!existsSync(full)) continue;
    let names: string[];
    try {
      names = readdirSync(full);
    } catch {
      continue;
    }
    const files = names.filter((n) => /\.md$/i.test(n) && !NOT_A_DECISION.test(n)).sort();
    if (files.length === 0) continue;
    return {
      dir,
      adrs: files.map((n) => parseAdr(readFileSync(join(full, n), 'utf8'), `${dir}/${n}`)),
    };
  }
  return { dir: null, adrs: [] };
}
