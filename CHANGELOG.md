# Changelog

## [0.1.4] — 2026-09-03

### Fixed

- The package depended on itself. `kadence@^0.1.1` sat in `dependencies`, so
  every install pulled a second, older copy of the tool into `node_modules`
  and shipped it to users. Removed; the published tarball is now 32.7 kB with
  eight files in it.
- `@types/blessed` moved to `devDependencies`. Type definitions are not needed
  at runtime, and every install was paying for them.

### Repository

- Developer tooling (`.claude/`, `.serena/`) is no longer committed: 381 files
  and 3.8 MB of it, against 94 files of actual product. What belongs in git and
  what does not is written down in
  [ADR-007](docs/decisions/007-what-goes-into-git.md), and `.gitignore` now
  also covers `.env`, coverage output and editor leftovers.

## [0.1.3] — 2026-09-03

### Testing

- End-to-end coverage through the real binary: a full sprint from `init` to
  `sprint close` with velocity computed from actual events, every reachable
  command checked for a clean exit, three branches editing one task, an agent
  driving the tool with JSON alone, and the events folder vanishing on a
  branch switch. 390 tests.

## [0.1.2] — 2026-09-03

### Documentation

- The README opened with `npx kadence init` and said nothing more, so the
  obvious next step — `kadence board` — failed with "command not found". `npx`
  fetches a package for one command and leaves nothing installed. Global
  install is now the first instruction, with the npx path shown as the
  alternative it is.

## [0.1.1] — 2026-09-03

### Fixed

- `kadence --version` reported `0.1.0-dev` while the published package was
  `0.1.0`. The CLI carried its own copy of the version string; it is now
  injected from package.json at build time, with a test that fails if the two
  ever diverge again.

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
