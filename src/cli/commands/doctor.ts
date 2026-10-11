import { relative, sep } from 'node:path';
import { resolveContext, isContext, type CommandResult } from './task.js';
import { rebuild, type CacheStanding } from '../../core/snapshot.js';

/**
 * `kadence doctor` — rebuild, verify, report (G5, DOC-32).
 *
 * Read-only on the journal. The one file it writes is `.kadence/state.json`,
 * which I6 says changes nothing, so a doctor that rewrites it can be run on
 * anyone's repository without asking.
 *
 * Two kinds of finding, kept apart on purpose. A file that cannot be read is
 * damage: the state is missing whatever it held, and the exit code says so.
 * A cycle, a contested claim, a task in a column that was removed are not:
 * they are the journal doing its job — conflicts are surfaced, never resolved
 * by rejection — and a doctor that failed on them would fail on every team
 * that merges.
 */
export function runDoctor(cwd: string, env: NodeJS.ProcessEnv): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { before, agreed, written, read, state } = rebuild(ctx.root);

  // Forward slashes on every platform: a path an agent compares or quotes
  // should not depend on which machine wrote the report.
  const damaged = read.corrupted.map((file) => relative(ctx.root, file).split(sep).join('/')).sort();
  const labelOf = new Map(state.tasks.map((t) => [t.id, t.label]));

  const surfaced = {
    contested: state.tasks.filter((t) => t.contestedBy.length > 0).map((t) => t.label),
    cycles: state.cycles.map((c) => c.path.map((id) => labelOf.get(id) ?? id)),
    unconfiguredStatuses: state.orphanStatuses,
    documentConflicts: state.documents.filter((d) => d.conflicts.length > 0).map((d) => d.label),
    waitingForMerge: state.pending.length,
    rejectedByRules: state.rejected.length,
  };

  const report = {
    events: {
      total: read.events.length,
      damaged,
      newerVersion: read.unknownTypes,
      systemic: read.systemicCorruption,
    },
    cache: { before, agreed, written },
    surfaced,
  };

  const lines = [
    `Events: ${read.events.length} read` +
      (damaged.length > 0 ? `, ${damaged.length} damaged` : '') +
      (read.unknownTypes > 0 ? `, ${read.unknownTypes} from a newer kadence (update to read them)` : ''),
    ...damaged.map((f) => `  damaged: ${f}`),
    `Cache: ${describeCache(before, agreed, written)}`,
    ...describeSurfaced(surfaced),
  ];

  if (damaged.length > 0) {
    const message =
      `${damaged.length} event file${damaged.length === 1 ? '' : 's'} could not be read; ` +
      'the state is missing whatever they held.\n' +
      'Restore them from git, which has every version:\n  git checkout -- .kadence/events/';
    return {
      ok: false,
      exitCode: 1,
      message: [...lines, '', message].join('\n'),
      error: { code: 'journal_damaged', message },
      data: {
        schema: 'kadence/v1',
        ok: false,
        error: { code: 'journal_damaged', message, hint: 'git checkout -- .kadence/events/' },
        ...report,
      },
    };
  }

  return {
    ok: true,
    exitCode: 0,
    message: [...lines, '', 'The journal reads cleanly.'].join('\n'),
    data: { schema: 'kadence/v1', ok: true, ...report },
  };
}

function describeCache(before: CacheStanding, agreed: boolean | null, written: boolean): string {
  const found = {
    fresh:
      agreed === false
        ? 'looked current but disagreed with the journal'
        : 'current, and it agreed with the journal',
    stale: 'behind the journal',
    missing: 'absent',
    outdated: 'written by another version of kadence',
  }[before];
  const after = written ? 'rebuilt from the events' : 'not written, because the journal is damaged';
  return `${found}; ${after}.`;
}

function describeSurfaced(s: {
  contested: string[];
  cycles: string[][];
  unconfiguredStatuses: string[];
  documentConflicts: string[];
  waitingForMerge: number;
  rejectedByRules: number;
}): string[] {
  const found = [
    s.contested.length > 0 ? `  contested claims: ${s.contested.join(', ')}` : null,
    ...s.cycles.map((c) => `  cycle: ${c.join(' → ')}`),
    s.unconfiguredStatuses.length > 0 ? `  columns not in the board: ${s.unconfiguredStatuses.join(', ')}` : null,
    s.documentConflicts.length > 0 ? `  documents edited on two branches: ${s.documentConflicts.join(', ')}` : null,
    s.waitingForMerge > 0 ? `  events for something not merged yet: ${s.waitingForMerge}` : null,
    s.rejectedByRules > 0 ? `  events the rules set aside: ${s.rejectedByRules}` : null,
  ].filter((l): l is string => l !== null);
  return found.length === 0
    ? ['Surfaced: nothing — no conflicts to look at.']
    : ['Surfaced, kept as written, not errors:', ...found];
}
