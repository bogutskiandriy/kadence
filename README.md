# kadence

**Your team plans sprints on gut feel. kadence counts what it actually delivers — from a journal that lives in your repository.**

Tasks, sprints and velocity as plain files inside your git repo. No server, no
account, no network. Works offline, and works for AI agents because the data is
just files they can read.

```bash
npm install -g kadence

kadence init
kadence task add "Fix login" -d "Broken since 2.3" --type bug --estimate 3
kadence ui        # interactive board, or `kadence board` for a plain list
```

> **v0.1.0.** The architecture is measured and covered by 383 tests. The product
> bet — that teams want sprint analytics in their repo — has not been validated
> with users yet. See [Honest status](#honest-status).

## Why another tracker

There are good file-based trackers already:
[git-bug](https://github.com/git-bug/git-bug),
[Backlog.md](https://github.com/MrLesk/Backlog.md),
[git-issues](https://steviee.github.io/git-issues/). kadence differs in two ways.

**1. It never conflicts on merge.** The others store a task as a *mutable* file,
so two branches touching one task collide. kadence stores an append-only journal
of events: one file per event, never rewritten.

We measured this rather than assumed it. Across **8,396 merge commits from 130
public repositories** using file-based trackers, conflicts in task files occur
in 15% of repositories — and **89% of them are `CONFLICT (content)`**, exactly
the type this design eliminates. Full data:
[probe-a-results.md](docs/research/probe-a-results.md).

**2. It computes velocity.** None of the three tracks sprints, velocity, or how
estimates compare with reality. kadence derives all of it from the journal, so
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

Install it once, so the command stays available:

```bash
npm install -g kadence
kadence init
```

Or run it without installing — but note that `npx` fetches the package for that
one command and leaves nothing behind, so every later call needs `npx` too:

```bash
npx kadence init
npx kadence board
```

`init` creates `.kadence/`, adds the derived cache to `.gitignore`, and writes a
short guide for AI agents. It does **not** commit anything — that call is yours.

## Commands

```
kadence init                          set up kadence in this repository
kadence ui                            interactive kanban board

kadence task add "<title>"            create a task
    -d, --description <text>         full description
    --type task|bug|story|epic       type; an epic is simply a parent task
    --priority low|normal|high|urgent
    -a, --assignee <who>             assignee
    --label <name>                   label; repeat for several
    --due <date>                     deadline, YYYY-MM-DD
    --parent <task>                  make it a subtask
    --template <name>                pre-fill from a saved template
    --estimate <points>              estimate, always last
kadence task list                     list tasks
    --search <text>                  title, description and comments
    --status|--type|--priority|--assignee|--label
    --overdue  --due-before <date>
    --sort created|priority|due|estimate
    --tree                           show parent/child structure
kadence task show KAD-1              full detail and history
kadence task edit KAD-1              opens $EDITOR; or pass field flags
kadence task move KAD-1 done         change state
kadence task assign KAD-1 <who>      assign; "none" unassigns
kadence task comment KAD-1 "text"    comment
kadence task log KAD-1 2h            log time; 90m, -30m to correct
kadence task parent KAD-2 KAD-1     nest under a parent
kadence task block KAD-2 KAD-1      KAD-2 waits for KAD-1
kadence task cancel KAD-1            keeps it in history
kadence task delete KAD-1            drops it from the board

kadence board                         plain board, one column per status
    -a, --assignee me                only your tasks
    --sprint                         only the active sprint
kadence board config                  show or change the columns
    --statuses "todo,doing,done"     your own workflow

kadence sprint create "Sprint 1"      first starts now, later ones are planned
kadence sprint add KAD-1 [--sprint "Sprint 2"]
kadence sprint start ["Sprint 2"]     start the next planned sprint
kadence sprint close                  close and report velocity
kadence sprint status                 progress of the active sprint
kadence sprint burndown               chart rebuilt from the journal
kadence sprint list                   every sprint

kadence template save bug --type bug --priority high
kadence template list | delete <name>
```

Most commands accept several tasks at once — `kadence task move KAD-1,KAD-2 done`
— and apply **all or nothing**: if one id does not exist, nothing changes.

Add `--json` to any command for a stable machine-readable shape.

## The interactive board

```
kadence ui
```

Columns side by side, mouse and keyboard:

```
←→ column   ↑↓ task   enter details   [ ] shift a card
m status    a assign  c comment       e edit in $EDITOR
p priority  t log time                n new    d delete
s sprint menu (status, burndown, start, close)   S add to sprint
/ filter    ? help    q quit
```

Enter opens a card where every field is editable in place. Dragging a card with
the mouse moves it between columns. Each action runs the same command the CLI
does, so the board can never disagree with the terminal.

The board loads its UI layer lazily — `kadence task add` never pays for it.

## For AI agents

Tasks are files. An agent reads them directly, or through the CLI — no MCP
server, no token, no network:

```bash
kadence board --json
kadence task list --json --status in_progress --sort priority
kadence task show KAD-1 --json
kadence sprint status --json
KADENCE_SOURCE=agent kadence task move KAD-1 in_progress
```

Every `--json` response carries `schema: "kadence/v1"`. stdout holds JSON and
nothing else; warnings go to stderr. Exit codes: `0` success, `1` runtime error,
`2` bad arguments.

`init` writes `.kadence/README.md` and a section in `AGENTS.md` so your agent
finds this on its own.

## How it works

```
.kadence/
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
| Bundle | 30 KB, zero runtime deps in the fast path |

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
npm test          # 363 tests
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
