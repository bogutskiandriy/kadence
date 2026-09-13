import { resolveContext, isContext, failure, type CommandResult } from './task.js';
import { compact, compactionPlan } from '../../core/store.js';

/**
 * Fold old months of one-file-per-event into one file per month.
 *
 * The journal's conflict-freedom comes from one file per event, and its speed
 * from not reading ten thousand of them. Measured on 10,000 events: 199 ms
 * cold as separate files, 21 ms as a compacted archive. The primitive has
 * existed since 0.1; this is the first time a user can reach it.
 *
 * Nothing here touches git. The archive is files in `.kadence/events/archive/`,
 * and what happens to them is the human's call, as with every other write.
 */

export interface CompactOptions {
  /** Months kept as separate files, counting the current one. Default 2. */
  keepMonths?: number;
  /** As typed, so an error can quote it rather than "NaN". */
  keepMonthsRaw?: string;
  /** Report the plan and write nothing. */
  dryRun?: boolean;
  json?: boolean;
}

const DEFAULT_KEEP = 2;

/** First month that stays uncompacted: `keep` months back from today, inclusive. */
export function keepFromMonth(today: Date, keep: number): string {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth(); // 0-based
  const first = new Date(Date.UTC(y, m - (keep - 1), 1));
  return first.toISOString().slice(0, 7);
}

export function runCompact(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: CompactOptions,
  today: Date = new Date(),
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const keep = options.keepMonths ?? DEFAULT_KEEP;
  if (!Number.isInteger(keep) || keep < 1) {
    const typed = options.keepMonthsRaw ?? String(keep);
    return failure(2, 'invalid_argument', `--keep-months must be a whole number of at least 1, got "${typed}".`, {
      received: typed,
      hint: 'kadence compact --keep-months 3',
    });
  }

  const from = keepFromMonth(today, keep);
  const plan = compactionPlan(ctx.root, from);

  if (plan.months.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      message:
        `Nothing to archive: every event is from ${from} or later, which --keep-months ${keep} keeps as separate files.`,
      data: { schema: 'kadence/v1', ok: true, keepFrom: from, archivedMonths: [], archivedEvents: 0, dryRun: options.dryRun === true },
    };
  }

  const summary = plan.months.map((m) => `${m.month} (${m.events} event${m.events === 1 ? '' : 's'})`).join(', ');

  if (options.dryRun === true) {
    return {
      ok: true,
      exitCode: 0,
      message:
        `Would archive ${plan.events} event${plan.events === 1 ? '' : 's'} from ${summary}, ` +
        `keeping ${from} onward as separate files.\nNothing was written. Drop --dry-run to do it.`,
      data: {
        schema: 'kadence/v1',
        ok: true,
        keepFrom: from,
        archivedMonths: plan.months.map((m) => m.month),
        archivedEvents: plan.events,
        dryRun: true,
      },
    };
  }

  const result = compact(ctx.root, from);

  if (result.skipped.length > 0) {
    // Partial work, reported as a failure. An archive that cannot be read is
    // the only copy of everything compacted before it, so the month it covers
    // was left whole — sources and all. Saying "archived 3 months" and exiting
    // 0 would bury that under a success line.
    const names = result.skipped.map((p) => p.replace(`${ctx.root}/`, '')).join(', ');
    const done =
      result.archivedMonths.length > 0
        ? `Archived ${result.archivedMonths.join(', ')} first; those are done.\n`
        : '';
    return failure(
      1,
      'conflicting_state',
      `${done}Could not read ${names}, so ${result.skipped.length === 1 ? 'that month was' : 'those months were'} left alone. ` +
        'Nothing was deleted. The archive holds every event compacted before it — restore the file from git, ' +
        'or move it aside if you accept losing what it held, then run this again.',
      { received: names, hint: 'git checkout -- .kadence/events/archive/' },
    );
  }

  return {
    ok: true,
    exitCode: 0,
    message:
      `Archived ${result.archivedEvents} event${result.archivedEvents === 1 ? '' : 's'} from ${summary} ` +
      `into .kadence/events/archive/, keeping ${from} onward as separate files.\n` +
      // The one honest cost: an archived month is a single file, so two
      // branches that both compact it can conflict where single events never did.
      'An archived month is one file. Compact on one branch and merge it before compacting on another; ' +
      'the events themselves are unchanged, only where they live.\n' +
      'Nothing was committed — that call is yours.',
    data: {
      schema: 'kadence/v1',
      ok: true,
      keepFrom: from,
      archivedMonths: result.archivedMonths,
      archivedEvents: result.archivedEvents,
      dryRun: false,
    },
  };
}
