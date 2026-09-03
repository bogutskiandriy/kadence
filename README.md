# FlowIt

**Your team plans sprints on gut feel. FlowIt counts what it actually delivers — from a journal that lives in your repository.**

Tasks, sprints and velocity as plain files inside your git repo. No server, no
account, no network. Works offline, and works for AI agents because the data is
just files they can read.

```bash
npx flowit init
npx flowit task add "Fix login" -d "Broken since 2.3" --type bug --estimate 3
npx flowit board
```

> **Status: early development.** The architecture is measured and tested, but
> the product bet — that teams want sprint analytics in their repo — has not
> been validated with users yet. See [Honest status](#honest-status).

## Why another tracker

There are good file-based trackers already:
[git-bug](https://github.com/git-bug/git-bug),
[Backlog.md](https://github.com/MrLesk/Backlog.md),
[git-issues](https://steviee.github.io/git-issues/). FlowIt differs in two ways.

**1. It never conflicts on merge.** The others store a task as a *mutable* file,
so two branches touching one task collide. FlowIt stores an append-only journal
of events: one file per event, never rewritten.

We measured this rather than assumed it. Across **8,396 merge commits from 130
public repositories** using file-based trackers, conflicts in task files occur
in 15% of repositories — and **89% of them are `CONFLICT (content)`**, exactly
the type this design eliminates. Full data:
[probe-a-results.md](docs/research/probe-a-results.md).

**2. It computes velocity.** None of the three tracks sprints, velocity, or how
estimates compare with reality. FlowIt derives all of it from the journal, so
the numbers cannot be forgotten or faked — they are a product of the work.

```
Sprint "Sprint 12" closed.

  Velocity:  10 of 10 points
  Actual:    16h — 1.6h per point
```

That last number is the point of the whole tool: what a story point actually
costs your team.

## Install

Requires Node 20 or newer, and a git repository.

```bash
npx flowit init
```

No global install needed. `init` creates `.flowit/`, adds the derived cache to
`.gitignore`, and writes a short guide for AI agents. It does **not** commit
anything — that call is yours.

## Commands

```
flowit init                          set up FlowIt in this repository

flowit task add "<title>"            create a task
    -d, --description <text>         full description
    --type task|bug|story            type
    --priority low|normal|high|urgent
    -a, --assignee <who>             assignee
    --label <name>                   label; repeat for several
    --estimate <points>              estimate, always last
flowit task list [--status <s>]      list tasks
flowit task show FLOW-1              full detail and history
flowit task move FLOW-1 done         change state
flowit task assign FLOW-1 <who>      assign; "none" unassigns

flowit board                         kanban board
    -a, --assignee me                only your tasks
    --sprint                         only the active sprint

flowit sprint create "Sprint 1"      first starts now, later ones are planned
flowit sprint add FLOW-1 [--sprint "Sprint 2"]
flowit sprint start ["Sprint 2"]     start the next planned sprint
flowit sprint close                  close the active one and report velocity
flowit sprint status                 progress of the active sprint
flowit sprint list                   every sprint
```

Add `--json` to any read command for a stable machine-readable shape.

## For AI agents

Tasks are files. An agent reads them directly, or through the CLI — no MCP
server, no token, no network:

```bash
flowit board --json
flowit task show FLOW-1 --json
FLOWIT_SOURCE=agent flowit task move FLOW-1 in_progress
```

Every `--json` response carries `schema: "flowit/v1"`. stdout holds JSON and
nothing else; warnings go to stderr. Exit codes: `0` success, `1` runtime error,
`2` bad arguments.

`init` writes `.flowit/README.md` and a section in `AGENTS.md` so your agent
finds this on its own.

## How it works

```
.flowit/
├── state.json          derived cache — gitignored, safe to delete
└── events/
    ├── archive/        compacted history, one file per month
    └── 2026-09/        recent events, one file each
```

Every command appends one event. State is folded from the journal on read, so
the board can never drift from reality. Two branches writing at once produce two
different files, and git merges them without a conflict by construction.

Measured on 10,000 events:

| | |
|---|---|
| Cold start with compacted archive | 28 ms |
| Warm start (cache) | 7 ms |
| Journal on disk | 1.9 MB (39 MB without compaction) |

These are enforced by tests that fail on regression.

## Honest status

What is verified:

- The merge thesis, on real git branches: three people editing one task produce
  zero conflicts, and every intent is preserved with its author.
- Performance and size guardrails, by tests that fail if they regress.
- The conflict problem exists in the wild — measured, not assumed.

What is not:

- **Whether teams want this.** The velocity bet rests on reasoning, not on user
  interviews. That research is designed but not yet run
  ([interview script](docs/research/interview-script.md)).
- Conflicts are real but **rare** — roughly one merge in two hundred. That is
  why the headline message is analytics, not conflict-freedom.

The full reasoning, including what would prove this product wrong, lives in
[docs/](docs/README.md).

## Development

```bash
npm install
npm test          # 206 tests
npm run build     # single 40 KB bundle
npm run typecheck
```

The core has **zero runtime dependencies** — ULID and validation are
hand-rolled, because a general-purpose validator cost 15% of the startup budget
for a seven-field object ([ADR-003](docs/decisions/003-zero-runtime-deps-in-core.md)).
The CLI layer uses `cac` and nothing else.

Architecture decisions are in [docs/decisions/](docs/decisions/); each one
records what was measured and what would make us revisit it.

## License

MIT
