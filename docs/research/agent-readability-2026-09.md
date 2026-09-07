# How agents read a repository — and what kadence gets wrong

- **Date:** 2026-09-07
- **Method:** web research (Tavily), plus one claim verified locally in this repository
- **Decision this supports:** what `kadence init` should write, whether the `--json`
  contract is actually a contract, and whether the optional MCP package is still
  the right roadmap item
- **Labels:** **Fact** — stated by a primary or measured source · **Inference** —
  our reading of the evidence · **Assumption** — not evidenced

---

## 1. Why this research

kadence claims an AI agent finds its way into the journal on its own: `init`
"writes a guide the AI agent finds on its own — no MCP server to run" (README).
That claim rests on three beliefs nobody had checked:

1. that `AGENTS.md` is the file agents read;
2. that `schema: "kadence/v1"` is enough to call `--json` a contract;
3. that an MCP wrapper is a nice-to-have rather than the main road.

One of the three turned out to be wrong in a way that affects the agent we
develop this product with.

---

## 2. Finding 1 — `AGENTS.md` is the standard, and Claude Code does not read it

**The standard is real and it won.** `AGENTS.md` was proposed by OpenAI in
August 2025, donated to the Linux Foundation's Agentic AI Foundation in December
2025 alongside MCP, and ships in **60,000+ public repositories**; 30+ agents read
it natively — Codex, Cursor, Copilot, Gemini CLI, Jules, Aider, Zed, Windsurf,
Amp, Warp, Devin, goose — **Fact**
([AAIF](https://aaif.io/blog/measuring-agents-md-what-five-runs-show-that-one-doesn-t),
[Morph](https://www.morphllm.com/agents-md-guide)).

**Claude Code is the exception.** It loads `CLAUDE.md` and does not read
`AGENTS.md` natively. The feature request (anthropics/claude-code#6235) was
closed with a documentation section stating, verbatim, that Claude Code reads
`CLAUDE.md`, not `AGENTS.md`, and prescribing an `@AGENTS.md` import line or a
symlink instead — **Fact**
([hivetrail](https://hivetrail.com/blog/agents-md-vs-claude-md-cross-tool-standard),
[issue #50778](https://github.com/anthropics/claude-code/issues/50778)).

**Verified here, not just read about.** In the session that produced this
document, Claude Code loaded `CLAUDE.md` into context automatically. `AGENTS.md`
was not loaded — it had to be opened with `cat` like any other file — **Fact**
(direct observation in this repository, 2026-09-07).

**What this costs us.** `runInit` writes exactly two agent-facing artefacts:
`.kadence/README.md` and a section in `AGENTS.md` ([init.ts](../../src/cli/commands/init.ts)).
For a Claude Code user — the single largest coding-agent audience, and the agent
this product is being built with — `kadence init` creates **no entry point that
loads on its own**. The agent finds kadence only if it happens to grep for it —
**Inference**, high confidence, following directly from the two facts above.

**Size limits are real too.** Codex caps the instruction file it ingests at
`project_doc_max_bytes`, default 64 KiB, and the widely repeated practical
ceiling for a `CLAUDE.md` is ~300 lines, because frontier models reliably follow
only ~150–200 instructions and the harness system prompt already spends ~50 of
them — **Fact** for the Codex default
([DeployHQ](https://www.deployhq.com/blog/ai-coding-config-files-guide));
**Inference** for the instruction-count ceiling, which is repeated widely but
not traced to a primary study.

Our `CLAUDE.md` is 5.8 KB / ~150 lines — inside the budget. `SPEC.md` at 22 KB is
not an instruction file and is never auto-loaded, so it is not affected.

---

## 3. Finding 2 — CLI beats MCP on cost, and the industry measured it

This is the finding that most strongly validates an existing kadence decision.

| Comparison | MCP | CLI | Source |
|---|---|---|---|
| Anthropic's own case (tool defs + intermediate results through context) | ~150,000 tokens | ~2,000 tokens | **Fact** — [Anthropic, code execution with MCP](https://www.marktechpost.com/2025/11/08/anthropic-turns-mcp-agents-into-code-first-systems-with-code-execution-with-mcp-approach) |
| GitHub's official MCP server, 93 tools, before a single question | ~55,000 tokens | n/a | **Fact** — [vensas](https://vensas.de/en/blog/mcp-vs-cli-cost-comparison) |
| Microsoft Graph, list 50 non-compliant devices | ~145,000 tokens | ~4,150 tokens | **Fact** — [jannikreinhard](https://jannikreinhard.com/why-cli-tools-are-beating-mcp-for-ai-agents) |

The mechanism is not a flaw in MCP: it is that static tool-schema injection is
paid up front, every session, whether or not the tools are used. A CLI is
progressive disclosure for free — the agent pays only for the command it runs —
**Fact** (the mechanism is stated by all three sources and by Anthropic).

Three independent fixes converge on the same insight — Anthropic's Programmatic
Tool Calling, Cloudflare's Code Mode, Cursor's on-demand tool descriptions:
agents should not load what they do not need — **Fact**
([Firecrawl](https://www.firecrawl.dev/blog/mcp-vs-cli)).

**Consequence for kadence — retracted 2026-09-07.** This section originally
concluded that the token economics justified our CLI-first decision.
[Probe C](probe-c-agent-cost.md) measured it and found otherwise: a full MCP
wrapper for kadence would cost ~3 058 bytes of ambient context against 591 for
our instruction section — a difference of roughly 700 tokens per session, not
98%. The industry figures come from servers exposing dozens of tools with long
descriptions; kadence has thirteen short commands and is not that shape.

The decision stands; this reason for it does not. The defensible reasons are
zero-install for agents with no MCP client, and a zero-dependency core (ADR-003).
Left in place rather than deleted, because reading someone else's benchmark as if
it were ours is the mistake worth remembering — **Fact** (Probe C measurement).

**The caveat we should not hide.** MCP still buys capability discovery: an MCP
client is told what exists without being told where to look. A CLI needs the
agent to already know the binary exists — which is exactly what §2 says we fail
at for Claude Code — **Inference**.

---

## 4. Finding 3 — `schema: "kadence/v1"` is a label, not a contract

The agent-facing CLI patterns that have converged in 2025–2026 — from Arcjet,
Fern, InfoQ, seekdb and the AI-friendly-CLI skill — are consistent, and we
implement roughly half of them.

| Pattern | Why agents need it | kadence today |
|---|---|---|
| Structured output, clean stdout | brittle regex parsing breaks across versions | **have** — `--json`, warnings to stderr |
| Semantic exit codes | branch without parsing prose | **have** — 0 / 1 / 2 |
| **Schema introspection** (`schema` subcommand or `--describe`) | know parameters, types and valid values without parsing `--help` prose | **missing** |
| **Structured errors** (`error_code`, `recoverable`, `suggested_action`, allowed values) | decide whether to retry, fix, or escalate | **missing** — we return one English string |
| **Output as a versioned API contract**, schema-checked in CI | agents break silently when a field is renamed | **missing** — the version string is asserted, the shape is not |
| JSON by default when stdout is not a TTY | agents forget the flag | **not done** — deliberate, arguably right for a human-first CLI |
| Field masks / `--fields` | context windows are finite | **missing** |
| Bulk, all-or-nothing operations | one call instead of fifty | **have** — `task move KAD-1,KAD-2 done` |
| Realistic examples in help | agents learn from examples faster than from flag lists | **partly** — in `.kadence/README.md`, not in `--help` |

Sources: **Fact** for each pattern —
[Arcjet](https://blog.arcjet.com/designing-a-cli-for-ai-agents),
[InfoQ](https://www.infoq.com/articles/ai-agent-cli),
[Fern](https://buildwithfern.com/post/what-is-an-api-cli-generator),
[AI-friendly CLI skill](https://mcpmarket.com/tools/skills/ai-friendly-cli-designer).

**The error case is the sharpest.** An agent handed `{"ok":false,"error":
{"message":"..."}}` learns that something failed and nothing else — in the worst
case it retries the same broken input indefinitely. The recommended shape names
what failed, what was received, what is allowed, and what to try:

```json
{ "error": "Invalid value for field 'status'",
  "received": "done",
  "allowed_values": ["backlog", "in_progress", "in_review", "done"],
  "hint": "Did you mean 'done'? Statuses are project-configurable — run `kadence board statuses --json`." }
```

**Fact** that this is the recommended shape
([Nordic APIs](https://nordicapis.com/designing-api-error-messages-for-ai-agents),
[MachineLearningMastery](https://machinelearningmastery.com/ai-agent-tool-design-what-works-and-what-doesnt)).
kadence has a specific reason to care: statuses are project-configurable, so a
wrong status is the single most likely agent error, and it is the one our current
error message helps with least — **Inference**.

**InfoQ's operational recommendation:** define the structured output as JSON
Schema or CUE and validate it in CI, so a breaking change is caught before it
ships — **Fact**. This maps onto a habit the project already has: performance
budgets are enforced by tests that fail on regression. A schema test is the same
idea applied to the agent contract — **Inference**.

---

## 5. Finding 4 — Backlog.md has already shipped the agent layer we planned

Backlog.md (6.5k stars) — the closest competitor identified in
[competitive-snapshot.md](competitive-snapshot.md) — now ships, as of this
research:

- an init wizard that asks **how** you want to connect AI tools, with three
  options: CLI instructions (the recommended default), MCP connector, or skip;
- `backlog instructions overview` — a **self-documenting command** that returns
  the current workflow guidance, so the instruction file stays short and the CLI
  stays the source of truth;
- **auto-configuration of the MCP connector** for Claude Code, Codex, Gemini CLI,
  Kiro and Cursor, each with a one-line client command;
- MCP resources under `backlog://workflow/overview`, with deeper guides at
  `task-creation`, `task-execution`, `task-finalization`;
- `AGENTS.md` preservation — existing content is not migrated or removed.

**Fact** ([Backlog.md README](https://github.com/MrLesk/Backlog.md), fetched
2026-09-07).

Read against §2 and §4: on the agent interface specifically, they are ahead of
us on entry points (they configure five clients; we write one file that the
largest client does not read), ahead on discovery (`instructions overview` vs our
static README), and level with us on structured output — **Inference**.

**Note the shape of their answer, though.** Their instruction file is short *and
points at a command*. That is the same progressive-disclosure move that §3 says
makes CLIs cheap — and it is available to us without adopting MCP — **Inference**.

**A user's own words on why the CLI matters**, from the Hacker News thread on
Backlog.md: the appeal is a CLI for the LLM to mark off tasks *without having to
pollute context by reading the file over and over again* — **Fact** (quoted
comment, [HN 44483530](https://news.ycombinator.com/item?id=44483530)). This is
close to our shared-context thesis, stated by someone who is not us. It is
evidence about a competitor's users, not ours, so it does not substitute for
Probe B — **Inference**.

---

## 6. Finding 5 — `llms.txt` is not worth building for

Since [ADR-008](../decisions/008-where-the-site-lives.md) settles where the site
lives, the question of whether to publish an `llms.txt` was open. The evidence
says no.

- Adoption: **10.13%** of ~300,000 domains carry the file, spread evenly across
  traffic tiers rather than concentrated among large sites — **Fact**
  ([SE Ranking, via SEJ](https://www.searchenginejournal.com/llms-txt-shows-no-clear-effect-on-ai-citations-based-on-300k-domains/561542)).
- Effect: **no relationship** between having `llms.txt` and how often a domain is
  cited in major LLM answers — **Fact** (same study).
- Crawler behaviour: over 90 days, **84 AI-bot visits to `/llms.txt` out of 62.1k
  total AI-bot hits** — below the site's average page, i.e. no crawl priority —
  **Fact** ([Otterly](https://otterly.ai/blog/the-llms-txt-experiment)).
- Platform position: Google states its AI surfaces do not use it; OpenAI's
  crawler documentation covers `robots.txt` and does not mention it — **Fact**
  ([Contentful](https://www.contentful.com/blog/llms-txt-search-visibility)).

**Recommendation:** do not build for `llms.txt`. If the docs site ships one, it
costs a few lines and may pay off if adoption changes — but it must not be
counted as distribution — **Inference**, high confidence.

---

## 7. Finding 6 — progressive disclosure is the documentation pattern

Anthropic's own guidance: letting agents navigate and retrieve autonomously
enables progressive disclosure — the agent assembles understanding layer by
layer, keeping only what is necessary in working memory — **Fact**
([Anthropic, effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).

The retrieval mechanism is not RAG. Claude Code explores codebases with Glob,
Grep and Read: scan names, open a candidate, read precisely — **Fact**
([Linkly](https://linkly.ai/blog/outlines-index-progressive-disclosure-for-ai-agents)).
The `SKILL.md` + `references/` layout is the same pattern formalised, and it now
has a benchmark behind it rather than only engineering intuition — **Fact**
([arXiv 2607.17598](https://arxiv.org/html/2607.17598v1)).

**What this means for `docs/`.** An agent does not follow the reading order in
`docs/README.md`; it greps for a term and opens what matches. That makes two
things load-bearing that a human reader never notices: **file names must carry
the search term**, and **each document must state its own conclusion near the
top**, because the agent may read only the first screen — **Inference**.

It also makes the language of `docs/` a retrieval property, not a style choice.
An agent grepping `velocity`, `conflict` or `merge` hits English prose in
`README.md` and `SPEC.md` and misses the Ukrainian research that actually
contains the answer — **Inference**, and the reason the decision was taken to
move `docs/` to English.

---

## 8. What follows

Ordered by evidence strength, not by effort.

| # | Action | Rests on | Kind |
|---|---|---|---|
| 1 | `init` writes a `CLAUDE.md` pointer alongside `AGENTS.md` — content unchanged, the shortest form being an `@AGENTS.md` import | §2, verified locally | bug-shaped: the documented promise does not hold for Claude Code |
| 2 | `error.code` + `allowed_values` + `hint` in `--json` errors, starting with the configurable-status case | §4 | behaviour change, needs TDD |
| 3 | `kadence schema --json` — the machine-readable contract behind `kadence/v1`, validated in CI so a field rename fails the build | §4 | new capability; makes an existing promise true |
| 4 | Move `docs/` to English | §7 | decided 2026-09-07 |
| 5 | Keep the MCP package optional, and say **why** — zero-install and zero dependencies, *not* token economics ([Probe C](probe-c-agent-cost.md) retracted that) | §3 | positioning |
| 6 | Do not build for `llms.txt` | §6 | non-action, recorded so it is not revisited blindly |

Items 1–3 change the `--json` contract or the `.kadence/` layout in ways
CLAUDE.md marks as "ask first". Item 3 is additive. Item 2 adds fields to an
error object and is the one to check against consumers before shipping.

## 9. Measured afterwards

[Probe C](probe-c-agent-cost.md) took the two claims in this document that could
be measured and measured them. One held and is larger than expected: a kadence
answer about one task is a constant 948 bytes while the journal behind it grows
to 528 KB — 558× at 1000 tasks. One did not, and is retracted in §3. A third
thing surfaced that nobody was looking for: every `--json` response over 128 KiB
was truncated when piped, which is how agents read it.

## 10. What this research did not answer

It says how agents read and what they need. It says nothing about whether teams
lose enough context to want kadence — that is still
[Probe B](interview-script.md), still not run. Nothing here moves that number.
The HN comment in §5 is the closest thing to outside evidence, and it is one
sentence from a competitor's user — **Assumption** that it generalises.
