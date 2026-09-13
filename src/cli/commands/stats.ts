import { resolveContext, isContext, loadState, type CommandResult } from './task.js';
import { sprintReport } from '../../core/velocity.js';
import { TERMINAL_STATUS, CANCELLED_STATUS, type ProjectState } from '../../core/projection.js';

/**
 * One screen that says where the project stands.
 *
 * Every number here is derivable from the other commands. It earns its place
 * by being the answer to "how are we doing" without deciding in advance which
 * of six commands to run — and by naming the two things that are wrong rather
 * than merely counted: open blockers, and tasks two people claimed.
 */

export interface StatsOptions {
  json?: boolean;
}

const RECENT_SPRINTS = 3;

function countBy<T>(items: readonly T[], key: (item: T) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  // Descending by count, then by name, so the order is stable between runs.
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/** Velocity of the sprints that are actually finished, newest first. */
function recentVelocity(state: ProjectState): Array<{ name: string; velocity: number }> {
  return state.sprints
    .filter((s) => s.status === 'closed')
    // By the event that closed them, not by when they were created: a sprint
    // planned first can be closed last, and "recent" means recently closed.
    .sort((a, b) => ((a.closedBy ?? '') < (b.closedBy ?? '') ? 1 : -1))
    .slice(0, RECENT_SPRINTS)
    .map((s) => {
      const report = sprintReport(state, s.id);
      return { name: s.name, velocity: report?.velocity ?? 0 };
    });
}

export function runStats(cwd: string, env: NodeJS.ProcessEnv, options: StatsOptions): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);

  const open = state.tasks.filter(
    (t) => t.status !== TERMINAL_STATUS && t.status !== CANCELLED_STATUS,
  );
  const finished = new Set(
    state.tasks.filter((t) => t.status === TERMINAL_STATUS || t.status === CANCELLED_STATUS).map((t) => t.id),
  );

  const byStatus = countBy(state.tasks, (t) => t.status);
  const byAssignee = countBy(open, (t) => t.assignee ?? 'unassigned');
  const blocked = open.filter((t) => t.blockedBy.some((id) => !finished.has(id)));
  const contested = state.tasks.filter((t) => t.contestedBy.length > 0);
  const velocity = recentVelocity(state);

  if (state.tasks.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: 'No tasks yet.\nCreate the first one:\n  kadence task add "title"',
      data: {
        schema: 'kadence/v1',
        ok: true,
        tasks: 0,
        open: 0,
        byStatus: [],
        byAssignee: [],
        blocked: [],
        contested: [],
        velocity: [],
      },
    };
  }

  const lines: string[] = [];
  lines.push(`${state.tasks.length} tasks, ${open.length} open`);
  lines.push('', 'By status:');
  for (const [status, n] of byStatus) lines.push(`  ${n}  ${status}`);

  if (byAssignee.length > 0) {
    lines.push('', 'Open work by assignee:');
    for (const [who, n] of byAssignee) lines.push(`  ${n}  ${who}`);
  }

  // The two lines that are a problem rather than a measurement come last,
  // where a reader's eye stops, and name the tasks instead of counting them.
  if (blocked.length > 0) {
    lines.push('', `Blocked (${blocked.length}): ${blocked.map((t) => t.label).join(', ')}`);
  }
  if (contested.length > 0) {
    lines.push('', `Contested (${contested.length}): ${contested.map((t) => t.label).join(', ')}`);
  }

  if (velocity.length > 0) {
    lines.push('', 'Velocity of the last closed sprints:');
    for (const s of velocity) lines.push(`  ${s.velocity} points  ${s.name}`);
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: lines.join('\n'),
    data: {
      schema: 'kadence/v1',
      ok: true,
      tasks: state.tasks.length,
      open: open.length,
      byStatus: byStatus.map(([status, count]) => ({ status, count })),
      byAssignee: byAssignee.map(([assignee, count]) => ({ assignee, count })),
      blocked: blocked.map((t) => t.label),
      contested: contested.map((t) => t.label),
      velocity,
    },
  };
}
