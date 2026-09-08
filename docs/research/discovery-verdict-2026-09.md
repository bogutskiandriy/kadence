# Discovery verdict — does kadence make sense, and where exactly

- **Date:** 2026-09-08
- **Question:** does this product deserve to exist, and if so for whom. If not, say so plainly.
- **Decision this supports:** whether to keep building toward 1.0 ([roadmap](../product/roadmap-to-1.0.md)), and which segment [Probe B](interview-script.md) recruits from.
- **Method:** desk discovery, no interviews. GitHub code search and issue search via the API (counts are exact for public repositories on the day), npm download counts, web search. Labels: **Fact** (measured or stated by a primary source) · **Inference** (our reading) · **Assumption** (unevidenced, load-bearing).
- **What this is not:** a substitute for Probe B. It answers "is there a there there" from the outside. Whether a specific team will change its habits is still a conversation, not a search.

## The verdict, first

**Yes, narrowly. The product makes sense as one thing: the plain-file, append-only, zero-dependency work journal for repositories where more than one human or more than one agent vendor works.** The users of the category leader asked for exactly that shape, in their own words, and lost it. Nobody with an audience occupies it.

**No, clearly, as three other things it has flirted with being:**

1. **Not a sprint-velocity product.** In 1,076 open issues on Beads and the whole issue history of Backlog.md there is not one request for velocity, story points or burndown. The audience that keeps work in a repository next to agents does not come for that. Keep the feature; stop leading with it anywhere, including the site repository's own description, which still says "sprint velocity in your git repo".
2. **Not a "memory for coding agents" product.** That category has six projects above 5,000 stars, one at 28,000 created in February. They do semantic recall over everything the agent saw. We do a structured journal of work and decisions. Competing on their axis is invisibility.
3. **Not a solo-developer tool.** Claude Code's Auto Memory, Auto Dream and Tasks now cover the single person on the single machine. Our value appears only when a second human, a second machine or a second vendor reads the same history. A solo developer is a user we accept, not a segment we pursue.

## 1. The problem is real and it is loud

- **Fact.** Repositories on GitHub with a root `AGENTS.md`: **482,304** (code search, 2026-09-08). With Spec Kit's `.specify/constitution.md`: **11,776**. With a Beads `.beads/issues.jsonl`: **3,272**. With a Backlog.md `backlog/config.yml`: **458**. With a `.claude/tasks.md`: **2,512**. With a `.kadence/README.md`: **0**.
- **Fact.** npm downloads, 2026-08-08 to 2026-09-06: `backlog.md` **58,907**, `@beads/bd` **23,458**, `git-issues` **2,078**, `kadence` **102**.
- **Fact.** "Memory for coding agents" on GitHub by stars: agentmemory **28,166** (created 2026-02-25), Beads **26,974**, context-mode **21,281**, engram **6,421** (2026-02-16), ai-memory **6,099** (2026-05-21, "handoff between different agent vendors"), byterover **4,956**. Spec Kit: **134,084**.
- **Fact.** Anthropic shipped Tasks in January 2026 (persistent under `~/.claude/tasks/<id>/`, shared between sessions that set the same `CLAUDE_CODE_TASK_LIST_ID`, with dependencies and claims), Auto Memory in February, Auto Dream from March. Sources: [DEV Community](https://dev.to/simone_callegari_1f56a902/claude-code-new-tasks-persisting-between-sessions-and-swarms-of-agents-against-context-rot-5dan), [VentureBeat](https://venturebeat.com/orchestration/claude-codes-tasks-update-lets-agents-work-longer-and-coordinate-across), [gist on persistence](https://gist.github.com/michaelewens/ce1932e6dd008fb7ac5e98d697fd4521).
- **Inference.** "Work next to the code, readable by agents" is not a bet any more; it is a category with a leader at 134k stars and two trackers at 20–60k installs a month. "Agents forget" is not a bet either; the vendor itself shipped three features for it in three months. What remains open is *which shape* of the answer wins for a team.

## 2. What the leader's users asked for, in their words

All from the Beads issue tracker, ranked by reactions. Beads is the only tracker in the category built for agents first, so its complaints are the best available map of what agent-first teams want.

| Reactions | Issue | What it says |
|---|---|---|
| 38 | [Moving to dolt pretty much made beads unusable for me](https://github.com/gastownhall/beads/issues/2573) | "My experience with beads was great with sqlite. Ever since the move to dolt, nothing works. Tasks disappear." |
| 25 | I want to love Beads but the AI generated docs make it impossible | documentation volume as a barrier |
| 17 | Beads feels painful to use | "I spend a bunch of time caring for beads itself instead of doing beads" — an itemised ~10 hours of install, daemon, migration and corruption debugging |
| 4 | Dolt migration breaks atomic code+issues-in-same-commit model | "One of beads' killer features was that issues lived in git as JSONL — code changes and issue updates could be in the same commit, same branch, same PR. Everything was atomically in sync." Asks: "is the in-repo atomic model still a goal?" |
| 2, 12 comments | Beads approach to merge conflicts? + RFC for markdown backend | "in 99% of use cases I don't need the SQLite DB… I'd be fine with a dumber representation that is friendly to conflict resolution… 'dumb as bricks' backend which I can access from a million places and not corrupt, and merge easily when it diverges." A working branch exists. |

- **Fact.** A community Rust port froze the pre-Dolt SQLite+JSONL architecture at 1,075 stars ([tomrochette.com](https://tomrochette.com/agents/beads)).
- **Inference.** Three of our founding properties — files are the source of truth and travel in the same commit as the code; no daemon and no second database; merges that need no resolution — are the three things these users say they lost. That is the strongest external evidence this project has, stronger than Probe A, because it is demand stated by the people who already adopted the category.

Backlog.md, the human-first tracker, shows the other half:

| Reactions | Issue | What it says |
|---|---|---|
| 0, 4 comments | [Collision-free task ID mode — sequential IDs inherently collide across git clones](https://github.com/MrLesk/Backlog.md/issues?q=Collision-free) | "We hit this in production twice (team of humans + a server-side agent creating tasks concurrently): same `MEM-N` allocated to two different tasks." Proposes random IDs "because they need zero coordination" |
| 1 | Add Git-backed atomic task coordination | two agents claim the same task before either pushes; proposes CAS over custom refs |
| — | `task edit` loses concurrent writes silently | lost update on the edit path |

- **Inference.** This is Probe A's finding seen from inside: conflicts are rare, and when a team runs humans plus a server-side agent they happen "in production twice" and produce silent wrong references. Our ULID-primary, label-derived identity (I7) is their proposal, already built.

Spec Kit's most-reacted feature request after folder layout: `/speckit.reconcile` to close **artifact drift** after implementation (24 reactions). **Fact.** Drift is a stated pain in the spec layer; an append-only journal does not drift by construction. **Inference**, unchanged from the [positioning review](../product/positioning-review-2026-09.md).

## 3. What nobody asked for

- **Fact.** Searching Beads' 1,076 open issues and its closed history for `sprint`, `velocity`, `time tracking`: zero requests. Backlog.md: "Time Logging" (1 reaction, closed), "deadline/due date" (2, closed), "roadmap / milestones" (1). Nothing on velocity.
- **Fact.** Vendor content claims "78% of Scrum teams use story points" ([2026 marketing pages](https://asana.com/resources/sprint-velocity)); none of it is about this audience.
- **Inference.** The segment that keeps work in a repository with agents does not measure itself in points. Sprint analytics is a feature some of them will use once it is there; it is not a reason any of them will arrive. The positioning already demoted it to "a consequence"; this demotes it further, to "present, not advertised".

## 4. Who serves the gap, and how small they are

- **Fact.** Plain-file, in-repo decision or memory projects found: `dropout-developer/decisions.md` — "append-only decision log at the root of a repository, for humans and AI coding agents", created **2026-09-08**, 0 stars; `akitaonrails/ai-memory` — plain markdown, vendor handoff, 6,099 stars; `prmichaelsen/scry` — recall layer for "what was decided and why", 9 stars, listed by Beads as adjacent; a "decision memory for AI coding teams" product that syncs an append-only log over an S3 bucket ([web search](https://www.mindstudio.ai/blog/share-ai-agent-memory-across-team)).
- **Inference.** The idea "append-only decisions in the repo" is arriving from several directions this month; none has traction yet except ai-memory, which is a wiki, not a work journal. The shape is being discovered independently — a sign it is right and a sign it will not be ours alone.

## 5. Size, honestly

Bottom-up, from what is countable.

| Layer | Count | Label |
|---|---|---|
| Public repositories that already keep agent-facing work in the repo (Beads + Backlog.md + Spec Kit + `.claude/tasks.md`) | ≈ **18,000** | Fact, public only |
| Monthly installs of the two trackers | ≈ **82,000** | Fact |
| Public repositories with a root `AGENTS.md` — the wider "agent-ready" pool | **482,304** | Fact |
| Developers using agents at all | 31% (Stack Overflow 2025, [The New Stack](https://thenewstack.io/23-of-devs-regularly-use-ai-agents-per-stack-overflow-survey/)); the 2026 survey is open and its announcement says agent usage doubled | Fact / secondary |
| Private-to-public multiplier | unknown | Assumption |

- **Inference.** The serviceable pool is the ≈18,000 public repositories plus their private siblings — teams that already accepted the premise. The obtainable share in year one is what the [North Star](../product/north-star.md) says: repositories with two authors alive at 14 days, target five. This is a niche inside a niche. It is a fine size for a reputation project and a wrong size for a venture; decision 1 in the roadmap already chose the former.

## 6. Where exactly — the three doors

Ranked by evidence.

1. **Teams leaving Beads who want their files back.** Named, public, with reaction counts: the Dolt cluster (38 + 25 + 17 + 4 reactions), the markdown-backend RFC author with a working branch, the Rust port's 1,075 stars. What they want is written down: same commit as the code, no daemon, merge without resolving. Door: the Beads `issues.jsonl` importer ([plan T68](../../tasks/plan-to-1.0.md)) and a page that says exactly those three sentences.
2. **Backlog.md teams with a server-side agent.** Humans plus an agent creating tasks concurrently, colliding IDs "in production twice", lost concurrent edits. Door: the Backlog.md importer (T67) and the merge proof.
3. **Multi-vendor teams.** A repository where Claude Code, Cursor and Codex all work. Vendor memory and vendor Tasks are per user and per vendor; `ai-memory`'s 6,099 stars for "handoff between different agent vendors" is the demand signal. Door: the agent contract we already have — `AGENTS.md` for everyone, `schema --json`, and the same 948-byte answer for every vendor.

Doors that are closed: velocity as a headline; solo developers; anyone on Jira or Linear who has not already moved work into the repository.

## 7. What this changes

- **Probe B recruits from doors 1 and 2 first.** The people who wrote those issues have stated their pain in public. Contact them as individuals about their experience, never in the issue threads (lean canvas §5 rule stands).
- **Positioning sharpens by one clause:** "for repositories where more than one human or more than one agent vendor works." The README sentence does not change; the site's segment copy and the interview screener do.
- **Velocity leaves every headline**, including `kadence-site`'s repository description.
- **ADR-009 revisit trigger has partly fired.** Claude Code reads `AGENTS.md` as a fallback when no `CLAUDE.md` exists (spring 2026, [bestagent.dev](https://bestagent.dev/claude-md-vs-agents-md-2026/), [issue #34235](https://github.com/anthropics/claude-code/issues/34235)). Repositories that have a `CLAUDE.md` still need our section in it, so `init` keeps writing both; the ADR should record the fallback.
- **Claude Code Tasks are an adjacency, not a competitor.** They live under `~/.claude/tasks`, per machine, shared by an env var. A Later item: read or write that list so a Claude session's tasks land in the journal. Not before Probe B.
- **Speed matters more than the roadmap assumed.** The markdown-backend branch for Beads exists; the Rust port exists; `decisions.md` was created today. The shape is being rediscovered monthly. G1 is the race, not 1.0.

## What this research did not answer

- Whether any of the Beads complainants would move, or already did — to the Rust port, to Backlog.md, or back to markdown files by hand. That is Probe B's first question to them.
- The private-repository multiplier on the 18,000.
- Whether a team with one human and three vendors feels the loss enough to install a fourth tool.
- Anything about how long the door stays open before Beads ships a plain-file mode.
