# First run at 0.5 — transcript

- **Date:** 2026-09-16 · **Binary:** `npm pack` of the working tree (version string still 0.4.1), installed into an empty directory
- **Checkpoint 17b:** no sprint or velocity wording on the path `init → task add → prime → ready` until a sprint is created. The only mentions before that are the command catalogues (`--help`, `report --list`), where they are listed, not pushed.
- **Repository:** fresh `git init`, no `.claude/`, one person

```
$ kadence init
kadence is ready.

  kadence task add "first task"
  kadence decision add "What we chose" --why "Why we chose it"
  kadence board

Commit .kadence/, AGENTS.md, CLAUDE.md so a teammate's agent finds them.
Files were created but not committed — that call is yours.

$ kadence task add "Fix login" --type bug
Created: Fix login

$ kadence prime
Nothing claimed by you.

Ready to start: 1  (kadence ready)

record why: kadence decision add "…" --why "…"

Go deeper:
  kadence ready              what can be started now
  kadence task show KAD-1    one task in full, with its decisions
  kadence decision list      the reasons behind the work
  kadence board              the whole board

$ kadence ready
  KAD-1 BUG Fix login

Take the first one:
  kadence task claim KAD-1

$ kadence --help
kadence/0.4.1

Usage:
  $ kadence <command> [options]

Commands:
  init                                 Set up kadence in this repository
  prime                                Everything a session needs before it starts. Short by design
  ready                                What can be started right now: open, unblocked, unclaimed
  task [action] [arg] [value] [extra]  Tasks: add | list | show | move | assign | ac | doc
  decision [action] [arg]              Decisions: add | list | show — the why behind the work
  note [text]                          Record something learned; `note list` reads them back
  board [action]                       Kanban board in the terminal; "config" edits it, "export" writes a snapshot
  ui                                   Interactive kanban board
  schema                               The machine-readable --json contract, for agents
  sprint [action] [name]               Sprints: create | add | edit | start | close | status | list | burndown
  milestone [action] [arg]             Milestones: create | add | list | close — grouping by outcome
  template [action] [name]             Task templates: save | list | delete
  report [name]                        Reports folded from the journal: flow | cfd | attention | burndown | velocity | workload
  stats                                Where the project stands: counts, blockers, contested claims, velocity
  compact                              Fold old months into one file each; cold start on a long journal drops from ~200 ms to ~20 ms
  completion [action]                  Shell completion; "install" writes it where your shell looks

For more info, run any command with the `--help` flag:
  $ kadence init --help
  $ kadence prime --help
  $ kadence ready --help
  $ kadence task --help
  $ kadence decision --help
  $ kadence note --help
  $ kadence board --help
  $ kadence ui --help
  $ kadence schema --help
  $ kadence sprint --help
  $ kadence milestone --help
  $ kadence template --help
  $ kadence report --help
  $ kadence stats --help
  $ kadence compact --help
  $ kadence completion --help

Options:
  -h, --help     Display this message 
  -v, --version  Display version number 

$ kadence report --list
Reports, each a fold over the journal:

  attention  Work in flight that nobody is moving, and why.
  flow       How long work takes, how much is in flight, and what is aging.
  cfd        Where work piles up: tasks per column at the end of each day.

Sprint and team:
  burndown   Whether a sprint is on track against an even burn.
  velocity   Committed against completed, sprint by sprint, as a range.
  workload   Who is carrying what right now, unassigned work included.

Each takes --json, and --html to write it as a page with charts.
  kadence report flow --html

$ kadence sprint create "Sprint 1"
Sprint "Sprint 1" started.

  kadence sprint add KAD-1
  kadence sprint status

$ kadence task add "Unestimated in a sprint"
Created: Unestimated in a sprint
Without an estimate this task adds no points to sprint "Sprint 1". Add --estimate.

```
