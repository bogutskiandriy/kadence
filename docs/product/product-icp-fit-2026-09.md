# Product × ICP fit — which kadence is for the tech lead

- **Date:** 2026-09-16
- **Question (owner):** the product grew fast between 0.3 and the working tree. Measured against the ICP and buyer persona in [strategy.md §1](strategy.md), which version of the product is for them?
- **Inputs:** the product inventory of 2026-09-16 (read from the binary, `schema --json`, CHANGELOG incl. [Unreleased]); [strategy.md](strategy.md) §1, §3, §4, §6; [tech-lead feedback](../research/tech-lead-feedback-2026-09-10.md); [discovery verdict](../research/discovery-verdict-2026-09.md); [feature adoption](feature-adoption-2026-09.md); [roadmap-to-1.0](roadmap-to-1.0.md) §Next.
- **Own observation:** `init → task add → decision add → prime → ready → stats → schema --json` run on 2026-09-16 with the working-tree build (`dist/cli.js`, reports 0.4.1) in a throwaway git repo **outside** this repository. Nothing was written to this repository's journal.
- **Method:** `gtm-icp` (buyer persona), `research-user-persona`, `research-jtbd` (rewritten alongside: [jtbd.md](../research/jtbd.md)), `product-prioritization` (ICE, reasoning in §4).
- **Status:** evidence and recommendations, not a decision. **No interviews have happened** (0 touches, 0 interviews, 0 pilots as of today). Nothing here moves a gate in strategy.md §4.

Labels: **Fact** — in the code, the binary's output, or a primary source · **Inference** — our reading of facts · **Assumption** — unevidenced and load-bearing; Probe B or a pilot must answer it.

---

## 0. The answer first

**Fact.** The product has ~60 user-facing capabilities. The path the North Star measures — `init` → first task or decision → an agent reads it through `prime` → a **second author** writes — uses the 16 rated Core in §2, almost all shipped in 0.1 (tasks), 0.3 (decisions) and the 0.4.0 slice (`prime`, `ready`, `claim`, `note`, `init --hooks`).

**Inference.** The version that is "for" the tech lead is **0.4.0's agent loop plus 0.3's decisions on top of the 0.1 task core — with sprints, reports and exports moved out of the first 20 minutes, and a second-author path added that does not exist today.** None of the ICP gaps below is a missing report; they are gaps in the handoff between the first and the second machine.

**Fact — the first run still speaks to the manager persona.** In a fresh repository:

| Surface | What a tech lead sees today |
|---|---|
| `kadence init` | suggests `task add` and `board` — nothing about decisions, `prime`, the hook, or committing for a teammate |
| first `task add` without `--estimate` | *"Without an estimate this task will not count towards velocity. Add --estimate."* ([task.ts:277](../../src/cli/commands/task.ts)) |
| `kadence prime` | first line: *"No active sprint."* ([prime.ts:112](../../src/cli/commands/prime.ts)) |
| `kadence --help` | command order: `milestone, note, decision, schema, prime, ready, stats, report, compact, completion, init, task, board, sprint, template, ui` — `init` is eleventh |
| README "In practice" | first block: `sprint create` → `task add --estimate 3` → `sprint close`; the reports block (7 commands) comes before "For agents" |
| `kadence ui` header | `kadence  <sprint>  N tasks, M points` ([board.ts:302](../../src/tui/board.ts)) |
| `AGENTS.md` / `CLAUDE.md` section | 7 commands: read commands plus `task move`; **no `decision add`, no `note`, no `claim`** |

**Inference.** Every one of these is copy or a one-line condition, and together they tell a tech lead that kadence is a sprint tracker — the exact category the [tech-lead feedback](../research/tech-lead-feedback-2026-09-10.md) reached for ("Jira, but in the repo") and the [discovery verdict](../research/discovery-verdict-2026-09.md) §3 says nobody in this audience asked for.

---

## 1. Personas inside a 3–8-developer team working with agents

Built on strategy.md §1 (ICP account and person), not on interviews. The only first-hand voice is one tech lead, n = 1, who has never run the tool. Quotes marked *illustrative* are ours, not anyone's words.

### 1.1 Buyer and champion — the tech lead who owns `CLAUDE.md` (P1 · primary persona)

**Who (strategy §1, Fact as a definition).** Tech lead, staff/senior or founding engineer in a team of 3–8; writes `CLAUDE.md`/`AGENTS.md`; can add `.kadence/` without asking anyone; uses Claude Code, Cursor or Codex daily. Budget authority is irrelevant at $0 ACV — **the "purchase" is a directory in a shared repo and a section in a file everyone's agent reads**, so the real authority is over the repository's conventions.

| | |
|---|---|
| **Job** | When a teammate's agent (or mine, tomorrow) picks up work someone else started, I want it to already know what was tried, decided and blocked, so nobody re-explains and no rejected path comes back. — strategy §1 job, **Assumption** until Probe B |
| **Triggers** (strategy §1) | team went from 1 to 3 agent users · new hire · a rejected approach came back · `CLAUDE.md` passed ~200 lines · Beads' Dolt migration · a Backlog.md ID collision. **Fact** that these are the stated triggers; **Assumption** that any of them causes action |
| **Current hire** | hand-maintained `CLAUDE.md`, `docs/decisions/`, GitHub Issues/Linear, Claude Code Tasks and Auto Memory (per user, per machine), Beads/Backlog.md for some. **Fact** for the category (discovery verdict §1); **Assumption** per team |
| **Must see in 20 minutes** | (1) install and `init` touch only files they can read and review in a diff — **met** (Fact: marked sections, no commit, `state.json` gitignored); (2) a decision with `--why` recorded and **their own agent quoting it back** in a fresh session via `prime` — **possible, not guided** (`init` never mentions it); (3) evidence it is safe for the shared repo: no network, no daemon, merge proof — **met, but below the fold** in README; (4) **how a teammate gets the same thing** — **not met** (§4 gap 1); (5) how to take it out again — **not met** (§4 gap 5) |
| **Abandons when** | it reads as a tracker competing with Linear/Jira (**Fact**, n = 1: that is the category they chose); the first screen asks for sprints and estimates (**Inference** from the surfaces above); a teammate's agent fails on `kadence: command not found` and the lead is blamed for a broken `CLAUDE.md` (**Inference**, §4 gap 1); a drift claim over-promises ("the board can never drift from reality" was fixed in README to "from the journal" — **Fact**, README l.79–86); it adds weekly upkeep nobody owns (**Assumption**; Beads users: "I spend a bunch of time caring for beads itself", discovery verdict §2) |
| **Social job** | be the person who made the team's agents less amnesiac without imposing process — *illustrative*. **Assumption** |
| **Design implication** | Optimise every first-run surface for this person, and treat the teammate as part of *their* job: a lead who cannot hand it over in one message will not install it on a shared repo |

### 1.2 Daily developer — the second author (P-Dev · the North Star event)

**Who.** A developer on the same team who did **not** choose kadence. They pull, their agent reads `CLAUDE.md`, and whatever happens next decides the North Star. **Fact:** strategy §2 calls this "the only built-in loop"; §6 N2 ranks "a second author appears without the owner pushing" at risk 7.2.

| | |
|---|---|
| **Job** | When I start on a task a teammate or their agent touched, I want to know the current state and why, without a meeting — and I do not want new chores. **Assumption** |
| **Trigger** | `git pull` brings `.kadence/` and a changed `CLAUDE.md`; their agent runs `kadence prime` from the hook or the section. **Fact** that this is the mechanism; nothing prompts it otherwise |
| **Current hire** | ask in Slack, read the PR, read `CLAUDE.md`, ask the lead. **Assumption** |
| **Must see in 20 minutes** | their agent's first session works on their machine (binary present or a clear fallback); `prime` shows something **useful to them** (a decision, a note, what is ready) rather than "No active sprint"; their agent can **write** a note or decision without them learning the CLI. Today: the section lists no write command except `task move` (**Fact**) |
| **Abandons when** | command not found / hook error on every session start (**Inference**); the tool feels like reporting to management — per-person `report workload`, velocity nags (**Assumption**, and it is assumption #12 "the journal will not become a surveillance tool", assumptions-map); their events are indistinguishable from their agent's because `KADENCE_SOURCE` was never set (**Fact** that it is manual) |
| **Design implication** | The second author's first contact is almost always **through their agent**, not the CLI. The section `init` writes is the second author's onboarding; it currently only teaches reading |

### 1.3 The coding agent as a user (P-Agent)

**Who.** Claude Code, Cursor, Codex — possibly several vendors in one repo (door 3). Not a buyer; its failures are experienced by the humans as the product failing.

| | |
|---|---|
| **Job** | At session start, get the live state in a bounded number of tokens; know what to take; record what it decided and learned in a form the next session (any vendor) will read. **Fact** that `prime` (≤ 40 lines, ≤ 3 KB, test), `ready`, `claim`, `note`, `decision` exist for exactly this |
| **Trigger** | `SessionStart` hook (only with `init --hooks`), or the `CLAUDE.md`/`AGENTS.md` section telling it to run `kadence prime` |
| **Must see in the first session** | `prime` succeeds; `schema --json` describes every command it will be told to run; errors carry `code` and `allowed`; output fits context (`--summary`, `--fields`, `ready` 7 fields) |
| **"Abandons" (falls back to reading files or ignoring kadence) when** | binary missing (**Inference**); `schema --json` omits commands it sees in `--help` — 40 entries vs shipped `sprint add/edit/start/list/burndown`, `template *`, `completion`, `ui`, `task parent/unblock/cancel/delete` (**Fact**, inventory §4); the section never tells it that writing a decision is expected (**Fact**); `board --json` in full is 855 KB at 1000 tasks (**Fact**) |
| **Design implication** | Treat the section and `schema --json` as UI. The contract claims "every command"; it must be true before the site generates docs from it (roadmap 0.5) |

### 1.4 The manager / scrum persona (P3 engineering manager, PM, stakeholder) — **not ICP**

**Who.** Strategy §1: P3 engineering manager — "ask for an intro, don't pitch". "Not for": Jira/Linear mandate with nothing in the repo; > 20 developers asking for SSO.

| | |
|---|---|
| **Job** | Know whether the sprint is on track, what things cost, who is overloaded; show stakeholders without a terminal |
| **Trigger** | sprint review, planning, a stakeholder question |
| **Must see in 20 minutes** | burndown, velocity, workload, a page to forward. **Fact:** all exist — `sprint burndown`, `report burndown/velocity/workload`, `report --html`, `board export --html` (much of it unreleased) |
| **Abandons when** | it requires Node and a terminal; no web app, no SSO, no Jira sync (non-goals, **Fact**); only one team's repo is visible |
| **Why this persona is a risk, not a segment** | **Fact:** 1,076 Beads issues and Backlog.md's history contain zero requests for velocity, points or burndown (discovery verdict §3). **Inference:** building for P3 pulls the first-run toward sprints and per-person numbers, which is what the developer (1.2) resists and what the tech lead (1.1) categorised as "Jira in the repo". A manager can be a **reader of an export a lead sends**; they should never shape the first 20 minutes |

**Primary persona: 1.1, the tech lead.** They are the only one who can create the account (the directory) and the only one who can recruit 1.2. 1.3 is served through 1.1's setup choices. 1.4 is served incidentally.

---

## 2. Feature × persona matrix — every capability in the inventory

**Personas:** TL tech lead · Dev second author · Ag agent · Mgr manager (non-ICP). ● primary user · ○ secondary.
**Activation path:** **A1** `init` (± `--hooks`) → **A2** first task / decision → **A3** agent reads via `prime` → **A4** commit + push for the team → **A5** second author writes → *day 14 North Star*. "Daily" = used after activation. "—" = not on the path.
**Verdicts:**
- **Core for ICP** — on the activation path or the reason the ICP hires kadence; foreground it.
- **Supporting** — used once adopted; in `--help` and lower README, not in the first 20 minutes.
- **Present, not advertised** — keep, maintain, fix bugs; no README top, no `init`/`prime` mention, no release-note headline.
- **Noise for ICP** — serves the manager persona or a need this ICP has not shown; keep off every first-run surface; freeze further work until the Oct 19 verdict.

### (a) Capture

| Capability | Ships | TL | Dev | Ag | Mgr | Path | Verdict |
|---|---|---|---|---|---|---|---|
| `task add` (type, priority, estimate, due, label, parent, template) | 0.1 | ● | ● | ● | | A2 | **Core** — but the estimate/velocity nag on add is Noise (§3 R4) |
| `task edit` (+ `$EDITOR`) | 0.1 | ○ | ● | ● | | daily | Supporting |
| Labels as deltas (`--add-label`/`--remove-label`) | 0.4 | ○ | ○ | ● | | daily | Supporting — carries the tech lead's impact-label recipe (feedback Finding 4) |
| `task move`, bulk all-or-nothing | 0.1 | ○ | ● | ● | | A2/daily | **Core** |
| `task assign` | 0.1 | ● | ○ | | ○ | daily | Supporting |
| `task claim` / `release`, contested not locked | 0.4.0 | ○ | ● | ● | | A5 | **Core** for ≥ 2 agents in one repo (door 3) |
| Acceptance criteria `task ac add/check/uncheck/list` | 0.4 | ● | ○ | ● | ○ | daily | Supporting — "what done was measured against" for an agent; no `ac remove` |
| Definition of Done `board config --dod`, `--no-dod` | 0.4 | ● | | ○ | | — | Supporting (engineering-shaped; lands on non-code tasks) |
| `task comment` with `source` | 0.1 / 0.4.1 | ○ | ● | ● | | A5 | **Core** — the README's own example of context ("the redirect drops it") |
| `task log` time correction | 0.1 | | ○ | | ○ | — | Present, not advertised (manual time is a non-goal) |
| Hierarchy `task parent`, `--tree` | 0.1 | ● | ○ | ○ | ○ | — | Supporting |
| Templates `template save/list/delete` | 0.1 | ○ | ○ | | | — | Present, not advertised |
| `task cancel` / `task delete` (append-only honest) | 0.1 | ● | ○ | ○ | | — | Supporting |
| `task list` filters, search, `task show` (history, comments, decisions, notes, claim) | 0.1+ | ● | ● | ● | ○ | A3 | **Core** — `task show --json` is the handoff read |
| `task doc add` create-and-link; `task doc` link | 0.3 / 0.4 | ● | ○ | ○ | | — | Supporting (experiment with a kill condition) |

### (b) Plan

| Capability | Ships | TL | Dev | Ag | Mgr | Path | Verdict |
|---|---|---|---|---|---|---|---|
| Sprints `create/add/edit/start/close/status/list` | 0.1 | ○ | | ○ | ● | — | Present, not advertised — some ICP teams run sprints; never the first-run default |
| `sprint burndown` | 0.1 | ○ | | | ● | — | **Noise for ICP** |
| Milestones `create/add/list/close` | 0.4 | ● | | ○ | ● | — | Present, not advertised |
| Dependencies `task block/unblock`, cycles surfaced | 0.1 | ● | ○ | ● | | daily | Supporting — "why is this blocked" is context; feeds `ready` |
| `ready` | 0.4.0 | ○ | ● | ● | | A3 | **Core** |
| Custom columns `board config --statuses` | 0.1 | ● | | ○ | | A1 (optional) | Supporting — `allowed` in errors depends on it |
| Started boundary `board config --started` | 0.4 | ○ | | | ● | — | **Noise for ICP** (only matters to flow/sprint hours) |
| Branch scope `task list --branch [--base]`, TUI `b` | 0.4 | ○ | ● | ● | | daily | Supporting — reviewer and agent narrowing (3–20×) |
| `stats` (counts, blockers, contested, last-3 velocity) | 0.4 | ○ | | | ● | — | Present, not advertised |

### (c) Decisions and notes

| Capability | Ships | TL | Dev | Ag | Mgr | Path | Verdict |
|---|---|---|---|---|---|---|---|
| `decision add --why --rejected --supersedes --task --doc` | 0.3 | ● | ○ | ● | | A2 | **Core** — the differentiator; the "why" nothing else in the repo holds |
| `decision list [--all]`, `decision show` | 0.3 | ● | ● | ● | ○ | A3 | **Core** |
| `note` / `note list` | 0.4.0 | ○ | ● | ● | | A5 | **Core** — the cheapest write an agent can make, so the likeliest second-author event |

### (d) Agent contract

| Capability | Ships | TL | Dev | Ag | Mgr | Path | Verdict |
|---|---|---|---|---|---|---|---|
| `--json` everywhere, stdout-only JSON, exit codes | 0.1 | ○ | | ● | | A3 | **Core** |
| 15 error codes with `received`/`allowed`/`hint` | 0.2 | | | ● | | A3 | **Core** |
| `schema --json` | 0.2 | ● (evaluation) | | ● | | A3 | **Core**, with a defect: omits ~14 shipped commands (§4 gap 4) |
| `--fields` | 0.2 | | | ● | | daily | Supporting |
| `board --json --summary` | 0.4 | | | ● | | A3 | Supporting |
| `prime` | 0.4.0 | ● | ● | ● | | A3 | **Core** — the demo moment |
| `init --hooks` (SessionStart → `kadence prime`) | 0.4.0 | ● | | ● | | A1 | **Core** |
| `init` writes sections into `AGENTS.md` + `CLAUDE.md`, `.kadence/README.md`, `.gitignore` | 0.1 / 0.2.1 / 0.3 | ● | ● | ● | | A1, A5 | **Core** — the second author's real onboarding; teaches reading only (§4 gap 2) |
| Authorship `KADENCE_SOURCE=agent` → `source` everywhere | 0.1–0.4.1 | ● (audit) | ○ | ● | | A5 | Supporting — needed to tell a teammate from their agent in North Star data; manual |
| `npm run reference` → `dist/reference.json` | UNRELEASED | | | ○ | | — | Present, not advertised (feeds the site's generated docs, roadmap 0.5) |
| MCP server, `kadence context` | not built | | | | | — | Not doing (Probe C) |

### (e) Views

| Capability | Ships | TL | Dev | Ag | Mgr | Path | Verdict |
|---|---|---|---|---|---|---|---|
| `board` plain, `-a me`, `--sprint` | 0.1 | ○ | ● | ○ | ○ | A2 (confirm) | Supporting |
| `ui` TUI (keys, drag, same functions as CLI) | 0.1 + 0.4 | ● (demo) | ● | | ○ | — | Supporting — header leads with sprint and points; no decisions or notes view (§3 R8) |
| TUI `R` ready, `C` claim, `b` branch | 0.4 | ○ | ● | | | daily | Supporting |
| TUI `M` milestone, `s` sprint menu, `S` add to sprint, `t` log time | 0.1–0.4 | ○ | ○ | | ● | — | Present, not advertised |
| `completion [install]` zsh/bash/fish | 0.4 | ○ | ● | | | — | Supporting |

### (f) Reports and analytics

| Capability | Ships | TL | Dev | Ag | Mgr | Path | Verdict |
|---|---|---|---|---|---|---|---|
| `sprint close` velocity, hours, hours/point, carry-over | 0.1 | ○ | | | ● | — | **Noise for ICP** |
| `report flow` (WIP, throughput, p50/p85/p95, aging) | 0.4 | ○ | | | ● | — | Present, not advertised — aging WIP is the one number a lead might pull |
| `report cfd` | 0.4 | | | | ● | — | **Noise for ICP** |
| `report attention` (+ the line in `prime`) | 0.4.4 | ● | ○ | ● | ○ | A3 (via `prime`) | Supporting — the only report tied to ICP evidence (feedback Finding 2: "which work has nobody looking at it") |
| `report --list` | UNRELEASED | ○ | | ○ | ○ | — | Present, not advertised |
| `report burndown` (duplicate of `sprint burndown`, `finalRemaining` fix) | UNRELEASED | | | | ● | — | **Noise for ICP** |
| `report velocity` (low/median/high) | UNRELEASED | | | | ● | — | **Noise for ICP** |
| `report workload` (per owner, unassigned row) | UNRELEASED | ○ | | | ● | — | **Noise for ICP**, and a second-author risk (per-person numbers; assumption #12) |
| Flag strictness DEC-10 | UNRELEASED | | | ○ | | — | Supporting (contract hygiene; keep regardless) |
| `report <name> --html` with inline SVG | UNRELEASED | | | | ● | — | **Noise for ICP** |
| Burnup, time in status, epic rollup, Monte Carlo | not built | | | | ● | — | Frozen (§5) |

### (g) Export and (h) integrations

| Capability | Ships | TL | Dev | Ag | Mgr | Path | Verdict |
|---|---|---|---|---|---|---|---|
| `board export --html` (experiment) | 0.4 | ○ | | | ● | — | Present, not advertised — kill condition "nobody opens it twice" still unmeasured |
| `board export --md [--readme]` | 0.4 | ● | | | ○ | — | Present, not advertised |
| `@kadence/github` one-way publish via `gh` (experiment) | 0.4 line | ○ | | | ● | — | Present, not advertised |
| Claude Code hook | 0.4.0 | ● | | ● | | A1 | **Core** (see (d)) |
| Two-way sync, Jira, importers, editor extensions | not built | | | | | — | Importers gated on Oct 19 (strategy §4); rest not doing |

### (i) Repository safety

| Capability | Ships | TL | Dev | Ag | Mgr | Path | Verdict |
|---|---|---|---|---|---|---|---|
| Conflict-freedom: one file per event, ULID order, 3-branch merge test | 0.1 | ● | ○ | ○ | | A4 | **Core as proof, not pitch** (strategy §1; Probe A: 1 merge in 200) |
| Conflicts surfaced (cycles, orphan columns, pending, contested) | 0.1 / 0.4 | ● | ○ | ● | | daily | Supporting |
| `state.json` cache, gitignored, I6 | 0.1 | | | | | A1 (invisible) | Supporting (invisible) |
| `compact [--keep-months] [--dry-run]` | 0.4 | ● | | | | — | Supporting — later-life; branch caveat undocumented at the point of use (§4 gap 8) |
| Path containment on writes | 0.4 | ○ | | ○ | | — | Supporting (invisible) |
| Supply chain: `--ignore-scripts`, pinned actions, bundle greps | 0.3.2 / 0.4 | ● (evaluation) | | | | A1 (trust) | Supporting — worth one README line for a lead adding a dependency to a shared repo |
| `scripts/kadence.mjs` wrapper | UNRELEASED | | | | | — | Internal (dogfooding this repo); not a product surface |
| `doctor`, fixture corpus, Windows CI, rebase test | not built | | | | | — | Gaps (§4) |

**Tally (Inference, counted from the rows above):** Core 16 (the hook is listed twice) · Supporting 25 · Present, not advertised 12 · Noise for ICP 8 (+ the frozen not-built reports). **All 8 Noise items serve the manager persona; 6 of the 8 were added in the 0.4 line or are unreleased** (`--started`, `cfd`, `report burndown`, `velocity`, `workload`, `--html`).

---

## 3. The ICP edition — what the tech lead should meet

**Principle.** Nothing is removed. The first 20 minutes show only Core; `--help` and README groups show Supporting next; Present-not-advertised and Noise live behind `report --list`, a docs page, and `--help` of their own command.

**The minimal path** (target for the self-serve test, strategy KR 3.4: README only, ≤ 10 min, 4 of 5 people):

```bash
npm install -g kadence
kadence init --hooks                      # sections in AGENTS.md + CLAUDE.md, SessionStart hook
kadence task add "Fix login" --type bug
kadence decision add "Keep sessions in Redis" --why "..." --rejected "JWT: revocation"
# open a new agent session → it runs `kadence prime` and quotes DEC-1 back
git add .kadence AGENTS.md CLAUDE.md .claude/settings.json .gitignore && git commit
# teammate: git pull → their agent session starts → prime → it writes a note
```

**Sizes:** S ≤ half a day · M 1–3 days · L > 3 days, at the owner's engineering hours. **Type:** *Doc/copy* (README, docs, text files) · *Code* (anything in `src/`, including strings the binary prints or writes).

| # | Surface | Today (Fact) | ICP edition | Size | Type |
|---|---|---|---|---|---|
| R1 | **README top and "In practice"** | first block is `sprint create … --estimate 3 … sprint close`; 7-command reports block precedes "For agents"; TUI sample shows sprint and points; stale numbers (803 KB vs 855; 948 vs 982; "898 tests") | Quickstart = the minimal path above, ending with "what your teammate sees". Then: decisions → `prime`/`ready`/`claim` → merge proof → cost table. Sprints, milestones, reports, exports collapse into one "Also in the box" paragraph linking a `docs/reports.md` page. Numbers from `facts.json` | S | Doc/copy |
| R2 | **`init` output** | "kadence is ready. / task add / board / Files were created but not committed" | Four lines: `task add`, `decision add --why`, "`init --hooks` adds `prime` at session start" (only if `.claude/` exists and the hook is absent), "commit `.kadence/`, `AGENTS.md`, `CLAUDE.md` — that is how a teammate's agent finds it". Keep "not committed — that call is yours" | S | Code (copy) |
| R3 | **Section `init` writes into `AGENTS.md`/`CLAUDE.md`** | 7 commands, read-only except `task move`; no fallback if the binary is missing | Add the three writes an agent should make: `task claim`, `note "…"`, `decision add "…" --why`. Add one line: if `kadence` is not found, run `npx kadence@<major.minor> prime` or tell the human to install it. Keep ≤ 25 lines (roadmap guardrail). Version marker already refreshes it on re-`init` | S | Code (template) |
| R4 | **`task add` estimate nag** | always warns about velocity when `--estimate` is absent | Warn only when a sprint is active, and say "sprint", not "velocity" | S | Code |
| R5 | **`prime` empty state** | first line "No active sprint." even when no sprint ever existed | Omit the sprint line when no sprint exists; when there are 0 decisions, one line: `record why: kadence decision add "…" --why "…"`. Length test still holds | S | Code |
| R6 | **`--help` order** | `milestone, note, decision, schema, prime, ready, stats, report, compact, completion, init, task, board, sprint, template, ui` (registration order) | `init, prime, ready, task, decision, note, board, ui, schema` then `sprint, milestone, template` then `report, stats` then `compact, completion`. Registration order first (S); grouped headings in help only if cac allows without a dependency (M) | S (M with headings) | Code |
| R7 | **`.kadence/README.md` agent guide** | lists `sprint status --json` among top commands; no `decision add` | Replace `sprint status` with `decision list --json` and `decision add`; keep `note` | S | Code (template) |
| R8 | **TUI** | header `kadence <sprint> N tasks, M points`; no decisions or notes anywhere in the TUI | Header without a sprint: `N open · M ready · K decisions in force`; points only when estimates exist. A read-only decisions panel is a **candidate** only if pilots open the TUI at all | S header · M panel | Code |
| R9 | **`report --list` order** | flow, cfd, attention, burndown, velocity, workload | attention first; burndown/velocity/workload under a "sprint and team" subheading | S | Code (copy) |
| R10 | **"Adding a teammate" section** (README + `.kadence/README.md`) | does not exist | install; `git pull`; git identity per machine; their agent picks up `CLAUDE.md`; set `KADENCE_SOURCE=agent` in the agent's environment; what the lead should see in `task show` afterwards | S | Doc |
| R11 | **"Removing kadence" section** | does not exist | delete the marked sections (between `kadence:begin`/`end`), the hook entry, the `.gitignore` line; `.kadence/` is yours to keep or delete in git — kadence never deletes it | S | Doc |
| R12 | **Release notes / npm description / site segment copy** | "sprint velocity" heritage in several places (discovery verdict §7 found it in the site repo description) | lead with shared context for teams and agents; reports named once, last | S | Doc/copy |

**Timing, consistent with strategy §4.** Doc/copy rows (R1, R10, R11, R12) are not feature work and can go now; the README drift wording is the precedent (feedback: "should happen regardless of Probe B"). Code rows are first-run fixes (KR 3.5): batch them **after Pilot 0 on Sep 25** confirms or reorders the hesitations, and **only if the Sep 22 execution gate passes** — below 20 touches, "feature work freezes until 40 are sent", and these count as feature work.

---

## 4. Gaps for the buyer persona, ranked

**Framework: ICE**, per `product-prioritization`: pre-PMF, one maintainer, no usage data → RICE's Reach cannot be estimated honestly; ICE is fast and its Confidence column makes the absence of interviews visible. **Impact** is scored against the activation path and the day-14 second author (1–10). **Confidence** is low by default (no interviews); it rises only where the defect is a Fact in the code. **Ease** inverts size. Score = I × C × E. Scores order work; gates in strategy §4 and roadmap G1–G7 still override them (Windows is a 1.0 gate whatever its score).

| Rank | Gap | Evidence | I | C | E | ICE | Size · type | Recommendation |
|---|---|---|---|---|---|---|---|---|
| 1 | **A teammate's agent meets `kadence: command not found`.** The hook runs a bare `kadence prime` ([init.ts:84](../../src/cli/commands/init.ts)); the section assumes the binary; nothing tells a second machine to install | **Fact** (code); **Inference** that most second machines lack a global install | 9 | 7 | 8 | **504** | S · code + doc | R3 fallback line + R10 teammate section |
| 2 | **The agent is never told to write the why.** The section and `.kadence/README.md` teach reading; `decision add` and `note` — the likeliest second-author events — are absent from the section | **Fact** (scratch `init` output) | 8 | 7 | 9 | **504** | S · code (template) | R3, R7 |
| 3 | **The first run is sprint-first** (`prime` "No active sprint", velocity nag, README sprint block, TUI header, `--help` order) | **Fact** (§0 table); **Inference** it triggers the "Jira in the repo" reading | 7 | 6 | 9 | **378** | S each · code + doc | R1, R4, R5, R6, R8 header |
| 4 | **`schema --json` omits ~14 shipped commands** while the section says "it lists every command"; the 0.5 generated docs would inherit the hole | **Fact** (40 entries vs `--help`) | 5 | 9 | 7 | **315** | S–M · code (additive within `kadence/v1`) | add entries; a test that every `--help` command has a schema entry |
| 5 | **No removal path.** Sections in two shared files, a hook in the user's settings, a `.gitignore` line — reversibility is an adoption factor for a lead editing shared conventions | **Fact** (no command, no doc); **Assumption** that it matters to the decision | 6 | 5 | 8 | **240** | S doc · M code (`init --remove`, touches only marked sections and the hook, never `.kadence/`) | doc now (R11); code only if a pilot asks |
| 6 | **"Second author" is ambiguous in the data.** Agent and human share `user.email`; one person on two machines with different emails reads as two authors (SPEC §9 open question) | **Fact** (ADR-011, git.ts:36) | 5 | 6 | 6 | **180** | S doc · M code | North Star script counts `source` and flags email pairs; R10 tells people to align `user.email` |
| 7 | **`KADENCE_SOURCE` is manual**, so agent writes land as human unless someone sets it | **Fact** | 4 | 5 | 8 | **160** | S · doc | R10; detecting a vendor env var would break "never guessed" — needs an ADR, not a patch |
| 8 | **Compaction on two branches** can collide (a month archive is one file); the caveat is in CHANGELOG, not at the command | **Fact** | 3 | 6 | 8 | **144** | S · code (warning in `compact` output) + doc | print the caveat on every non-dry run |
| 9 | **No setup check** — nothing verifies binary on PATH, hook present, section version current, `.gitignore` line, readable events after a bad merge | **Fact** (no `doctor`; roadmap puts it Later) | 5 | 4 | 7 (setup-only) | **140** | M setup-only · L full `doctor` | a setup-only subset belongs in 0.5 if pilots hit gaps 1–2; full rebuild/verify stays Later (G5) |
| 10 | **Humans in the TUI never see decisions or notes** | **Fact** (no reference in board.ts) | 4 | 5 | 5 | **100** | M · code | wait for pilot evidence that anyone opens `ui` |
| 11 | **DoD is engineering-shaped; no `task ac remove`** | **Fact** (CHANGELOG notes) | 2 | 7 | 7 | **98** | S · code (additive event) | after pilots |
| 12 | **Windows**: no CI, no `win32`/path-separator handling found in `src/` | **Fact** (grep 2026-09-16, CI matrix); **Assumption** that early ICP teams are mostly macOS/Linux | 4 | 4 | 5 | **80** | S (CI job to learn) · M–L (fixes unknown) | add the CI job to *learn*; ask OS in the pilot screener; fixes gated by G4, not by pilots |

**Not gaps for this persona** (checked): `labels` in `ready --json` shipped in 0.4 (the tech lead's read-side ask); network, daemon, account — none, by design; conflict-freedom — proven.

---

## 5. Scope creep check — 0.3 → working tree

**Facts.** Strategy §1: "Velocity and reports: present, not advertised. In no headline." Discovery verdict §3: zero requests for velocity, points or burndown in 1,076 Beads issues and Backlog.md's history. Strategy §5 scorecard row 12: **27 `src/` commits vs 0 touches**, Sep 8–16. Strategy §9 pre-mortem: "feature freeze until Oct 19 except bug fixes". Feature adoption (Sep 9) moved 0.4 ahead of Probe B "for the second time", on the argument that neighbours' users already use those features daily — an argument that covers `ready`/`prime`/`claim`/AC, and **does not** cover the reports, which no neighbour's user asked for.

| Added | When | Strategy / evidence | ICP verdict | Recommendation until Oct 19 |
|---|---|---|---|---|
| `decision`, `task doc`, `source` on decisions | 0.3.0–0.3.1 | the "why" layer; positioning core | Core | Headline. Fix gaps 2, 4 |
| `ready`, `prime`, `init --hooks`, `claim`, `note` | 0.4.0 | feature adoption, from Beads | Core | Headline. Fix gaps 1–3 |
| AC + DoD, `task list --branch`, `--summary`, labels as deltas, `completion` | 0.4.1 | adoption / agent contract | Supporting | Keep; bug fixes only |
| Milestones, `stats` | 0.4.1 | adoption (Backlog.md) | Present, not advertised | Demote from README "In practice" |
| `board export --html/--md`, `@kadence/github`, `task doc add` | 0.4.2 experiments | three former "no"s with kill conditions | Present, not advertised | **Freeze.** Measure the kill conditions in pilots; no extensions |
| `report flow`, `report cfd`, `board config --started`, `compact` | 0.4.3 | reports discovery | flow/compact present or supporting; cfd/started Noise | **Freeze** further analytics |
| `report attention` + `prime` line | 0.4.4 | tech-lead feedback Finding 2 | Supporting | Keep; it is the one report that may become product if Probe B hears "attention", not "context" |
| `report burndown/velocity/workload`, `report --list`, `report --html`, SVG | **Unreleased** (Sep 14–16) | none from the ICP; built during the window the pre-mortem marks as "shipping replaces talking" | **Noise for ICP** (`--list` and DEC-10 strictness: present / supporting) | **Freeze and demote.** Do not cut a release whose notes lead with them. Ship inside 0.5 below the fold, under a "sprint and team reports" heading. Do not build burnup, time in status, epic rollup or Monte Carlo — remove them from "next gaps" wording until a pilot asks |
| `report workload` specifically | Unreleased | assumption #12 (surveillance), feedback Finding 3 ethics counterweight | Noise + second-author risk | Keep "no hours, no capacity, no ranking" as a written rule; never mention it in `prime` or README top |
| `npm run reference` → `reference.json` | Unreleased | roadmap 0.5 generated docs (G6) | Present, not advertised | Keep; blocked in value by gap 4 |
| `scripts/kadence.mjs`, dogfooding | Unreleased | CLAUDE.md "kadence runs on kadence" | Internal | Keep — cheapest bug source (two bugs day one) |

**Inference.** Nothing needs deleting: the cost of the Noise items is already paid, and removing code would not buy a conversation. The cost that remains is **attention** — on the README, in `--help`, in release notes, and in the owner's calendar. The recommendation is therefore a freeze on *new* manager-facing capability plus a demotion on *surfaces*, which strategy.md already mandates in its own words.

**What would reverse this.** Probe B hears managers or tech leads ask unprompted for "is this sprint on track" or "who is overloaded" (then P3 moves toward ICP and §1.4 is rewritten); or the Oct 19 verdict hears attention rather than context loss (then `report attention` becomes the product and `prime`'s attention line its surface — feedback "What would make this reading wrong").

---

## 6. Version framing — what 0.5 should be for the ICP

**Today's roadmap 0.5 is "the ecosystem"** (generated docs, Homebrew tap, Probe E, skill package; metric README-to-`init` > 5%). **Fact.** It targets strangers arriving from search. Strategy KR 3.4 and assumption N2 target something narrower and earlier: a lead installs alone, and a teammate becomes the second author without the owner pushing.

**Recommendation: 0.5 = "the second-author release".**

> **Enable** a tech lead **to** go from README to an agent quoting the team's first decision back in ≤ 10 minutes, and a teammate's agent on another machine **to** read and write the same journal without anyone explaining it, **so that** the second author appears without the owner in the room.

| | Contents | Source |
|---|---|---|
| **Must** | R1–R7, R9–R12 (copy and S code); gaps 1–4; R8 header only | §3, §4 ranks 1–4 |
| **Should** | gap 6 (author counting doc + North Star script), gap 7 doc, gap 8 warning; Windows CI job to learn; roadmap 0.5's generated docs **after** gap 4, and the ≤ 60-line `SKILL.md` built from the same section as R3 | §4; roadmap 0.5; plan T65 |
| **Won't (in 0.5)** | any new report, export or integration; importers (0.6, gated Oct 19); MCP; full `doctor`; TUI decisions panel unless a pilot asks; Homebrew tap before the notability threshold | §5; strategy §4, §8 |
| **Metric** | self-serve test **4 of 5** in ≤ 10 minutes (KR 3.4); **≥ 2 of 3** pilots with a second author at day 14 (KR 3.3); 0 "command not found" in pilot day-7 check-ins | strategy §3 |
| **Timing** | copy now; code batched after Pilot 0 (Sep 25) and a passed Sep 22 gate; **cut by ~Nov 6** so the Nov 13 self-serve test and the single Show HN (Nov 17) run on the build a stranger installs | strategy §4 |
| **Unreleased reports** | ride along in 0.5 below the fold, not as its headline | §5 |

**If Oct 19 says "stop" (0 stories, 0 workarounds).** Strategy §4: Next shrinks to importers; the product is a conflict-free journal for switchers. 0.5 still ships R1–R7 minus the agent-writing emphasis, with conflict-freedom promoted from proof to headline — and reports still not the pitch, because the switcher audience asked for none (discovery verdict §3).

---

## 7. What this document cannot tell you

- **Whether any of the four personas exists as drawn.** Zero interviews. §1's jobs, triggers and abandonment reasons are hypotheses shaped by strategy.md and one n = 1 conversation with someone who never ran the tool.
- **Whether a tech lead cares about removal, or a developer about `report workload`.** Both are adoption assumptions to put into the interview script's "what would stop you" probe, not facts.
- **How the TUI reads to a stranger.** The TUI was not opened for this review (CLAUDE.md: it is verified by hand); R8 is based on the header string in code.
- **Scores are ordinal.** ICE with Confidence ≤ 7 everywhere means the ranking is a bet about order, not a measurement of value. Re-score after Pilot 0 and again after Oct 19.

## Evidence to collect, mapped to the next events

| Event | Ask / observe | Settles |
|---|---|---|
| Pilot 0, Sep 25 (KR 3.1) | log where the lead hesitates; does the agent quote the decision; what the teammate's machine does on first session | §3 order, gaps 1–3 |
| Probe B interviews, to Oct 16 | "last time a teammate's agent redid something already decided"; "what would make you take a tool out of `CLAUDE.md`"; "who asks you for sprint numbers" | §1.1 abandonment, gap 5, §1.4 status |
| Pilot day 7 / day 14 | authors and `source` in the journal; any `command not found`; has anyone opened an HTML export twice | North Star, gaps 1, 6, 7; export kill condition |
| Self-serve test, Nov 13 (KR 3.4) | time to `task add` and to an agent running `prime` | 0.5 metric |
