# kadence — Product Requirements Document

- **Version:** 2 · **Date:** 2026-09-16 · **Covers:** `0.4.x` (published 0.4.1, 2026-09-13) plus the unreleased working tree, through `1.0.0`
- **Status:** current. Replaces PRD v1 (2026-09-01, "Draft v0.1, pre-discovery", partly Ukrainian), which is in git history.
- **Where this sits:** [strategy.md](product/strategy.md) owns positioning, ICP, objectives, gates and the scorecard. [roadmap-to-1.0.md](product/roadmap-to-1.0.md) owns gates G1–G7, the ecosystem and money. [SPEC.md](../SPEC.md) and [docs/decisions/](decisions/) own the engineering. This PRD says **what the product must do, for whom, and how we know it is done** — and links rather than copies. Where this file disagrees with strategy.md, strategy.md wins.
- **Labels:** **Fact** — measured or read from the binary, with a source · **Inference** — our reading of facts · **Assumption** — load-bearing and unevidenced · **Open** — undecided.

> **Read this first.** The architecture is measured. The product bet is not. As of today: **0 Probe B interviews, 0 pilots, 0 known external users** ([strategy §0](product/strategy.md), [probe-b-results](research/probe-b-results.md)). Every statement about what users feel is an Assumption until the Oct 19 verdict.

---

## 0. What changed since v1

### Positioning

| v1 (2026-09-01) | v2 (2026-09-16) | Why |
|---|---|---|
| "Open-source project management inside the git repository" for teams of 2–20, then "work journal with sprint analytics" | **Shared context of a team and its agents, in the repo**, for teams of 3–8 where more than one human or more than one agent vendor works | [discovery-verdict](research/discovery-verdict-2026-09.md): 0 velocity requests across 1,076 open Beads issues; the leader's users asked for plain files, no daemon, merge without resolving |
| Velocity / estimate-vs-actual as the differentiator | Velocity and reports **present, not advertised** — a consequence of the journal | same |
| Conflict-freedom implied as a headline | Conflict-freedom is **proof, not pitch** — real but rare (15.4% of repos, ~1 merge in 200) | [probe-a-results](research/probe-a-results.md) |
| Competitors: git-bug, Backlog.md, git-issues, Jira, Linear, GitHub Issues | **Beads, Backlog.md, Spec Kit**; vendor memory (Claude Code Auto Memory, Tasks) as adjacency | [positioning-review](product/positioning-review-2026-09.md), discovery-verdict §1 |

### Shipped since v1 (0.2 → 0.4.1) and unreleased

| Line | What arrived |
|---|---|
| **0.2.1–0.2.2** (09-08) | Agent contract: `schema --json`, 15 error codes with `allowed`, `--fields`, `init` writes `CLAUDE.md` too; `cac` moved to devDependencies |
| **0.3.0–0.3.1** (09-08) | `decision add/list/show` (`--why` required, `--rejected`, `--supersedes`); `task doc` links; `source` on decisions |
| **0.3.2** (09-09) | CI and release pipeline hardening only |
| **0.4.1** (09-13; 0.4.0 tagged, never published) | Agent loop: `ready`, `prime`, `init --hooks`, `task claim/release` (contested, not locked), `note`. Acceptance criteria + Definition of Done. Milestones. `task list --branch`. `stats`, shell completion. `board --json --summary`. `board export --html/--md`. `@kadence/github` one-way publish. `report flow/cfd/attention`. `compact`. Labels as deltas. `source` on comments and history |
| **Unreleased** | `report burndown/velocity/workload`, `report --list`, `report <name> --html` with inline SVG; `npm run reference` → `dist/reference.json`; `scripts/kadence.mjs` wrapper (the repo runs on kadence). Fixes: `burndown.finalRemaining` always `null`; repeated `--rejected` crashing `decision add` |

Source for all rows: `CHANGELOG.md`, product inventory 2026-09-16.

### v1 decisions dropped explicitly

| v1 said | Now | Source |
|---|---|---|
| Licence **AGPL-3.0**, `LICENSING.md` before release | **MIT**, forever; the format is never gated | `package.json`, `LICENSE`, roadmap-to-1.0 §5 |
| "Validation skipped on purpose; the public release replaces interviews" | Reversed. Probe B (direct outreach, ≥ 5 interviews) is the **only Now item**; feature work is gated behind it | strategy §3–§4 |
| Personas "Tech lead Taras" (team of 6) and "PM Polina" (15 people, needs a dashboard) | ICP and buyer persona from strategy §1 (§3 below). PMs are readers, reached through export and agents | strategy §1 |
| `kadence serve` web dashboard in v0.2 | **Not doing** a server. Static HTML/Markdown export is the experiment in its place | roadmap-to-1.0 §7 |
| Time tracking in v0.2 | **Not doing** timers. Time is derived from moves; `task log` is a correction only | roadmap-to-1.0 §7 |
| MCP server and Jira/Linear/GitHub import in v1.0; multiple boards | MCP optional, only when a named user cannot run a CLI. Importers only from Backlog.md and Beads, only if the Oct 19 gate says so. No Jira/Linear import, no multiple boards planned | strategy §8, roadmap-to-1.0 §3 |
| Primary metric **Weekly Active Repositories**; "opt-in telemetry" recommended | North Star: repos with **≥ 2 authors 14 days after `init`**. **No telemetry, ever** | strategy §3, §8 |
| Events as YAML, UUID ids, "monotonic timestamps"; `entities/`, `sprints/`, `docs/` directories | JSON events (ADR-002); ULID identity and ordering, never `ts` (I2, I7); `.kadence/` holds `events/`, `README.md`, gitignored `state.json`; documents are linked, not stored (ADR-010) | SPEC, ADRs |
| Open: TUI stack (Ink / Bubble Tea / own) · how an agent learns of the CLI | Closed: blessed, loaded lazily (ADR-006) · `init` writes `AGENTS.md` + `CLAUDE.md`, `init --hooks` runs `prime` (ADR-009) | ADRs |
| Phasing v0.1a headless → v0.1b TUI | Done (0.1.0 shipped both) | CHANGELOG |
| Spike figures: 28 ms cold, 0.43 s raw read, 39 MB → 1.9 MB | Historical. Current: **199 ms** cold one-file-per-event, **21 ms** compacted, 12 ms warm at 10k events (the old "11 ms cold" was a warm read, corrected in 0.4) | CHANGELOG 0.4, `test/perf.test.ts` |

### v1 decisions still in force

Append-only journal, one file per event · snapshot cache and compaction are mandatory · agents **read** files, **write** through the CLI · two branches moving one task: later ULID wins, the losing event stays visible ([state-machine](design/state-machine.md)) · identity from `git config user.email` · Node ≥ 20 is an accepted requirement · `mkdir -p` before every write · 200 ms budget for non-interactive commands · every board action calls the CLI's function.

---

## 1. Summary

kadence is a journal of a team's work — tasks, decisions, notes, claims, criteria — kept as immutable JSON events in the repository beside the code. A person or any vendor's agent that opens the repository runs one command (`prime`) and knows what is in flight, what was decided and rejected, and what is ready to pick up; the state merges from any number of branches without conflict and needs no server, account or network. For teams of 3–8 developers using coding agents daily, the intended outcome is **less re-explaining between sessions, people and vendors**. Whether that loss is painful enough to adopt a journal is the unvalidated bet (§2.3).

---

## 2. Problem

### 2.1 Statement

When a developer starts an agent session on work someone else — a teammate, another machine, another vendor's agent — already touched, the session starts without knowing what was tried, decided, rejected or blocked. The human re-explains it, or the agent repeats a rejected path. Vendor memory solves this for one person on one machine; it is private, per vendor, and not in the repository ([roadmap-to-1.0 §1 "Why now"](product/roadmap-to-1.0.md)).

### 2.2 Evidence

| # | Evidence | Label | Source |
|---|---|---|---|
| E1 | 482,304 public repos with a root `AGENTS.md`; ≈ 18,000 keep agent-facing work in the repo (Beads, Backlog.md, Spec Kit, `.claude/tasks.md`) | Fact (2026-09-08) | discovery-verdict §1, §5 |
| E2 | Beads' top complaints are losing plain files, the daemon and atomic code+issue commits (38, 25, 17, 4 reactions) | Fact | discovery-verdict §2 |
| E3 | Backlog.md users hit duplicate sequential IDs "in production twice" with humans + a server-side agent | Fact | discovery-verdict §2 |
| E4 | The vendor shipped Tasks, Auto Memory and Auto Dream in three months — "agents forget" is acknowledged | Fact | discovery-verdict §1 |
| E5 | 0 requests for sprint, velocity or time tracking across 1,076 open Beads issues | Fact | discovery-verdict §3 |
| E6 | Task-file merge conflicts in **20 of 130** repos (15.4%), **44 of 8,396** merges (0.52%); 89% of classified ones are `CONFLICT (content)`, which append-only removes | Fact | probe-a-results |
| E7 | One task as an agent reads it: **982 bytes** today (304 with `--summary`), independent of history. Probe C measured **948 bytes** at 0.2.1, constant from 10 to 1,000 tasks while the journal grew 5 KB → 528 KB | Fact | README "What it costs you"; probe-c-agent-cost |
| E8 | One unsolicited tech lead (n = 1, not scripted) called drifting state "a real problem", then attributed it to attention, not storage | Fact, weak | tech-lead-feedback-2026-09-10 |
| E9 | Teams that keep work in the repo with agents **lose enough context to adopt a journal for it** | **Assumption** — Probe B **not run**: 0 interviews | probe-b-results |
| E10 | The value appears only with a second human, machine or vendor; a solo developer is accepted, not pursued | Inference | discovery-verdict verdict |
| E11 | Private repositories behave like the public ones measured in E1 and E6 | Assumption | probe-a limits |

### 2.3 The bet, stated so it can fail

> Teams of 3–8 where more than one human or agent vendor works lose context between sessions often enough that, given a journal in the repo, **a second author writes to it within 14 days without being asked.**

Tested by Probe B (verdict **2026-10-19**) and concierge pilots (gate **2026-11-13**); thresholds in [strategy §4](product/strategy.md). If it fails, [roadmap-to-1.0 §8](product/roadmap-to-1.0.md) describes the narrower product.

---

## 3. Target users

Taken from [strategy §1](product/strategy.md); not redefined here.

| | Who |
|---|---|
| **Account (ICP)** | Product company or agency, **3–8 developers** on shared repositories (company ~5–60); **≥ 2 use Claude Code, Cursor or Codex daily**; Ukraine, Poland/EU, or English-speaking remote |
| **Buyer / adopter** | **P1** tech lead, staff/senior or founding engineer — writes `CLAUDE.md`, can add `.kadence/` alone · **P2** CTO or head of engineering under 30 people · **P3** engineering manager — intro, not pitch |
| **Daily users** | Developers (dozens of small commands a day) · **coding agents** (a first-class consumer of the same contract) |
| **Readers** | Manager, PM, stakeholder — read exports and reports, rarely write |
| **Triggers** | team went from 1 to 3 agent users · new hire onboarded · a rejected approach came back · `CLAUDE.md` passed ~200 lines · Beads' Dolt migration · a Backlog.md ID collision |
| **Not for** | solo developers (as a segment) · > 20 developers asking for SSO · Jira/Linear mandate with nothing in the repo · no daily agent use · no Node ≥ 20 |

Doors, in order of evidence: (1) agent-using teams via direct outreach, (2) Beads leavers and Backlog.md teams, (3) multi-vendor teams.

---

## 4. Jobs

| ID | Job story | Who |
|---|---|---|
| **J1** | When I start an agent session on work someone else started, I want the agent to already know what was tried, decided and blocked, so I don't re-explain and it doesn't repeat a rejected path | Dev, Agent (primary job, strategy §1) |
| **J2** | When I make a choice or learn something, I want to record it in one command next to the work, so the next person or agent finds it without asking me | TL, Dev, Agent |
| **J3** | When several people and agents work in parallel, I want to know what is ready and who holds what, so two of us don't do the same task | Agent, Dev, TL |
| **J4** | When I plan or review, I want to see flow, stuck work and sprint cost from what actually happened, so I don't fill in forms | TL, Mgr |
| **J5** | When someone outside the repo needs the state, I want to hand them a file or an issue, so they don't need the CLI | TL, Mgr |
| **J6** | When branches merge, I want the work state to merge without conflicts or silent wrong IDs, so I can trust it | everyone, implicitly |
| **J7** | When I adopt or switch, I want to go from README to a working journal with an agent reading it in minutes, so trying it is not a project | TL |

---

## 5. Goals and non-goals

### Goals to 1.0

1. **Answer the bet** (G2) before building beyond it — Probe B, then pilots.
2. **Reach a second author** in teams we do not control (North Star; G1).
3. **Freeze and prove the contract** — event format, `.kadence/` layout, `--json`, error codes (G3).
4. **Survive real size and every claimed platform** (G4, G5) without breaking the 200 ms budget.
5. **Make every public number sourced** (G6) and every TUI screen used by a human before release (G7).

### Non-goals

| Not doing | Why | Source |
|---|---|---|
| Hosted core, accounts, telemetry, any network in the core | The promise; network lives only in separate packages | CLAUDE.md, ADR-012 |
| Two-way sync with GitHub Issues or Jira | A mediocre bridge; one-way publish is the experiment | roadmap-to-1.0 §7 |
| A web server / web UI | Contradicts "no server"; static export instead | same |
| Timers or manual time tracking; hours or capacity in workload; averages in any report | Time is derived from events; ranges, not means (DEC-9) | same; inventory §2(f) |
| `delegated`/`automated` context levels | Need a daemon | roadmap-to-1.0 §7 |
| Storing documents | Git versions them; kadence links | ADR-010 |
| `kadence context <task>` | `task show --json` already is it | Probe C; inventory |
| `llms.txt`, editor extensions, competing with Spec Kit on specs | No evidence / a third surface / a different job | roadmap-to-1.0 §7 |
| Committing, pushing, editing or deleting events for the user; `state.json` in git | Append-only honesty; the human owns git | CLAUDE.md |
| Solo developers and > 20-person orgs as target segments | Value needs a second author; SSO is a different product | strategy §1 |
| **Not required for 1.0:** MCP package, web UI, single binary, importer | May arrive if earned; none is a gate | roadmap-to-1.0 §2 |

---

## 6. Success metrics

Defined in [strategy §3](product/strategy.md); the weekly scorecard is [strategy §5](product/strategy.md). Not duplicated here.

| Level | Metric | Target (source: strategy) |
|---|---|---|
| **North Star** | Repositories whose `.kadence/events` holds entries from **≥ 2 authors 14 days after `init`** — observed via public repos, consented pilot check-ins; no telemetry | ≥ 2 incl. ≥ 1 public by **2027-01-18** (KR 7.1); ≥ 5 public for G1 (realistic Q2 2027) |
| O1 Discovery | Interviews by script, verdict published | ≥ 5 by Oct 16, verdict Oct 19 |
| O3 Pilots | Second author at day 14 · self-serve README → `task add` + agent `prime` in ≤ 10 min | ≥ 2 of 3 · 4 of 5 people, by Nov 13 |
| O4/O5 Proof | Copies ÷ visits after one Show HN · skill package listed | ≥ 5% by Nov 24 · 2 marketplaces by Nov 6 |
| Counter-metric | Interviews where **we** named the problem first | **0** |
| Product guardrails | 200 ms budget (§9) · 0 conflicts in the three-branch merge test · `prime` ≤ 40 lines and ≤ 3 KB · `--json` valid past 128 KiB on a pipe | tests in `test/perf.test.ts`, `test/integration/merge.test.ts` |

---

## 7. Requirements by job

Status: **Shipped (version)** · **Unreleased** (in the working tree) · **Planned (gate/phase)** · **Not doing**. Detail lives in `--help` and `kadence schema --json`; this table states the capability.

### J1 — Resume with shared context

| ID | Requirement | Status |
|---|---|---|
| R1.1 | `prime [--json]`: active sprint and days left, my work, ready count, decisions in force, last 5 notes, an attention line when warranted; ≤ 40 lines, ≤ 3 KB | Shipped 0.4.0 |
| R1.2 | `init --hooks` upserts a `SessionStart` hook that runs `prime` | Shipped 0.4.0 |
| R1.3 | `init` writes a marked, non-duplicating section into `AGENTS.md` and `CLAUDE.md`, and `.kadence/README.md`; human text left alone | Shipped 0.1.0 / 0.2.1 |
| R1.4 | `task show [--json]`: history, comments, decisions, docs, notes, claim, criteria — size independent of history (982 B) | Shipped 0.1.0, extended 0.4.1 |
| R1.5 | `task list --branch [--base]`: tasks touched on this branch, derived from git, never stored | Shipped 0.4.1 |
| R1.6 | `init` section length under a guardrail test | Planned (G7) |
| R1.7 | Agent skill package (`SKILL.md` ≤ 60 lines) in marketplaces that list Beads | Planned (O5, Nov 6) |
| R1.8 | `kadence context <task>`; MCP server by default | Not doing (MCP conditional, 0.6) |

### J2 — Capture work, decisions and learning

| ID | Requirement | Status |
|---|---|---|
| R2.1 | `task add/edit/move/assign/comment/cancel/delete/parent`, types, priorities, estimates, due dates, templates | Shipped 0.1.0 |
| R2.2 | `task delete` writes `task.deleted` and says plainly it cannot erase | Shipped 0.1.0 |
| R2.3 | Labels travel as `label_added/removed` deltas so concurrent branches keep both | Shipped 0.4.1 (ADR-013) |
| R2.4 | `decision add --why` (required) `--rejected` (repeatable) `--supersedes` (one event) `--task --doc`; `DEC-N` derived | Shipped 0.3.0; repeat-flag crash fix Unreleased |
| R2.5 | `note "text" [--task]` for things learned that were never a choice | Shipped 0.4.0 |
| R2.6 | Acceptance criteria `task ac add/check/uncheck/list`; DoD copied into new tasks; moving to done with open criteria warns and proceeds | Shipped 0.4.1 |
| R2.7 | `task ac remove`; DoD that fits non-code tasks | Open (known gap, CHANGELOG notes) |
| R2.8 | `task doc add` creates from a template if missing and links; path contained to the repo | Shipped 0.4.1 (ADR-010) |
| R2.9 | `source` human/agent on every event, comment, history line, decision and note via `KADENCE_SOURCE=agent` | Shipped (events 0.1.x → comments 0.4.1) |

### J3 — Coordinate humans and agents

| ID | Requirement | Status |
|---|---|---|
| R3.1 | `ready`: open, unblocked, unclaimed, before the started column; priority then age; empty result says why | Shipped 0.4.0 (fixed 0.4.1) |
| R3.2 | `task claim [KAD-N]` / `release`; no lock — concurrent claims read `contested`, earliest ULID holds | Shipped 0.4.0 (ADR-011) |
| R3.3 | Dependencies `task block/unblock`; cycles reported, not rejected | Shipped 0.1.0 |
| R3.4 | Sprints `create/add/edit/start/close/status/list`; milestones `MS-N` with points progress | Shipped 0.1.0 / 0.4.1 |
| R3.5 | Custom columns (`done` required); `board config --started` | Shipped 0.1.0 / 0.4.1 |

### J4 — See the work and its cost

| ID | Requirement | Status |
|---|---|---|
| R4.1 | Interactive board `ui` (keyboard, mouse, drag; `R` ready, `C` claim, `b` branch, `M` milestone, criteria checklist); every action calls the CLI function | Shipped 0.1.0 + 0.4.1 |
| R4.2 | `board [--json]`, `stats`, shell completion (zsh, bash, fish) | Shipped 0.1.0 / 0.4.1 |
| R4.3 | `sprint close/burndown`: velocity in points, actual hours from moves, hours per point, carry-over; rebuilt for any day | Shipped 0.1.0 |
| R4.4 | `report flow/cfd/attention` — percentiles, never means; each names its window and started boundary | Shipped 0.4.1 |
| R4.5 | `report burndown/velocity/workload`, `report --list`; velocity as low/median/high (DEC-9); flag strictness (DEC-10) | Unreleased |
| R4.6 | Burnup, time in status, epic rollup (in that order); Monte Carlo forecasting | Planned, unscheduled (reports-discovery) |

### J5 — Share outside the repo

| ID | Requirement | Status |
|---|---|---|
| R5.1 | `board export --html`: one self-contained file, no external request (tested), light/dark | Shipped 0.4.1 (experiment with kill condition) |
| R5.2 | `board export --md [--readme]` updates a marked README section, never creates a README | Shipped 0.4.1 |
| R5.3 | `report <name> --html`: inline SVG charts, each followed by its data rows (DEC-7, DEC-8) | Unreleased |
| R5.4 | `@kadence/github publish`: one-way via `gh`, duplicate-safe marker, never reads back; credential stays with `gh` | Shipped (package 0.1.0, experiment; ADR-012) |
| R5.5 | Two-way sync; Jira; web server | Not doing |

### J6 — Trust the repository

| ID | Requirement | Status |
|---|---|---|
| R6.1 | One JSON file per event, append-only; three branches editing one task merge in every order with 0 conflicts and identical state | Shipped 0.1.0 (integration test) |
| R6.2 | Conflicts surfaced, never rejected: cycles, removed columns, events for unmerged tasks, contested claims | Shipped 0.1.0 / 0.4.0 |
| R6.3 | `state.json` cache, gitignored, versioned and pinned to the projected shape | Shipped 0.1.0 / 0.3.1 |
| R6.4 | `compact [--keep-months] [--dry-run]`; archives merged by id | Shipped 0.4.1 — caveat: compact on one branch and merge before compacting on another |
| R6.5 | Writes contained to the repo (`task doc add`, `--file`) | Shipped 0.4.1 |
| R6.6 | `doctor` (rebuild, verify, report); compaction tested on a real-size journal in CI | Planned (G5) |
| R6.7 | Rebase strategy test; identity when one person's `user.email` differs across machines | Open (SPEC §9) |

### J7 — Adopt, install, switch

| ID | Requirement | Status |
|---|---|---|
| R7.1 | `npx kadence init` in a git repo, Node ≥ 20; 1 runtime dependency (blessed, TUI only) | Shipped 0.1.0 |
| R7.2 | First-run fixes from pilot hesitations | Planned (O3 KR 3.5, ≥ 3 by Nov 13) |
| R7.3 | Reference docs generated from the binary (`dist/reference.json`), not typed | Unreleased (generator); site use Planned (G6) |
| R7.4 | Install matrix npm/pnpm/yarn/bun on macOS, Linux, **Windows**; Homebrew tap | Planned (G4) |
| R7.5 | Backlog.md importer, then Beads `issues.jsonl` importer | Planned (0.6) — only if the Oct 19 gate passes; Backlog.md by Dec 11 (KR 6.2) |
| R7.6 | Single binary (Bun compile / Node SEA), winget, scoop | Planned (measure once in 0.7, then decide) |
| R7.7 | Core published as a library for third-party viewers | Planned (Later, no date) |

---

## 8. Agent contract

The contract is what agents depend on; changing it is **ask first** (CLAUDE.md). ADR-009.

| ID | Requirement | Status |
|---|---|---|
| A1 | `--json` on every command; `schema: "kadence/v1"`; stdout carries JSON only, warnings to stderr; exit codes 0/1/2 | Shipped 0.1.0 |
| A2 | **Additive only**: fields and error codes are added, never renamed or removed | Shipped (policy + schema test); written deprecation policy Planned (G3) |
| A3 | Every failure carries `error.code` (15 codes today) and `received` / `allowed` / `hint` where knowable | Shipped 0.2.1–0.2.2 |
| A4 | `schema --json` works outside a repo and publishes exit codes, env, errors, shapes and commands | Shipped 0.2.1 |
| A5 | `schema --json` covers **every** shipped command — today it lists 40 entries and omits e.g. `sprint add/edit/start/list/burndown`, `template *`, `completion`, `ui`, `task parent/unblock/cancel/delete` | **Gap**, Planned (G3) |
| A6 | Response size independent of history: `task show` 982 B; `board --json --summary` (1,000 tasks: 275 KB vs 855 KB full); `--fields` (200 tasks: 130,799 B → 11,015 B) | Shipped 0.2.1 / 0.4.1 |
| A7 | `board --json` in full stops growing with history (pagination or projection) | Planned (G5) |
| A8 | Responses of any size arrive complete through a pipe (synchronous write; regression test past 128 KiB) | Shipped (Probe C fix) |
| A9 | Agents read files, write only through the CLI; `KAD-N` is not in events, so the CLI is the only bridge from a human's reference to data | Shipped (I7, Probe C finding 2) |
| A10 | `KADENCE_SOURCE=agent` separates a person from their agent sharing one git identity | Shipped |
| A11 | 0.x fixture corpus: events from every 0.x release fold to the same state | Planned (G3) |
| A12 | No `retryable` field | Open — no user has asked |

---

## 9. Invariants and performance budget

Numbered as in [state-machine.md](design/state-machine.md). Each has tests; a failing one is fixed in code, never in the test.

| ID | Invariant | Why it exists |
|---|---|---|
| **I1** | The same events fold to the same state, whatever order the files are read in | Two developers on one commit must see one board; conflicts are surfaced, not rejected, or state would depend on merge order |
| **I2** | Ordering comes from the ULID, never from `ts` | Clocks disagree between machines |
| **I6** | Deleting `.kadence/state.json` changes nothing | It is a cache, never a source of truth |
| **I7** | A task's identity is its ULID; `KAD-N` is derived while folding and never stored | Probe A: `add/add` ID collisions are silent wrong references (E3, E6) |

**200 ms is a hard budget for non-interactive commands** (the TUI is exempt; blessed is lazy and CI checks it never enters `dist/cli.js`). Core stays synchronous with zero runtime dependencies (ADR-003, ADR-005).

| Measure | Value | Source |
|---|---|---|
| Startup (`--version`) | 60–70 ms; commands ≈ 95–100 ms | README, CHANGELOG 0.4 |
| 10k events, cold, one file per event | 199 ms — **at the budget** | `test/perf.test.ts`, CHANGELOG 0.4 |
| 10k events, cold compacted / warm | 21 ms / 12 ms | same |
| `ready`, branch range, cold with archive | < 200 ms (test) | `test/perf.test.ts` |
| Flow, CFD, attention | < 50 ms (test) | same |
| Journal at 10k events | < 5 MB (test) | same |

**Inference:** without compaction a 10k-event repo sits on the budget; `compact` is therefore part of the performance requirement, not an optimisation. Re-measure after any core change.

---

## 10. Risks

| Risk | Kind | Early warning | Mitigation | Source |
|---|---|---|---|---|
| **The owner never sends outreach; shipping replaces talking** | Tiger | < 40 touches by Sep 22; more `src/` commits than touches (27 vs 0, Sep 8–16) | Send before code; feature freeze until 40 sent; freeze except bug fixes to Oct 19 | strategy §4, §9 |
| Bet fails: nobody names context loss | Tiger | < 2 dated stories in first 3 calls | Oct 19 gate → lead with conflict-freedom for switchers, or importers only | strategy §4 |
| Pilots never get a second author | Tiger | day 7 shows one actor | Install with two people present; first handoff via `decision` + `prime` | strategy §9 |
| Beads ships a plain-file mode | Tiger | markdown-backend RFC with a working branch exists | Speed to G1, not code; merge proof and zero deps become the headline | roadmap-to-1.0 §10 |
| A vendor ships committed, project-scoped memory | Tiger | vendor announcement | Differentiation narrows to cross-vendor and cost analytics | roadmap-to-1.0 §8 |
| Drift claim over-promises: the journal only knows what gets written | Product | tech lead's pushback | Say the limit in copy; `attention` report surfaces staleness | tech-lead-feedback |
| TUI and outside-world boundaries ship bugs past a green suite (5 so far) | Quality | — | Test at real size; run `kadence ui` by hand before release (G7) | CLAUDE.md |
| Bulk delete by `KAD-N` in a loop hits wrong rows (labels shift) | Product sharp edge | — | Delete by ULID or one at a time; documented | CHANGELOG notes |
| Compaction on two branches | Product sharp edge | — | Compact, merge, then compact elsewhere; `doctor` planned | inventory §4 |
| Solo maintainer; name taken by a WordPress builder | Elephant / paper tiger | — | Kill criteria written in advance (§12); outreach does not go through search | roadmap-to-1.0 §10, strategy §9 |
| Rebase or squash rewrites event history | Open | — | Rebase test before 1.0 | SPEC §9 |

---

## 11. Open questions

| # | Question | Answered by | When |
|---|---|---|---|
| Q1 | Do multi-author / multi-vendor teams lose enough context to keep a journal? | Probe B | 2026-10-19 |
| Q2 | Does a second author appear without the owner pushing? | Concierge pilots | 2026-11-13 |
| Q3 | Would Beads / Backlog.md users switch, not just complain? | `/from-beads` fake door, Oct 19 importer gate | Nov 9 / Oct 19 |
| Q4 | How much time does the journal save an agent task? No speed claim until measured | Probe E | 0.5 |
| Q5 | Is `board --json` fixed by pagination or projection? | G3/G5 design | 0.7 |
| Q6 | Rebase strategy; identity across one person's machines | Tests + ADR | before 1.0-rc |
| Q7 | Should DoD be per task type; is `task ac remove` needed? | Pilot feedback | P2 |
| Q8 | Owner decisions still open: 8 vs 10 GTM hours, the Sep 22 gate wording, warm follow-up rule, what a Probe B "no" does to the project | Owner | strategy §7 |

---

## 12. Release plan 0.5 → 1.0

Versions are ordered by gates, not dates, except where [strategy §4](product/strategy.md) sets one. Feature work is subordinate to discovery until **2026-10-19**.

| Release | Outcome | Contents | Gate that opens it |
|---|---|---|---|
| **0.4.2 — before Pilot 0** | The repeated-`--rejected` crash is not on npm when a stranger first runs `decision add` | the fix already in the working tree; release notes do **not** lead with the unreleased reports | before **Sep 25** |
| **0.5 — the second author** (cut by **Nov 6**) | A team that has never heard of us gets from README to a journal an agent reads — and a teammate writes to it — alone | Teammate path: `npx` fallback when `kadence` is missing on their machine; the `init` section teaches `decision add --why`, `note`, `claim`; a first run that leads with context, not sprints (`prime`, `task add` warning, `--help` order, README quickstart); `schema --json` lists every shipped command (A5); documented removal of everything `init` touches; first-run fixes from pilots (R7.2); skill package (R1.7). Unreleased reports ride along **present, not advertised** — report freeze until Oct 19 ([product-icp-fit](product/product-icp-fit-2026-09.md), [strategy §1](product/strategy.md)) | Execution gate Sep 22 passed; pilot hesitations logged (from Sep 25); runs on the Nov 13 self-serve test and Nov 17 Show HN |
| **0.6 — the doors in** | A team on Backlog.md or Beads carries its history over in one command | Backlog.md importer (Dec 11), Beads importer; `/compare` pages only once importers exist; MCP package only for a named user who cannot run a CLI | **Oct 19:** ≥ 2 interviewees on a file tracker describe switching cost; `/from-beads` ≥ 2 bookings by Nov 9. Otherwise importers → Later |
| **0.7 → 1.0-rc — hardening** | Others can depend on the format | G3: fixture corpus, compatibility suite, deprecation policy, complete `schema --json` (A5, A11); G5: `board --json` bounded (A7), `doctor`, real-size compaction in CI; G4: Windows CI, Homebrew tap; single binary measured once; G7: `init` length test, TUI checklist on the RC | Pilots gate Nov 13 and public-proof gate Nov 20 read; kill-clock review **2027-01-18** says continue |
| **1.0.0** | Someone we do not control depends on it, and we can be held to the contract | `1.0.0-rc.1` sits with no contract change for a stated period, then 1.0; sponsorship turned on | **All of G1–G7** ([roadmap-to-1.0 §2](product/roadmap-to-1.0.md)). G1 (≥ 5 public repos with 2 authors at day 14 + ≥ 5 Probe B conversations) realistic **Q2 2027** (strategy §3). G1 and G3 are not lowered |

**If the bet fails (Oct 19 stop row):** 0.5 still ships (first run, docs), 0.6 narrows to importers for switchers, and the product becomes a conflict-free journal with sprint cost for a narrower segment. **Kill criteria** (all four true on 2027-01-18: < 20 visible inits, 0 public second-author repos, 0 inbound, nobody named context loss unprompted) → README says "finished portfolio piece" ([strategy §4](product/strategy.md)).

---

## 13. Self-assessment

- **Strongest section:** §8–§9. The contract and invariants are shipped, tested and measured.
- **Weakest section:** §2.3 and §6. The bet and every user-side metric sit at zero observations; this PRD documents a product built ahead of its evidence for the third time (0.2, 0.4, unreleased reports).
- **Assumptions to test first:** E9 (context loss is felt, Q1) · a second author appears unprompted (Q2) · the README first run works without the owner (strategy F).
- **Next step:** not code. The outreach in [strategy §2](product/strategy.md), against the Sep 22 gate.
