# Probe C — what a kadence answer costs an agent

- **Date:** 2026-09-07
- **Hypothesis:** that kadence saves an agent a material amount of context, and
  that the CLI-not-MCP decision is justified by token economics
- **Verdict:** the first is true and larger than expected. **The second is not.**
  The measurement corrected our own reasoning.
- **Method:** built four repositories through the real CLI at 10, 50, 200 and
  1000 tasks, each with movement, comments and logged hours; measured the bytes
  an agent must take in along each available path.

## Why bytes and not tokens

No tokenizer runs offline, and adding one would be a dependency for a
measurement. Bytes are what we can measure exactly. Where a token figure is
useful below it is stated as bytes ÷ 3.5, the usual ratio for punctuation-heavy
JSON, and marked as an estimate.

**The ratios do not depend on that choice** — the divisor cancels. Every
comparison in this document is a ratio.

## The measurement

| Tasks | Events | `task show --json` | `board --json` | Whole journal | `state.json` |
|---:|---:|---:|---:|---:|---:|
| 10 | 24 | **948** | 7 898 | 5 463 | 9 004 |
| 50 | 115 | **948** | 39 785 | 26 473 | 44 064 |
| 200 | 458 | **948** | 160 217 | 105 792 | 176 396 |
| 1000 | 2 285 | **948** | 803 055 | 528 655 | 882 703 |

All figures in bytes. Fixed costs, independent of project size: the kadence
section in `AGENTS.md` / `CLAUDE.md` is **591**, `.kadence/README.md` is **1 887**,
`kadence schema --json` is **3 482**.

## Finding 1 — the answer is a constant; everything else is not

`task show --json` returns **948 bytes whether the project holds 10 tasks or
1000**. The journal behind it grows from 5 KB to 528 KB.

| Tasks | Journal ÷ one answer |
|---:|---:|
| 10 | 5.8× |
| 50 | 27.9× |
| 200 | 111.6× |
| 1000 | **557.7×** |

At 1000 tasks the journal is ~151 000 tokens (estimated) and the answer is ~271.
The point is not the multiplier at any one size — it is the **shape**: the cost
of asking does not grow with the history that makes the answer worth having.

This is the product claim, and it now has a number.

## Finding 2 — the agent cannot bypass the CLI, by construction

An agent knows a task as `KAD-3`, because that is what humans write in commits,
pull requests and chat. Searching the journal for it returns **nothing**:

```
$ grep -rl "KAD-3" .kadence/events/
$ (no matches)
```

Invariant I7: identity is the ULID, and `KAD-N` is a label derived while folding,
never stored in an event. So an agent holding a human's reference has two
options — fold the entire journal itself, or make one call. There is no third.

That is not an optimisation we added. It falls out of a decision made for
correctness, and it is worth stating plainly: **the CLI is not a convenience
layer over the files, it is the only bridge from the name a human uses to the
data.**

## Finding 3 — the MCP argument does not hold at our size, and we should stop making it

The industry numbers are real: GitHub's MCP server injects ~55 000 tokens of tool
definitions before a session starts; a Microsoft Graph task cost ~145 000 tokens
via MCP against ~4 150 via CLI. We read those and concluded the CLI-first
decision was validated by token economics
([agent-readability-2026-09.md](agent-readability-2026-09.md) §3).

Then we measured what kadence's own MCP wrapper would cost. Built from the
contract kadence already publishes — one tool per command it names, with the
input schema that command needs:

| | Ambient cost per session |
|---|---:|
| 13 MCP tools, generated from our own contract | 3 058 bytes (~874 tokens) |
| The kadence section in `AGENTS.md` / `CLAUDE.md` | 591 bytes (~169 tokens) |

**A difference of ~700 tokens per session.** Not 98%, not 35×. kadence is a small
tool with thirteen short commands; the pathologies in the industry numbers come
from servers exposing dozens of tools with long descriptions, and we are not one.

The honest conclusion: **the token argument for CLI-over-MCP does not apply to
us**, and repeating it would be borrowing someone else's evidence. The reasons to
keep MCP optional are the ones we already had and can defend:

- it works with agents that have no MCP client at all — the zero-install path;
- the core keeps zero runtime dependencies (ADR-003);
- it adds a second way to say the same thing, which can drift from the CLI.

Cost is not on that list any more.

## Finding 4 — `board --json` does not scale, and it is ours to fix

At 1000 tasks `board --json` returns **803 KB** — larger than the journal it was
folded from, because every task is emitted in full, in every column. That is
~229 000 tokens: past the context window of most models, and unusable for the
audience the flag exists for.

There is no `--fields`, no pagination, and no limit. The research named field
masks as a missing agent-CLI pattern; this is what missing costs.

`task show` is the shape to copy: answer one question completely. `board --json`
currently answers every question at once.

## What this probe found that no test did

Every `--json` response above 128 KiB was **truncated mid-string** when stdout
was a pipe — which is exactly how an agent reads it. `process.exit()` does not
wait for an asynchronous write to drain, and a pipe write is asynchronous while a
file write is not. Writing to a file produced valid JSON; piping produced 131 072
bytes and a parse error.

The suite had 418 passing tests and every fixture in it was small. Fixed by
writing synchronously (`fs.writeSync` in a loop), with two regression tests that
build a response past the buffer and parse it.

This is the fifth bug in this project of the same family: correct code at the
boundary with the outside world, invisible to a green suite. The others were in
the TUI, which is why CLAUDE.md says to run the product by hand. This one says
the rule is not only about terminals.

## What follows

| # | Action | Rests on |
|---|---|---|
| 1 | Stop citing MCP token economics as the reason the wrapper is optional; say the real reasons | Finding 3 |
| 2 | Give `board --json` a size story — `--fields`, a limit, or a documented refusal | Finding 4 |
| 3 | Put the constant-cost claim in the README, with the number | Finding 1 |
| 4 | State the I7 consequence where agents will read it | Finding 2 |

## What this probe did not answer

Whether any of it matters to a user. It measures what an answer costs, not
whether anyone wants the answer. That is still [Probe B](interview-script.md),
still not run. A cheap answer to a question nobody asks is worth nothing.
