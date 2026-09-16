# Competitive Research Snapshot

- **Date:** 2026-09-16 · **Replaces:** the 2026-09-02 snapshot (Ukrainian; Backlog.md, git-bug, git-issues). Same schema, so the two can be diffed.
- **Mode:** Just Enough — four players that a 3–8 team with coding agents actually weighs. The full capability matrix across seven tools, including Spec Kit, git-bug and Linear/Jira via MCP, is in [feature-gap.md](feature-gap.md).
- **Labels:** **Fact** (primary source or measured) · **Inference** (our reading) · **Assumption** (unevidenced, load-bearing). Every URL accessed 2026-09-16.

## 1. Scope

**Company/product:** kadence 0.4.1 (npm, 2026-09-13) — a journal of a team's work in the repository: tasks, decisions, notes and claims as append-only events beside the code, with an agent contract.
**Category:** shared context of a team and its agents, in the repo ([strategy §1](../product/strategy.md)). Not "git-native tracker", not spec-driven development, not agent memory.
**Decision supported:** (1) positioning wording before the first outreach batch and the Nov 13 article; (2) what the owner says **after** an interviewee has told their story, in pilot offers and in the switcher path — the talk tracks in §5. It does not reorder the roadmap.
**Competitors analyzed:** Beads · Backlog.md · Claude Code's own Tasks + Auto Memory · ai-memory

**Why these four, and what left.**

| Player | Why in | Confidence |
|---|---|---|
| Beads | Category leader for agent-first tracking; its users' complaints are our best evidence (discovery verdict §2). 27,188 stars, 22,789 npm downloads/30 d ([GitHub](https://github.com/gastownhall/beads), [npm API](https://api.npmjs.org/downloads/point/last-month/@beads/bd)) | high |
| Backlog.md | Most-installed human-first tracker in the repo: 57,360 downloads/30 d ([npm API](https://api.npmjs.org/downloads/point/last-month/backlog.md)); door 2 of the strategy | high |
| Claude Code Tasks + Auto Memory | The default an ICP team already has, at zero install cost ([docs](https://code.claude.com/docs/en/memory)) | high |
| ai-memory | The only player that says "works for a team" and cross-vendor handoff in its first screen ([README](https://github.com/akitaonrails/ai-memory)); 6,965 stars | medium — traction measured in stars only |
| ~~git-issues~~ | **Out.** 17 stars, no push since 2026-05-06 (GitHub API). The 2026-09-02 "maturity unknown" assumption resolves: not a threat | high |
| ~~git-bug~~ | **Moved to feature-gap.** Bug tracker, last release 2025-05-19, not aimed at agents | high |
| Spec Kit, Linear/Jira via MCP | **In feature-gap only.** Adjacent layers: specs, and the SaaS a team is leaving or never left | high |

## 2. Competitor Snapshots

### Competitor: Beads

- **Positioning:** "Distributed graph issue tracker for AI agents, powered by Dolt"; "a persistent, structured memory for coding agents" — **Fact** ([README](https://github.com/gastownhall/beads))
- **Relevant capability:** v1.3.0 (2026-09-15) adds an HTTP API server `bd serve` with bearer tokens (41 operations), claim **leases** with `heartbeat`/`reclaim`, compare-and-set updates, `bd sync` for Dolt federation, an opt-in events journal, and `--brief` output measured 93.4% smaller. `bd ready`, `bd prime`, `bd remember`, `bd setup claude|codex|cursor` remain the agent loop — **Fact** ([v1.3.0 release notes](https://github.com/gastownhall/beads/releases/tag/v1.3.0))
- **Likely strength:** the most complete multi-agent coordination in the category (atomic claims that expire, CAS, typed exit codes) and the audience: most stars, a docs site, Homebrew/npm/PyPI, Windows — **Fact** (features, distribution) + **Inference** (that coordination depth wins agent-fleet users)
- **Likely weakness:** state is a database, not files. "Dolt is the only storage backend"; `issues.jsonl` is "an export for viewers and interchange, not the source of truth"; the new events journal is "clone-local … never versioned, never pushed or federated". Upgrading from v1.2.2 runs ~28 migrations and requires a backup first. The markdown-backend RFC was closed *not planned* ([#158](https://github.com/gastownhall/beads/issues/158)) — **Fact** (release notes, README) + **Inference** (the Dolt-pain users of [#2573](https://github.com/gastownhall/beads/issues/2573), 38 reactions, remain unserved by Beads itself)
- **Key source URL:** https://github.com/gastownhall/beads/releases/tag/v1.3.0

### Competitor: Backlog.md

- **Positioning:** "A tool for managing project collaboration between humans and AI Agents in a git ecosystem" — **Fact** ([README](https://github.com/MrLesk/Backlog.md))
- **Relevant capability:** Markdown file per task; CLI, TUI, local web UI; optional MCP for Claude Code, Codex, Gemini CLI, Kiro, Cursor (CLI instructions are now the default); acceptance criteria and Definition of Done; decisions and docs; milestones and due dates; transitive dependency graph with cycles rejected (v1.51.0, 2026-09-02); `task list --json --watch` (v1.52.0, 2026-09-12) — **Fact** ([releases](https://github.com/MrLesk/Backlog.md/releases))
- **Likely strength:** the widest human surface (TUI + web + MCP) at the highest install volume, shipping a minor release every one to three weeks, with outside contributors — **Fact**
- **Likely weakness:** mutable files with **sequential IDs kept by choice**: "A random or collision-free ID mode is not planned" ([#711](https://github.com/MrLesk/Backlog.md/issues/711), closed 2026-07-10); PR #749 shipped diagnosis and recovery, not prevention; an ID-reuse bug is open ([#997](https://github.com/MrLesk/Backlog.md/issues/997)); atomic claims requested and open ([#937](https://github.com/MrLesk/Backlog.md/issues/937)); CLI reads became local-only, so other-branch tasks are invisible outside the web UI (v1.50.1). The official workflow still says small tasks "without conflicts" — conflict avoidance by behaviour — **Fact**
- **Key source URL:** https://github.com/MrLesk/Backlog.md/issues/711

### Competitor: Claude Code Tasks + Auto Memory

- **Positioning:** "Each Claude Code session begins with a fresh context window. Two mechanisms carry knowledge across sessions" — CLAUDE.md and auto memory — **Fact** ([memory docs](https://code.claude.com/docs/en/memory))
- **Relevant capability:** auto memory on by default, `MEMORY.md` index (first 200 lines or 25 KB loaded), typed memories including `project` "decisions that Claude can't derive from the code"; shared across worktrees of one repo. Tasks under `~/.claude/tasks/`, shareable between sessions with `CLAUDE_CODE_TASK_LIST_ID`; agent teams (experimental) share a task list with dependencies and self-claim — **Fact** ([memory](https://code.claude.com/docs/en/memory), [.claude directory](https://code.claude.com/docs/en/claude-directory), [agent teams](https://code.claude.com/docs/en/agent-teams)); env var per [VentureBeat](https://venturebeat.com/orchestration/claude-codes-tasks-update-lets-agents-work-longer-and-coordinate-across) (secondary)
- **Likely strength:** zero install, zero decision; it captures without being asked — **Fact** (default on) + **Inference** (the bar every add-on must clear)
- **Likely weakness:** "Auto memory is machine-local … Files are not shared across machines or cloud environments"; Claude only — the docs say "Claude Code reads `CLAUDE.md`, not `AGENTS.md`", so other vendors do not see it. A teammate cloning the repo gets none of it — **Fact** (docs). **Note:** this contradicts the "AGENTS.md fallback" cited in [discovery verdict §7](discovery-verdict-2026-09.md); kadence writing both files is unaffected, but ADR-009's revisit note should use the official wording
- **Key source URL:** https://code.claude.com/docs/en/memory

### Competitor: ai-memory

- **Positioning:** "Long-term memory for AI coding agents. Quit Claude Code mid-task, start OpenAI Codex in the same directory, continue without re-explaining" — **Fact** ([README](https://github.com/akitaonrails/ai-memory))
- **Relevant capability:** one Rust binary running an MCP/HTTP server; lifecycle hooks capture prompts and tool calls "silently"; session-end consolidation into a git-backed Markdown wiki; typed handoffs "claimed exactly once"; 20+ harnesses; team mode with multi-user auth, per-person attribution and an audit log, "not a paid tier"; zero LLM calls on the default path. v2.2.2 on 2026-09-15 — **Fact**
- **Likely strength:** it answers the attention problem kadence cannot: nobody has to remember to write. And it now speaks our segment's words — cross-vendor, cross-machine, team — **Fact** (claims) + **Inference** (overlap with our pitch)
- **Likely weakness:** requires running and securing a server ("the default quick-start has no authentication"); the wiki lives in the server's data directory, not in the project repository, so it does not travel in the PR or survive `git checkout`; it is recall over sessions, not a structure of tasks, claims and decisions. Stars are the only traction signal found — **Fact** (architecture) + **Inference** (weakness for teams that refuse infrastructure) · evidence quality medium
- **Key source URL:** https://github.com/akitaonrails/ai-memory

## 3. Quick Comparison

| Dimension | kadence | Beads | Backlog.md | Claude Code Tasks + Memory | ai-memory |
|---|---|---|---|---|---|
| Target customer | Team of 3–8 with agents from ≥ 1 vendor, shared repo | Agent fleets and power users; multi-replica setups | Developers + agents who want a board and web UI | Every Claude Code user, one person, one machine | Individuals and teams across agent vendors, willing to self-host |
| Core use case | Shared, versioned history of work and decisions beside the code | Dependency-aware work queue for agents with atomic coordination | Task decomposition and review with humans in the loop | Carry preferences and ongoing work between one user's sessions | Automatic capture and cross-agent handoff |
| Main strength | Plain files in the commit; merge without resolution; nothing to run; `report attention` | Coordination depth (leases, CAS, sync), audience, distribution | Human surfaces and install volume, fast release cadence | Zero cost to adopt; captures on its own | Nobody has to write; vendor-neutral; team features free |
| Main weakness | Only knows what is written; no capture; claims unlocked; 0 external users; Node ≥ 20 | Database as source of truth; heavy upgrades; events journal not versioned | Sequential IDs by choice; mutable files; no atomic claims | Machine-local; Claude only | A server to run and secure; memory outside the repo |
| Evidence quality | High for mechanism (tests, probes); **none** for demand | High — release notes, issues with reactions, downloads | High — releases, closed issues with stated reasons, downloads | High — vendor docs | Medium — README claims, stars; no usage or complaints found |

## 4. So What?

### Product strategy implications

1. **Say "versioned" and "in the commit", not "append-only" and not "journal".** Beads now has an events journal and ai-memory has an audit log, so neither word distinguishes us. What only kadence has is history that is **pushed with the code, reviewed in the PR and restored by `git checkout`**. — **Fact** (Beads v1.3.0: journal "never versioned, never pushed"; ai-memory: wiki in server data dir), high confidence · [Beads notes](https://github.com/gastownhall/beads/releases/tag/v1.3.0)
2. **"Nothing to run" is now the widest gap, and it grew this week.** Beads shipped a bearer-token HTTP server and a 28-migration upgrade; ai-memory is a server by design. Lead the switcher talk track with what a lead does *not* have to operate. — **Fact** (both READMEs/notes) + **Inference** (that the ICP values it: the Beads upkeep complaints are from users, not from the ICP), medium confidence
3. **Stop implying kadence fixes attention; pair the mechanism with `report attention` and say the limit.** The one tech lead heard, and ai-memory's hook capture, both point at the same weakness: a journal is only as good as what gets written. Positioning already says "it only knows what gets written to it" — keep that clause in every long-form piece. — **Fact** ([tech-lead feedback](tech-lead-feedback-2026-09-10.md)), high confidence

### Competitive risks

1. **ai-memory converges on our segment from the other side.** Cross-vendor, cross-machine, team, plain Markdown, free — and automatic. If it adds a repo-local mode (the wiki is already git-backed files), the "in the repo" difference shrinks to structure: tasks, claims, decisions. — **Inference**, medium confidence · [README](https://github.com/akitaonrails/ai-memory)
2. **Anthropic makes auto memory team-shared.** `autoMemoryDirectory` is already configurable from a project's settings (absolute path or `~/` only today). A repo-relative option would give Claude-only teams a shared memory at zero install cost. — **Fact** (setting exists) + **Inference** (direction), medium confidence · [memory docs](https://code.claude.com/docs/en/memory)

### Product opportunities

1. **Backlog.md teams with more than one writer are the sharpest switcher pool.** The maintainer closed collision-free IDs as not planned and ships recovery instead; atomic claims (#937) are open. kadence's ULID identity and contested claims are exactly the declined proposals, already built. — **Fact** ([#711](https://github.com/MrLesk/Backlog.md/issues/711), [#937](https://github.com/MrLesk/Backlog.md/issues/937)), high confidence on the gap, **Assumption** on willingness to switch
2. **Beads users who want files back still have no home in Beads.** The markdown-backend RFC is closed not planned; the Dolt complaint cluster stands. The `/from-beads` fake door (strategy O6) targets them directly. — **Fact** ([#158](https://github.com/gastownhall/beads/issues/158), [#2573](https://github.com/gastownhall/beads/issues/2573)), medium confidence that they have not already moved elsewhere

### Assumptions to validate

1. **A second author's agent writes to the journal without being pushed.** Every competitor with team traction either captures automatically or coordinates through a server; kadence relies on instructions in `AGENTS.md`/`CLAUDE.md` and `prime`. — **Assumption**, critical · pilots, day 7 and day 14 (strategy KR 3.3)
2. **The ICP prefers "nothing to run" over automatic capture.** If interviewees would rather host a server than ask agents to write, ai-memory's shape beats ours. — **Assumption**, critical · Probe B: ask what they did the last time context was lost, and what they already run
3. **Claude-only teams feel the machine-local limit.** If a 3–8 team uses only Claude Code and one shared machine or cloud sessions, native memory may be enough. — **Assumption**, high · screener question: vendors and machines per repo

## 5. Talk tracks

For use **after** an interviewee has told their story, in pilot offers, and on switcher pages — never as an opener. Interviews follow [strategy §2](../product/strategy.md): quote their words, do not name kadence or say "context loss", "journal" or "drift" first. Never say a competitor is wrong; "Beads proved the category".

| When they say… | Say | Proof to offer | Do not say |
|---|---|---|---|
| "We use Claude's memory / CLAUDE.md" | "That works for you on your machine. What does your teammate's session know about what your agent decided yesterday?" | Claude Code docs: auto memory "is machine-local"; `prime` output from this repository | "Claude's memory is broken" |
| "We tried Beads" | "Beads nailed `ready` and `prime` — we took both. The difference is where the truth lives: files in your commit, nothing to migrate or run." | a merge of three branches in every order with identical state; `git checkout` of an old commit | anything about Dolt quality |
| "We use Backlog.md" | "Have two people or an agent and a person ever created tasks at the same time on different branches? What happened to the numbers?" | ULID identity, `KAD-N` derived; contested claims | "their IDs collide" before they say it |
| "We run a memory server" (ai-memory or similar) | "What does it cost you to keep it running and secured? What happens to that memory when someone checks out last month's commit?" | zero-server install in 20 minutes; history in the PR | "memory servers are overkill" |
| "Things drift because nobody watches them" | "Agreed — a tool cannot make anyone look. It can show what nobody touched: stalled, unowned, stale claims, dead blockers." | `report attention` on their pilot repo at day 7 | "the board never drifts from reality" |
| "We have Jira / Linear, the agent reads it through MCP" | Not a fit unless work already happens in the repo — thank them, ask for an intro to someone who moved work next to the code | — | a comparison pitch (ICP "Not for") |
| "Is this Jira in the repo?" | "Closer to the team's lab notebook: what was decided, what was rejected, who has what — the board is folded from it." | `decision show` with `--rejected` | "a better tracker" |

## 6. Change log vs 2026-09-02

| 2026-09-02 | 2026-09-16 |
|---|---|
| Competitors: Backlog.md, git-bug, git-issues | Beads, Backlog.md, Claude Code native, ai-memory; git-issues out (17 stars), git-bug to feature-gap |
| "Only defensible difference: append-only event journal" | Narrowed: **versioned, pushed, in the commit** — Beads now has a (clone-local) events journal |
| "Second differentiator: sprints and velocity" | Withdrawn — 0 requests in the category; present, not advertised |
| Risk: competitors have a TUI and we plan it for v0.1b | Closed — TUI, `ready`, claims, criteria, milestones ship in 0.4.1 |
| Opportunity: Backlog.md fixes conflicts before we get an audience | Their maintainer declined collision-free IDs (not planned, 2026-07-10) |
| Assumption: conflicts are felt in practice | Measured: 15% of repos, ~1 merge in 200 — real, rare; proof, not pitch |
| New | Attention and automatic capture are the gap every team-oriented competitor answers and kadence does not |

---

## Next step

1. Competitive battle card (Backlog.md and Beads switchers)
2. Executive comparison matrix
3. Product risks and opportunities for the next two quarters
4. **Discovery questions that validate the three assumptions in §4** ← recommended; they map to the Oct 19 gate
