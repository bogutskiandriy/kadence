# kadence — for AI agents

This project's tasks live here as plain files. Read them directly, or through
the CLI. No server required.

## Commands

    kadence board --json                 the whole board
    kadence task list --json             all tasks
    kadence task show KAD-42 --json     one task with its history
    kadence task add "title" -d "..." --type bug --estimate 3
    kadence task move KAD-42 in_progress
    kadence task assign KAD-42 you@example.com
    kadence sprint status --json         current sprint progress

## JSON contract

Every `--json` response carries `schema: "kadence/v1"`. stdout holds JSON and
nothing else; warnings go to stderr. Exit codes: 0 success, 1 runtime error,
2 bad arguments.

## Working as an agent

Set `KADENCE_SOURCE=agent` so events record your authorship. Without it an
event is marked as human — we do not guess.

## What not to do

Do not hand-edit files under `.kadence/events/`: the journal is appended to,
never modified. To correct the state, add a new event through the CLI.
