# ADR-009: The agent contract — entry points, error codes, published schema

- **Date:** 2026-09-07
- **Status:** accepted
- **Scope:** CLI contract, `init`, agent interface

> First decision record written in English, following the 2026-09-07 decision to
> move `docs/` to English. The earlier eight remain in Ukrainian until migrated.

## Context

kadence promises in its README that `init` "writes a guide the AI agent finds on
its own". [Research on 2026-09-07](../research/agent-readability-2026-09.md)
found the promise does not hold, and that two related claims were thinner than
they read:

1. **`init` wrote only `AGENTS.md`.** That is the cross-tool convention — 30+
   agents read it, 60,000+ repositories carry it — but Claude Code loads
   `CLAUDE.md` and does not read `AGENTS.md`
   (anthropics/claude-code#6235). Verified directly: in the session that produced
   the research, `CLAUDE.md` was in context and `AGENTS.md` was not. For the
   largest agent audience, `init` created no entry point that loads on its own.
2. **A failed `--json` call returned one English sentence.** An agent could tell
   that something failed and nothing else. The most likely agent error is a wrong
   status — and statuses are configured per project, so no amount of reading the
   documentation tells an agent the valid set.
3. **`schema: "kadence/v1"` was a label.** Nothing published what the fields are,
   and nothing failed if one was renamed. M7 in SPEC.md calls it "a contract an
   agent can rely on"; it was a version string that a test asserted the presence
   of.

## Options considered

### Entry points

| Option | Pros | Cons |
|---|---|---|
| `AGENTS.md` only (status quo) | one file, one convention | invisible to Claude Code — the largest audience, and the agent we build with |
| `CLAUDE.md` containing `@AGENTS.md` | the vendor-documented bridge; one source of truth | the import pulls someone else's *entire* instruction file into every session; in a repository with a large `AGENTS.md` that is a real, recurring cost |
| **The same short section in both, regenerated on every init** | works everywhere; the upsert already prevents drift; ambient cost stays at a few lines | two files carry the same paragraph |
| A file per agent (`.cursor/rules`, `copilot-instructions`, `GEMINI.md`, …) | maximum reach | writing four more files into someone's repository to advertise ourselves; Cursor, Copilot and Gemini all read `AGENTS.md` already |

### Error detail

| Option | Pros | Cons |
|---|---|---|
| Message only (status quo) | nothing to maintain | agent cannot branch, cannot self-correct |
| **`code` + `received` + `allowed` + `hint`** | agent fixes its own input in one step; `allowed` is the only way to learn configured statuses | the code list becomes part of the contract |
| Adding `retryable` / `recoverable` | matches the pattern the literature recommends | there is no network and no lock here: the same input always fails identically, so the field would be a constant `false` presented as information |

### Publishing the schema

| Option | Pros | Cons |
|---|---|---|
| Document the fields in `.kadence/README.md` | no code | prose drifts from behaviour, silently |
| Ship a static JSON Schema file | standard format, existing validators | a second artefact to keep in step with the code; a dependency to validate it |
| **`kadence schema --json`, checked against real output in CI** | the tool is the source of truth; zero dependencies; the check fails the build on a rename | our own shape, not JSON Schema — a consumer wanting formal validation must convert |

## Decision

**Write the same section into both `AGENTS.md` and `CLAUDE.md`.** No `@AGENTS.md`
import: it would drag an arbitrary amount of someone else's context into every
session. No per-vendor files — Cursor, Copilot, Codex and Gemini CLI all read
`AGENTS.md`; if one stops, that is the moment to revisit, not before.

**Give every failure a code**, from a closed list in `src/agent/contract.ts`, with
`received`, `allowed` and `hint` where each is knowable. **No `retryable`**, and
the absence is asserted by a test so it is not added absent-mindedly later.

**Publish the contract as `kadence schema --json`.** It works outside a
repository, because an agent asks what the tool does before it has a project to
ask about. Three tests keep it honest: the published error codes must equal
`ERROR_CODES` exactly, every required field must appear in real command output,
and every command named must actually run.

The contract is deliberately **narrower** than the output. Fields we emit but do
not list may still change; what is listed is a promise. Within `kadence/v1`,
fields and codes may be added, never renamed or removed.

## Consequences

- **Positive:** the README's promise is now true for Claude Code users. An agent
  that sends a wrong status is told the configured set and fixes itself in one
  step. Renaming a task field fails the build instead of breaking consumers
  quietly. `resolveRefs` returning a `CommandResult` removed seven copies of the
  same error-construction line.
- **Cost:** `init` now writes a second file into the user's repository root — the
  most intrusive thing kadence does, and it is why the section is short and the
  upsert leaves human text untouched. The error-code list and the schema are both
  public surface: additive changes only, forever.
- **Measured:** bundle 29 KB (was 30 KB), `schema --json` 60 ms and 3.5 KB of
  output, performance budgets unchanged, 416 tests.
- **Revisit if:** Claude Code adds native `AGENTS.md` support — then the second
  file becomes redundant and should be dropped rather than kept out of habit. Or
  if consumers ask for formal JSON Schema, at which point the contract we already
  publish is the thing to generate it from.
