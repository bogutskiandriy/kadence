# Changelog

## [0.1.0] — 2026-09-03

First release. Tasks, sprints and velocity as plain files inside a git
repository, with no server, account or network.

### Core

- Append-only event journal: one file per event, never rewritten. Two branches
  editing the same task merge without a conflict — verified on real git
  branches, not only in theory.
- State folded from the journal on every read, so the board cannot drift from
  reality. A snapshot cache makes that cost 7 ms on 10,000 events.
- ULID identifiers, so event order is a property of the id rather than of how
  far apart machine clocks have drifted.

### Tasks

- Title, description, type (task/bug/story/epic), priority, labels, assignee,
  due date, estimate, comments, logged time.
- Subtasks and blocking dependencies, with cycle detection that **reports** a
  loop instead of rejecting the later edit — rejecting it would make the state
  depend on merge order.
- Search across titles, descriptions and comments; filters, sorting, and bulk
  operations that apply all-or-nothing.
- Templates for repeated task shapes.

### Sprints

- Plan the next sprint while the current one runs.
- Velocity and hours-per-point derived from events, so the numbers cannot be
  forgotten or faked.
- Burndown reconstructed from the journal for any day — including days before
  the feature existed.

### Board

- `kadence board` — plain columns for pipes and scripts.
- `kadence ui` — interactive kanban: keyboard, mouse, drag between columns, and
  every field editable in place. Loads lazily, so `kadence task add` never pays
  for it.
- Custom columns per team; `done` cannot be removed because every analytic is
  computed from it.

### For agents

- `--json` on every command with a stable `schema: "kadence/v1"`.
- stdout carries JSON only; warnings go to stderr.
- `init` writes a guide the agent finds on its own.

### Known limits

- The velocity bet is not yet validated with users. See README, Honest status.
- Terminal interaction is covered by manual testing; only the key router is
  unit-tested.
