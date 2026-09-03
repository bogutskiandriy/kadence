/** A document the agent reads as a plain file — no MCP, no network, no token. */
export const AGENT_README = `# sprintit — for AI agents

This project's tasks live here as plain files. Read them directly, or through
the CLI. No server required.

## Commands

    sprintit board --json                 the whole board
    sprintit task list --json             all tasks
    sprintit task show FLOW-42 --json     one task with its history
    sprintit task add "title" -d "..." --type bug --estimate 3
    sprintit task move FLOW-42 in_progress
    sprintit task assign FLOW-42 you@example.com
    sprintit sprint status --json         current sprint progress

## JSON contract

Every \`--json\` response carries \`schema: "sprintit/v1"\`. stdout holds JSON and
nothing else; warnings go to stderr. Exit codes: 0 success, 1 runtime error,
2 bad arguments.

## Working as an agent

Set \`SPRINTIT_SOURCE=agent\` so events record your authorship. Without it an
event is marked as human — we do not guess.

## What not to do

Do not hand-edit files under \`.sprintit/events/\`: the journal is appended to,
never modified. To correct the state, add a new event through the CLI.
`;

export const AGENTS_BEGIN = '<!-- sprintit:begin -->';
export const AGENTS_END = '<!-- sprintit:end -->';

/** Section for AGENTS.md — short, since the details live in .sprintit/README.md. */
export const AGENTS_SECTION = `${AGENTS_BEGIN}
## Project tasks — sprintit

Tasks live in \`.sprintit/\` as plain files. Read them directly or via the CLI:

    sprintit board --json           the whole board
    sprintit task list --json       all tasks
    sprintit task move FLOW-1 done  change state

\`--json\` responses carry \`schema: "sprintit/v1"\`; stdout is JSON only.
When acting as an agent, set \`SPRINTIT_SOURCE=agent\`.

Details: \`.sprintit/README.md\`
${AGENTS_END}`;

/**
 * Inserts or updates the sprintit section, leaving the rest of the file intact.
 *
 * The boundaries are comments rather than a heading: a human can rename a
 * heading, and then a repeat init would create a duplicate.
 */
export function upsertAgentsSection(existing: string | null): string {
  if (existing === null || existing.trim().length === 0) {
    return `${AGENTS_SECTION}\n`;
  }

  const start = existing.indexOf(AGENTS_BEGIN);
  const end = existing.indexOf(AGENTS_END);

  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start);
    const after = existing.slice(end + AGENTS_END.length);
    return `${before}${AGENTS_SECTION}${after}`;
  }

  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${AGENTS_SECTION}\n`;
}
