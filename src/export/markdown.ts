import type { ProjectState, Task, Milestone } from '../core/projection.js';
import { TERMINAL_STATUS, CANCELLED_STATUS } from '../core/projection.js';
import { sprintReport } from '../core/velocity.js';

/**
 * The board as Markdown, for a README or a pull request.
 *
 * The same snapshot the HTML export renders, in the format GitHub shows
 * without being asked. Nothing here is interactive and nothing is fetched —
 * that is the whole shape of this experiment.
 */

export const BOARD_BEGIN = '<!-- kadence:board:begin -->';
export const BOARD_END = '<!-- kadence:board:end -->';

/**
 * Anything a person typed, made safe for a table cell.
 *
 * A pipe would end the cell it is in. An end marker would end the whole
 * section: `upsertBoardSection` looks for the first one, so a task titled
 * after it would split the block and the corruption would grow by one copy on
 * every export. Both are neutralised here, at the one place text enters.
 */
function cell(text: string): string {
  return text
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, ' ')
    // A zero-width space inside the token: it reads identically and no longer
    // matches the marker the upsert searches for.
    .replace(/kadence:board:(begin|end)/g, 'kadence:board:\u200b$1');
}

function progressBar(done: number, total: number, width = 20): string {
  if (total === 0) return `${'░'.repeat(width)} 0%`;
  const pct = Math.round((done / total) * 100);
  const filled = Math.round((pct / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${pct}%`;
}

function taskRow(task: Task, milestones: readonly Milestone[]): string {
  const criteria =
    task.criteria.length === 0
      ? ''
      : `${task.criteria.filter((c) => c.checked).length}/${task.criteria.length}`;
  const milestone =
    task.milestone === null
      ? ''
      : (milestones.find((m) => m.id === task.milestone)?.name ?? '');
  // Status is configurable and permits any character but whitespace, so it
  // goes through the same escape as the title. So does everything else: one
  // rule is easier to keep than a list of exceptions.
  return `| ${cell(task.label)} | ${cell(task.title)} | ${cell(task.status)} | ${cell(
    task.priority,
  )} | ${task.estimate ?? ''} | ${cell(task.assignee ?? '')} | ${criteria} | ${cell(milestone)} |`;
}

export function boardMarkdown(state: ProjectState, generatedAt: Date = new Date()): string {
  const lines: string[] = ['# Board'];
  const stamp = generatedAt.toISOString().slice(0, 16).replace('T', ' ');
  lines.push('', `Snapshot of \`.kadence/\` at ${stamp} UTC. Regenerate with \`kadence board export --md\`.`);

  // Only the task sections are gated on tasks. A repository that has recorded
  // decisions and not yet added a task would otherwise export a page saying
  // "no tasks yet" and drop the very layer this product is for.
  const hasTasks = state.tasks.length > 0;

  const sprint = state.sprints.find((s) => s.status === 'active');
  if (hasTasks && sprint !== undefined) {
    const report = sprintReport(state, sprint.id);
    lines.push('', `## Sprint: ${cell(sprint.name)}`);
    if (report !== null) {
      lines.push('');
      lines.push(`${progressBar(report.velocity, report.committed)} — ${report.velocity} of ${report.committed} points`);
    }
  }

  if (state.milestones.length > 0) {
    lines.push('', '## Milestones', '', '| Milestone | Due | Progress | Points | Tasks |', '|---|---|---|---|---|');
    for (const m of state.milestones) {
      lines.push(
        `| ${cell(m.name)}${m.status === 'closed' ? ' (closed)' : ''} | ${cell(m.due ?? '')} | ${progressBar(
          m.donePoints,
          m.totalPoints,
          10,
        )} | ${m.donePoints}/${m.totalPoints} | ${m.doneTasks}/${m.totalTasks} |`,
      );
    }
  }

  if (hasTasks) {
    lines.push('', '## Tasks', '', '| Task | Title | Status | Priority | Points | Assignee | Criteria | Milestone |', '|---|---|---|---|---|---|---|---|');
    // Columns in configured order, so the file reads like the board does.
    const order = new Map(state.statuses.map((s, i) => [s, i]));
    const sorted = [...state.tasks].sort(
      (a, b) => (order.get(a.status) ?? 99) - (order.get(b.status) ?? 99) || (a.id < b.id ? -1 : 1),
    );
    for (const task of sorted) lines.push(taskRow(task, state.milestones));
  } else {
    lines.push('', 'No tasks yet.', '', '    kadence task add "first task"');
  }

  const current = state.decisions.filter((d) => d.supersededBy === null);
  if (current.length > 0) {
    lines.push('', '## Decisions in force');
    for (const d of current) {
      lines.push('', `**${d.label} ${cell(d.title)}**`, '', `Why: ${cell(d.why)}`);
      if (d.rejected !== null) lines.push('', `Rejected: ${cell(d.rejected)}`);
    }
  }

  const open = state.tasks.filter(
    (t) => t.status !== TERMINAL_STATUS && t.status !== CANCELLED_STATUS,
  );
  lines.push('', `${state.tasks.length} tasks, ${open.length} open.`);

  return `${lines.join('\n')}\n`;
}

/**
 * Replaces the section between the markers, leaving the rest untouched.
 *
 * Markers rather than a heading, for the reason `init` uses them in
 * `AGENTS.md`: a person renames a heading, and a rerun would then append a
 * second copy instead of updating the first.
 */
export function upsertBoardSection(existing: string, section: string): string {
  const block = `${BOARD_BEGIN}\n${section.trimEnd()}\n${BOARD_END}`;
  const start = existing.indexOf(BOARD_BEGIN);
  // Searched from the start marker, so a stray end marker earlier in the file
  // cannot invert the range and swallow what the person wrote above it.
  const end = start === -1 ? -1 : existing.indexOf(BOARD_END, start);

  if (start !== -1 && end !== -1 && end > start) {
    return `${existing.slice(0, start)}${block}${existing.slice(end + BOARD_END.length)}`;
  }
  const prefix = existing.endsWith('\n') ? '' : '\n';
  return `${existing}${prefix}\n${block}\n`;
}
