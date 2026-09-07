# Where discovery actually stands — and what to change in the product

- **Date:** 2026-09-07
- **Inputs:** [Probe A](../research/probe-a-results.md),
  [Probe C](../research/probe-c-agent-cost.md),
  [agent-readability research](../research/agent-readability-2026-09.md),
  [assumptions map](../research/assumptions-map.md),
  [prioritization](prioritization.md)
- **Purpose:** place the work done so far inside the discovery cycle, name what
  the evidence now supports adding and removing, and be explicit about what is
  still unanswered.

## 1. The cycle, and where we are in it

The standard discovery cycle runs in six phases. Ours looks like this:

| Phase | Status | Evidence |
|---|---|---|
| 1. Frame the problem | **Done** | PRD, JTBD, problem statement, proto-personas |
| 2. Research planning | **Done** | [Interview script](../research/interview-script.md), 45 minutes, Mom Test |
| 3. Conduct research — talk to customers | **Not started** | zero interviews |
| 4. Synthesize insights | **Done from desk research** | competitive snapshot, assumptions map, agent-readability research |
| 5. Generate & validate solutions | **Done, twice** | Probe A (merge conflicts), Probe C (agent cost) |
| 6. Decide & document | **Continuous** | nine ADRs |

Phase 3 is the only gap, and it has been the only gap since 2026-09-02.

## 2. The asymmetry, stated plainly

Look at what got validated and what did not:

| Validated | Method | Cost to us |
|---|---|---|
| Merge conflicts are real but rare | counted 8 396 merges in 130 repositories | a script |
| Conflict-freedom holds | integration test on real branches | a test |
| An agent answer is a constant 948 bytes | built four repositories, measured | an afternoon |
| The truncation bug | fell out of the measurement | free |
| Claude Code ignores `AGENTS.md` | web research + one observation | an hour |

| Not validated | Method it needs | Cost to us |
|---|---|---|
| That anyone loses enough context to want this | **talking to people** | scheduling, rejection, waiting |

Every probe run so far shares one property: **it could be run alone, offline, by
the person who wants the answer to be yes.** That is not a coincidence, and it is
not laziness either — those probes were genuinely worth running. But five rounds
of evidence about mechanism and zero about demand is a pattern, and the pattern
has a name: we keep validating the half of the bet that does not require anyone
to say no to us.

Probe C made the asymmetry worse, not better. It is a good result. It also moved
the product no closer to knowing whether the result matters.

**This is the honest statement of where discovery stands: the product is
increasingly well-built on an unexamined premise.**

## 3. What the evidence supports adding

Each rests on a measurement, and each is small. Nothing here is a bet on the
premise being true — these are repairs and consequences.

| # | Change | Rests on | Size |
|---|---|---|---|
| 1 | **A size story for `board --json`** — `--fields`, a limit, or a documented refusal past N tasks | Probe C §4: 803 KB at 1000 tasks, ~229 000 tokens, unusable by the audience the flag exists for | small |
| 2 | **Say the constant-cost claim where it is read** — README done; `.kadence/README.md` should say it too, since that is what the agent reads | Probe C §1 | trivial |
| 3 | **State the I7 consequence for agents** — that `KAD-3` cannot be found by grep, so the CLI is the only bridge | Probe C §2, verified | trivial |
| 4 | **A real-size fixture in the suite** | the truncation bug passed 418 tests because every fixture was small | small, done for JSON |

Items 2–4 are largely done in this cycle. Item 1 is open and is the only one
that needs a design decision.

## 4. What the evidence supports removing

This is the harder list, and it is why the section exists.

### Remove: the token-economics argument for CLI-over-MCP

Already retracted in the research and corrected in the README. Stated here so it
does not creep back: **we measured our own MCP wrapper at ~3 KB of ambient
context against 591 bytes for the instruction section.** ~700 tokens a session.
Citing GitHub's 55 000-token server as if it were our situation would be
borrowing someone else's evidence.

### Remove from the roadmap: `kadence context <task>`

The README promises it as "the whole history of one piece of work, formatted for
an AI agent's context window". Probe C measured what `task show --json` already
delivers: the whole history of one piece of work, 948 bytes, constant.

The remaining difference between the two is *formatting* — and we have no
evidence that any agent needs a different format from the JSON it already parses
cleanly. Building it would be inventing a requirement.

**Recommendation:** drop it from the roadmap until someone asks. If the request
arrives, it will arrive with the format attached, which is the part we cannot
guess.

### Downgrade: the optional MCP package

Prioritization put it at v0.3 with the note "competitors have it, but files work
without it". That reasoning still holds and is now better supported: MCP would be
a second way to say what the CLI already says, with a real drift risk between
them, for ~700 tokens of savings we do not need.

**Recommendation:** keep it on the list, stop treating it as inevitable. The
trigger to build it is a user who cannot use the CLI — not a competitor who
shipped one.

### Do not build: `llms.txt`

10% adoption across 300 000 domains, no measured relationship to AI citations,
crawlers fetching it below the rate of an average page, Google stating its AI
surfaces do not use it. Recorded so the question is not reopened by a checklist
tool flagging it as missing.

### Keep, unchanged: everything the invariants buy

Nothing in this cycle argued against the append-only journal, the ULID identity,
or the derived cache. Probe C strengthened them: I7 is why the CLI is
load-bearing rather than decorative.

## 5. What none of this decides

Whether to build any of it.

The North Star is repositories with events from two different authors 14 days
after `init`. Nothing measured in this cycle moves that number, and nothing in
this document can. The gate is unchanged from 2026-09-02 and from the day the
positioning was rewritten: **[Probe B](../research/interview-script.md) — five to
seven conversations, already scripted, still not run.**

The script is 45 minutes and asks about past behaviour rather than opinions.
Saturation typically arrives at five to seven interviews. The cost is scheduling
and the possibility of hearing that nobody has this problem.

That last part is the actual cost, and it is worth naming: every probe run so far
was one where the answer could not embarrass the premise.
