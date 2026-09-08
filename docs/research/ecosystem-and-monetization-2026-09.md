# Ecosystem, distribution and monetization — evidence for the road to 1.0

- **Date:** 2026-09-08
- **Decision this supports:** [roadmap-to-1.0.md](../product/roadmap-to-1.0.md) — what 1.0 must contain, how the package reaches people, whether and how the project earns money, and what we may honestly claim about helping developers.
- **Method:** Tavily search (advanced depth, last 12 months where the field churns) + local verification in this repository. Labels: **Fact** (primary source or measured here) · **Inference** (our reading) · **Assumption** (unevidenced, load-bearing).
- **Language:** English, per the 2026-09-07 decision for `docs/`.

## Questions

1. Who is the reference competitor on the "memory for agents" axis in September 2026, and what is their weakness?
2. Is "context loss between agent sessions" evidenced outside our own reasoning?
3. Do the agents themselves now solve it, making a repo-level journal redundant?
4. What does the field know about the cost of context files that `init` writes?
5. What can we honestly claim about speeding development?
6. How does a Node CLI reach npm, pnpm, yarn, bun, Homebrew and the rest, and what does each channel cost?
7. How do comparable open-source developer tools earn money, if at all?
8. What does the ecosystem expect from a `1.0.0`?

## Findings

### 1. Beads is the reference competitor now, not Backlog.md

- **Fact.** Beads (`bd`, Steve Yegge): 26,806 GitHub stars, 1,808 forks, 866 open issues, 22,861 npm downloads in the last month, created 2025-10-12, v1.2.2 on 2026-08-15, MIT, Go — snapshot dated 2026-09-02. Source: [tomrochette.com/agents/beads](https://tomrochette.com/agents/beads) (secondary, but dated and specific). Our [competitive snapshot](competitive-snapshot.md) of 2026-09-02 does not contain Beads; only the [positioning review](../product/positioning-review-2026-09.md) mentions it.
- **Fact.** Its pitch is ours, said first and louder: agents wake up with amnesia, the tracker is their memory. `bd ready`, `bd prime`, `bd remember "insight"` for "persistent project memory; do not create MEMORY.md files". Source: [README on pkg.go.dev](https://pkg.go.dev/github.com/steveyegge/beads).
- **Fact.** Storage moved from SQLite + JSONL to Dolt, a full SQL database, in early 2026. Installing via Homebrew pulls Dolt. Data travels to the git remote in its own ref namespace (`refs/dolt/data`), not with ordinary commits; `.beads/issues.jsonl` is "an export for viewers and interchange, not the source of truth". Sources: [gastownhall/beads#2573](https://github.com/gastownhall/beads/issues/2573) "Moving to dolt pretty much made beads unusable for me"; [DoltHub blog 2026-05-29](https://www.dolthub.com/blog/2026-05-29-evolving-with-beads); a community Rust port froze the pre-Dolt architecture (1,075 stars).
- **Inference.** Beads validated the category we chose and took the headline. What it left open is exactly our shape: plain files that are the source of truth, zero runtime dependencies, no daemon, no second database, history that survives `git checkout`. Their JSONL export is also a cheap import path for us.
- **Fact.** Backlog.md now ships `docs`, `decisions`, Definition of Done, an MCP connector that auto-configures Claude Code, Codex, Gemini CLI, Kiro and Cursor, a web UI, and a Nix expression. Source: [MrLesk/Backlog.md README](https://github.com/MrLesk/Backlog.md). Our `decision` command is no longer unique in the category; the append-only mechanism behind it is.

### 2. Context loss is named by the field — and monetized

- **Fact.** A hosted "memory layer" market exists with public prices: Mem0 free / $19 / $79 / $249 per month (graph memory at the top tier), ~59.9k stars; Letta $20/month; Cognee $35 / $200; Zep $25 / $475. Sources: [developersdigest.tech](https://www.developersdigest.tech/blog/best-ai-agent-memory-providers-2026), [evermind.ai](https://evermind.ai/blogs/letta-alternative), [vectorize.io](https://vectorize.io/articles/mem0-vs-letta). All are marketing pages about their own products; the prices are facts, the benchmark claims are not.
- **Inference.** People pay $19–249 a month to have an agent remember. Every one of those products is a service. The counter-position "the memory is a file in your repository, and nobody hosts it" is open and stated by no one at that scale.
- **Assumption.** That a team of 3–8 developers feels this pain strongly enough to adopt a tool for it. Still untested — Probe B.

### 3. The agents' own memory is per user, not per team

- **Fact.** Claude Code shipped Auto Memory in v2.1.59 (February 2026): notes under `~/.claude/projects/<project>/memory/`, first 200 lines of `MEMORY.md` loaded per session. Auto Dream (rolling out from March 2026) consolidates those files after 24 h and 5+ sessions. Sources: [SFEIR Institute](https://institute.sfeir.com/en/articles/claude-code-dream-auto-dream-memory-consolidation), [tessl.io](https://tessl.io/blog/anthropic-tests-auto-dream-to-clean-up-claudes-memory).
- **Fact.** That memory "lives in `~/.claude/`. It's not in the repo. It doesn't sync across machines. Your teammate cloning the repo tomorrow gets none of it." Source: [Medium, K. Srinivasan](https://medium.com/@kumaran.isk/claude-code-has-memory-now-heres-what-it-still-can-t-do-a2a7fb26070c) — a practitioner's account, consistent with the vendor description.
- **Inference.** The vendors are solving *single-user* amnesia. The gap they leave is *shared* memory: between people, between machines, between vendors. That is the layer a repository already is. Risk: a vendor adds project-scoped, committed memory. If Anthropic or OpenAI ship that, our differentiation narrows to cross-vendor and to the cost analytics.

### 4. Context files: short and human-written, or harmful

- **Fact.** Gloaguen et al., ETH Zurich / LogicStar.ai, "Evaluating AGENTS.md", arXiv:2602.11988, February 2026: LLM-generated context files lowered task success by about 3 points and raised inference cost by 20–23%; developer-written files gained about 4 points on AgentBench, at the same token overhead. Four agents, SWE-bench Lite and AgentBench. Sources: [Upsun summary](https://developer.upsun.com/posts/ai/agents-md-less-is-more), [Augment Code guide](https://www.augmentcode.com/guides/how-to-build-agents-md). Secondary coverage of one paper — one data point, not three.
- **Inference.** This supports [ADR-009](../decisions/009-the-agent-contract.md)'s choice of a *short* section in `AGENTS.md`/`CLAUDE.md` and our model of "give the agent a way to fetch, not a wall of text" ([context-handoff §1.3](context-handoff-2026-09.md)). It also argues against ever growing the `init` section. A guardrail test on its length belongs in 1.0.

### 5. What can be claimed about speed: nothing, yet

- **Fact.** METR's randomized trial (16 experienced developers, 246 tasks, 2025): 19% slower with AI tools while believing they were 20% faster. The 2025–26 follow-up (57 developers, 143 repositories) was abandoned as compromised because developers refused to work without AI. METR's own 2026 transcript analysis suggested 1.5×–13× savings on certain tasks. Sources: [sciencereader.com](https://sciencereader.com/ai-coding-tools-slower-developers-metr-study), [Rob Bowley on METR's 2026 update](https://blog.robbowley.net/2026/04/04/metrs-developer-productivity-research-2026-update).
- **Fact, measured here.** `task show --json` answers in 948 bytes regardless of project size while the journal grows to 528 KB ([Probe C](probe-c-agent-cost.md)); linking a document to a task cut the material an agent must sift by up to 34× across five real questions, an upper bound ([Probe D](probe-d-docs-linkage.md)); three branches editing one task merge with zero conflicts ([Probe A](probe-a-results.md) and the integration test).
- **Inference.** We have cost-of-asking numbers, not time-saved numbers. Self-reported speed is unreliable in this field by the best available study. Any "X% faster" on the site would be the kind of claim METR shows to be wrong. What we may say: what the agent has to read to know where a task stands, and that it does not grow. What we must measure before 1.0: the same task with and without the journal, counting clarifying questions and tokens (Probe E, proposed in [positioning](../product/positioning.md)).

### 6. Distribution: one registry serves four package managers

- **Fact, verified locally.** `dist/cli.js` begins with `#!/usr/bin/env node`; `bun`, `pnpm` and `yarn` are installed on this machine; `node dist/cli.js --version` takes 60 ms. `bunx` respects a `node` shebang and spawns node unless `--bun` is passed ([Bun docs](https://bun.sh/docs/cli/bunx)). `pnpm dlx`, `yarn dlx`, `npx` and `bunx` all resolve the same npm package.
- **Inference.** "Support pnpm and bun" is not a feature; it is a CI matrix that proves the one package installs and runs under each. Cost: hours.
- **Fact.** Homebrew/core rejects projects below its notability line — roughly 75 stars, 30 watchers, 30 days old — and directs everyone else to a personal tap. Sources: [Homebrew discussion #5792](https://github.com/orgs/Homebrew/discussions/5792), [danishpraka.sh](https://danishpraka.sh/posts/distribute-via-brew). A tap is a formula in a repository we own; each release updates a URL and a hash.
- **Fact.** Bun `--compile` and Node's single-executable application can produce a runtime-free binary; the npm package then needs an arch-switching bin script ([runspired.com](https://runspired.com/2025/01/25/npx-executables-with-bun.html)). Beads ships Homebrew, npm and PyPI; Backlog.md ships a Nix expression.
- **Inference.** A single binary is worth measuring, not assuming: our start is already 60 ms with Node present, and the binary's only user is someone without Node — a small population for a tool aimed at JavaScript-adjacent teams. winget and scoop only make sense once a binary exists. Nix is a one-file cost with an audience that overlaps ours.

### 7. Money: the honest menu

- **Fact.** The recurring models for open-source developer tools are open-core, hosted service, support/services, dual licensing, sponsorship, marketplace. Source: [reo.dev, January 2026](https://www.reo.dev/blog/monetize-open-source-software) — a vendor guide, useful as a taxonomy only. GitHub Sponsors tiers in practice range from $50 to $1,000 a month with no enforced deliverables (HBS working paper 24-014, [Conti, Gupta, Guzman, Roche](https://www.hbs.edu/ris/Publication%20Files/24-014_fe5b8527-9aad-40b8-80ef-c03cbba03bd1.pdf)). Sentry paid $750,000 to maintainers in 2024 ([globalsoftwarecompanies.com](https://www.globalsoftwarecompanies.com/top-open-source-sponsors)).
- **Fact.** None of Beads, Backlog.md, git-bug or git-issues sells anything. The memory-layer vendors of §2 all sell hosting.
- **Inference.** Direct revenue from an MIT CLI is close to zero; the [lean canvas](../product/lean-canvas.md) said so on day one and nothing here contradicts it. The only model compatible with "no server, no account, no network" in the core is one where the paid thing is *outside* the core and *needs* a server by nature: aggregation across repositories and organizations — velocity and decisions across twenty repositories, which no single journal can show. That is a product to consider after the North Star is observable, not before.
- **Assumption.** That an organization would pay for cross-repository views of a journal its teams already keep. Nobody has asked. Do not build toward it; only avoid closing the door — keep the journal format open and never gate it.

### 8. What 1.0.0 means

- **Fact.** SemVer's own test: "If your software is being used in production, it should probably already be 1.0.0. If you have a stable API on which users have come to depend, you should be 1.0.0." ([semver.org FAQ](https://semver.org/spec/v1.0.0.html)). Major version zero means "anything may change at any time".
- **Inference.** For a tool whose data lives in other people's repositories, the API is the event format, the `.kadence/` layout, the `--json` contract and the error codes. [ADR-009](../decisions/009-the-agent-contract.md) already makes `kadence/v1` additive-only. 1.0 is the point where that promise gets a compatibility test against every 0.x fixture and a written deprecation policy — and where at least one team we do not control depends on it.

## What this research did not answer

- Whether any team of 3–8 developers wants this. Probe B, still.
- Beads' real weekly active use; 22,861 downloads a month says installs, not journals with two authors.
- Whether GitHub search can find public `.kadence/` directories reliably enough to serve as our only North Star instrument.
- What the Beads JSONL schema looks like in detail — needed before promising an importer.
- Whether a single binary changes anyone's decision to try the tool. No data either way.
