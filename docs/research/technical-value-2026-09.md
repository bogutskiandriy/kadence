# Technical value — does kadence give an LLM agent something it lacks

- **Date:** 2026-09-18
- **Question:** looking only at how LLM coding agents work, where does kadence give an agent a capability it lacks, and where do the platforms already do the same thing natively, so kadence adds nothing?
- **Decision this supports:** which technical bets stay on the [roadmap to 1.0](../product/roadmap-to-1.0.md), and what gets dropped.
- **Labels:** **Fact** (measured, or stated by a primary source) · **Inference** (our reading) · **Assumption** (no evidence yet, but the conclusion depends on it)
- **Status:** complete. Three independent investigations ran in parallel, and all three are in.

| Track | Question | Method | Status |
|---|---|---|---|
| A. A/B experiment | Does a cold agent do better work when kadence is present than with the same facts in `TODO.md` or in git alone? | 13 headless `claude -p` runs (sonnet) on fixtures with traps: a rejected approach that looks tempting, a task a teammate already claimed, a blocked task. The rubric was written before any run. | **done**: full report in [ab-cold-agent-2026-09.md](ab-cold-agent-2026-09.md) |
| B. Contract stress audit | Does the agent contract hold under the load that agents actually put on it? | Concurrent `task claim` across worktrees, determinism and size of `prime`, recovery from typical LLM mistakes, latency at 10k events, stale context | **done**: full report with reproductions in [contract-stress-audit-2026-09.md](contract-stress-audit-2026-09.md) |
| C. LLM mechanics | Which capabilities are native to the platforms and which are a real gap? | Desk research from primary sources, as of September 2026 | **done**: full report with every URL in [llm-mechanics-2026-09.md](llm-mechanics-2026-09.md) |

## Verdict

- **Proven value.**
  - **Cost does not grow with the history.** Probe C measured this. At 407 tasks the agent was about a third cheaper than with markdown (A).
  - **The agent's work is reliably attributed to the right person, and a note for the next session gets written** (A).
  - **A deterministic, merge-safe core** (B).
- **Not proven.** That kadence makes an agent choose better or follow decisions better. With well-kept markdown, a strong model does this equally well (A).
- **Not working today.** Coordination between parallel agents, which is the core of the team promise. B1 and B2 break it.
- **Still open.**
  - A second session, especially one run by a different vendor: does it benefit from what the first session recorded?
  - A realistic, poorly maintained `TODO.md` as the baseline.

This page adds only new evidence. Earlier work it builds on: [discovery verdict](discovery-verdict-2026-09.md), [context handoff](context-handoff-2026-09.md), [agent readability](agent-readability-2026-09.md), [Probe C](probe-c-agent-cost.md), [competitive snapshot](competitive-snapshot.md).

---

## C. What the platforms already do, and the gap that remains

Every figure below has a primary source with a date in the [full report](llm-mechanics-2026-09.md). That report also covers a sixth finding not repeated here: kadence has no way to flag a decision as stale, while Copilot checks citations against the code and expires memory after 28 days. It also lists metrics we can reuse for our own measurement (repeated-rejected-path rate, StaleUseRate, useful-context precision).

### C1. The claimed gap is narrower than we say

Our claim has been that no platform shares an agent's state between people. That is only partly true:

- **Fact.** GitHub Copilot's repository memory is shared with everyone who can read the repository. In GitHub's own A/B test, the merge rate was 90% with it and 83% without.
- **Fact.** Amp shares threads across a workspace.
- **Fact.** Cursor Projects (beta, 2026-09-10) syncs context files between machines.
- **Fact.** Claude Code keeps subagent memory in `.claude/agent-memory/`. That file is versioned in git, and this is the documented default. A team memory synced through a server exists in the code but is not documented.
- **Inference.** Each vendor now shares state, but only inside its own product. None of them provides state that is readable by any vendor, versioned with the code, and structured as tasks, claims and decisions with the alternatives that were rejected. **That is kadence's only distinct technical claim.** No one has yet tested whether a team needs it.

### C2. Evidence for the idea

- **Fact.** Giving agents memory of facts that cannot be derived from the code raised pass rates from about 12% to 46–54% (DreamBench-SWE, 2026-08).
- **Fact.** Plain files matched specialised memory stores (Letta).
- **Inference, and a caveat.** In both positive results the memory was written automatically, not by a person.

### C3. Evidence against kadence as built today

- **Fact.** Context injected at session start was used in 100% of runs. Context the agent had to fetch itself was used in 53–79%. With default settings, the agent never invoked the skill in 56% of cases (Vercel).
  → **Inference.** The only part of kadence that does not depend on the agent choosing to call it is `prime`, injected by the SessionStart hook. `init` installs that hook for Claude Code only.
- **Fact.** Agents follow instructions less well as a session goes on. The odds of following one drop by about 5.6% for each function written (McMillan).
  → **Inference.** An instruction such as "record a decision", read at the start of a session, has faded by the time a decision is actually made.
- **Fact.** Instruction files produced no significant gain in success rate and made runs about 20% more expensive (ETH).
- **Inference.** A claim is invisible to another worktree on the same machine until the branches merge, and that is the most common setup for running agents in parallel. Claude's own task list, which uses file locking, already covers that case. *Track B tests this directly.*
- **Fact.** Claude Code now disables its Task tools by default on the newest models. Anthropic's stated reason is that the model tracks work without a checklist.

### C4. Neutral

- **Fact / estimate.** `prime` is about 350 tokens and is injected once per session, so it does not reduce prompt-cache hits.

### C5. Corrections to our earlier documents

| Earlier claim | Correction |
|---|---|
| Codex's instruction-file limit is 64 KiB | The default is **32 KiB** |
| There is a ceiling of about 150–200 instructions | Not supported for single instructions |
| MCP costs noticeably more tokens than a CLI | The gap is now near zero, because Claude Code defers MCP tool definitions |
| We should not build a hook layer | Obsolete: five vendors now accept session-start hooks |

---

## A. A/B experiment

The experiment compared three setups for a cold Sonnet agent:

- **kadence:** 8 runs, 3 of them with the session-start hook.
- **Markdown:** 5 runs with a disciplined `TODO.md` and `decisions.md`.
- **Git only:** not run.

Each setup was tested on two fixtures, one with 57 tasks and one with 407. Both conditions held the same facts. The full report is [here](ab-cold-agent-2026-09.md).

| | kadence | markdown |
|---|---|---|
| Correct task chosen | 8/8 | 5/5 |
| Prior decision respected | 8/8 | 5/5 |
| Claimed or blocked work taken | 0 | 0 |
| Mean cost at 407 tasks | **$0.37** | $0.56 |
| Tokens in at 407 tasks | **471k** | 701k |
| Wall time at 407 tasks | **155 s** | 225 s |
| Work attributed to the repository's git identity | **8/8** | 0/5 (3 used the Claude account email, 2 no name) |
| Left a note for the next session | **6/8** | 1/5 |
| Final answer named the claimed task it skipped | 1/6 | **5/5** |

- **Fact.** kadence did **not** improve which task the agent chose or whether it followed decisions. Both conditions scored at the ceiling. The traps were too easy for a strong model reading well-kept markdown.
- **Fact.** At 407 tasks, kadence was about a third cheaper and faster. At 57 tasks there was no difference. The advantage appears only as the history grows, which matches Probe C.
- **Fact.** Every kadence run started with `prime`, and none read `.kadence/` directly. The hook did not change behaviour: agents ran `prime` again even after it had been injected.
- **Fact.** The commands the `init` section advertises cancel the cost advantage.
  - At 57 tasks, `task list --json` returns 52 KB, and at 407 tasks, 404 KB, which hits Claude Code's output limit.
  - One agent read 21.9 KB of tracking data through this path. The markdown agent read 8.8 KB.
  - This confirms B8.
- **Fact.** `ready` and `prime` hide other people's claims completely. The agent avoided the claimed task, but could rarely say that it had.
- **Caveats.**
  - The samples are small: 1–3 runs per cell, one model, and one fixture we built ourselves.
  - The markdown baseline was ideal.
  - A realistic `TODO.md`, with stale claims and unmarked supersession, was not tested. That is where a difference in which task gets chosen would most likely appear.

## B. Contract stress audit

Built from the working tree (0.5.0 + uncommitted changes) and run in scratch repositories. Reproductions and scripts are in the [full report](contract-stress-audit-2026-09.md). Two findings were re-run independently on 2026-09-18 and **reproduced**: B1 (three concurrent claims under one git email all received KAD-1 with identical responses) and the silent unknown command in B5.

**Severity:**
- **Breaks:** the value to an agent does not hold.
- **Degrades:** it holds, but the agent pays for it or is misled.

### What holds, with evidence

- **I1.** Five claim branches were merged in both orders. After `state.json` was deleted, the resulting state was byte-identical. There were no git conflicts.
- **I6 under concurrency.** Thirty concurrent writers and readers. No event was lost, and the cache stayed consistent.
- **`prime` is bounded and deterministic.** The text is 815 bytes at 10 tasks and 1 564 bytes at 4 000 tasks, byte-identical across runs. It changes once per UTC day, because of the "Nd ago" counters, which costs one cache miss a day.
- **Errors in values can be fixed in one step.** A wrong status, priority, type or field returns `allowed`.
- **The `--json` shape holds inside the handlers.** All 62 of 62 calls printed exactly one `kadence/v1` object. `--json` works in any position, and refs are case-insensitive.
- **Linked documents do not bloat answers.** With a 5 MB document linked, `prime --json` is 689 bytes and `task show --json` is 958 bytes.

### What fails

| # | Severity | Finding |
|---|---|---|
| B1 | **Breaks** | **One git identity means one claimant.** The actor is `git config user.email`, so every agent a developer runs is the same claimant. Ten concurrent claims all received KAD-1 with `contestedBy: []`. After a merge, nothing reports the collision. |
| B2 | **Breaks** | **Worktrees always collide.** Five of five worktree agents took KAD-1, even under distinct emails. After the merge, `ready`, `stats` and `task show` show the contest, but `prime` does not. `prime` is the only thing the hook pushes to the agent. This confirms C3 with a measurement. |
| B3 | Degrades | **The claim response under a race is built from the state before the write.** Five of eight racing agents were told they held a task they had lost. The stderr message "Merged 3 changes from another branch" was false. |
| B4 | Degrades | **Latency at 10k events.** Every warm call reads all event files, 10 103 of them. Warm reads take about 330 ms, and a read right after a write about 540 ms, against the 200 ms budget. At 1k events everything fits. `compact` brings it to about 155–195 ms. |
| B5 | Degrades | **Contract holes outside the handlers:** <ul><li>An unknown command exits 0 with empty output.</li><li>Unknown flags print no JSON.</li><li>`--json --json` prints plain text and still creates the task.</li><li>A repeated `--title` writes a malformed event that stays permanent and reports success.</li><li>A repeated `--task` or `--fields` crashes.</li></ul>This is the same class of bug as the earlier `--rejected` bug. |
| B6 | Degrades | **Stale or false context:** <ul><li>An uncommitted "done" event follows `git checkout main`.</li><li>A claim on a task that never started hides it from `ready` indefinitely. Claims never expire.</li><li>Events for tasks that are not merged yet sit in `state.pending` and no command shows them. CLAUDE.md says they are "reported".</li><li>`KAD-N` points at a different task after a delete or a merge.</li></ul> |
| B7 | Degrades | **Injection into `prime`.** `short()` keeps newlines, so a note can inject a fake "Go deeper:" section. The stated 40-line cap is broken: 313 lines were measured. `prime --json` has no size limit; a 200 KB note makes it 200 KB. |
| B8 | Degrades | **The list commands the CLAUDE.md section advertises have no default limit.** At 4 000 tasks: `task list` returns 4.6 MB, `board --summary` 1.25 MB, `ready` 407 KB. Claude Code truncates tool output at 25k tokens (C, full report §2.3). |

**Inference.** The single-writer core, meaning folding, determinism and the answer to one question, is sound, and the measurements confirm it. Everything that makes up the *team* claim fails in the most common 2026 setup: several agents working in parallel, under one person's email, in worktrees. Claims, contest detection and the delivery of contests to the agent all fail there.

---

## Bets: keep, add, drop

Based on all three tracks.

**Fix now.** These are bugs in promises we already make. They need no product decision.

1. **A per-agent actor for claims**, for example `KADENCE_ACTOR`, with the git email as the fallback. Also: re-read the state after a claim is written, and return a status of `claimed`, `already_yours` or `contested` (B1, B3).
2. **Show contested claims in `prime`** (B2).
3. **Send parser errors and unknown commands through `failure()`**, and reject array values before an event is written (B5).
4. **Strip newlines in `short()`, and cap the size of `prime --json`** (B7).
5. **Add a default limit to list commands**, and cap the length of titles and notes (B8). Change the `init` section so it advertises `ready`, `task show` and `decision show` instead of `task list --json` and `board --json` (A).
6. **Remove the unconditional `readAll` from the warm path**, and refresh the snapshot after a write. Measure again afterwards, as CLAUDE.md requires (B4).

**Bets.** These change the product.

7. **Install `prime` through every vendor's session-start hook**, not only Claude Code's. It is the one path proven to reach the agent (C3).
8. **Add an end-of-session hook** that asks the agent what it decided and what it rejected. This turns hand-written memory into automatic capture, the form the positive evidence supports (C2).
9. **Let decisions reference files, and mark a decision stale when those files change**, checked locally. *This changes the shape of `FlowEvent`, so ask first* (CLAUDE.md).
10. **Claims on one machine: decide now.** Either read the `.kadence/events` of sibling worktrees (local and read-only), or stop presenting claims as coordination for parallel agents. B2 confirmed that today the promise does not hold in the most common setup.
11. **Drop anything that duplicates single-vendor memory.** Instead, run a probe: a second session with a different vendor, measuring whether it repeats a rejected approach.

## What this does not answer

Whether a team *wants* state that works across vendors. That is still Probe B, the interviews ([interview script](interview-script.md)).
