# The road to 1.0 — kadence

- **Date:** 2026-09-08
- **Method:** a destination (Cagan-style narrative, five years), a definition of `1.0.0` as a set of gates, and Now / Next / Later horizons stated as outcomes. Evidence in [ecosystem-and-monetization-2026-09.md](../research/ecosystem-and-monetization-2026-09.md).
- **Relation to [roadmap.md](roadmap.md):** that document is the next six weeks and stays authoritative for them. This one is the whole arc to 1.0 and the ecosystem around the binary. Where they disagree, the shorter horizon wins, because it is closer to evidence.
- **State:** `kadence@0.3.0`, six days after the first commit. One star. Zero known users. Our own board is the only journal we can observe. The site is live at [kadence-site.vercel.app](https://kadence-site.vercel.app/) from its own repository, with `facts.json` sourcing every number (ADR-008 executed).
- **Execution plan:** [tasks/plan-to-1.0.md](../../tasks/plan-to-1.0.md) — milestones 14–20, tasks T50–T79, three tracks each (product, users, engineering), gate evidence table at Checkpoint 20.
- **Decisions taken 2026-09-08:** see §9. Reputation project with the door open; G1 at five repositories; the site already exists; Windows is a gate; the single binary is measured once, then decided.

## Assumptions this document stands on

The skills we build with require naming them at the top when they are unproven. They are unproven.

1. **Segment:** teams of 3–8 developers who already work with coding agents and keep work next to code. A guess ([PRD §3.2](../PRD.md)).
2. **The bet:** such teams lose enough context between sessions — human to human, human to agent, agent to agent — to keep a journal for it. Named by the field (Beads' "50 First Dates", the $19–249/month memory-layer market), never confirmed on our users. Probe B, still not run.
3. **Dates are absent on purpose.** A solo developer with no users who writes quarters is inventing precision. Versions are ordered; they are not scheduled.

---

## 1. Where we are going

### The world in 2031, if this works

A developer at a forty-person company opens a repository she has never seen. Her agent — whichever vendor she uses this year — runs one command and knows which task is in review, why the last refactor was abandoned, who decided the auth library on a Tuesday in March, and what the team's last six sprints actually cost. Nothing was written for the agent. It was written by the work, as the work happened, into files that merged from nine branches without a single conflict and that `git checkout v2.3` still reproduces exactly.

Her tech lead reads the same journal in a terminal. Her manager gets the sprint's cost from the same events, not from a form anyone filled in. A second agent from a different vendor, on a different machine, sees the same history, because there is no account to log into and no service that could disagree.

**What this rules out.** We will not run a server for the core, ever. We will not be a bridge to Jira or GitHub Issues. We will not track time by timer. We will not serve organizations of two hundred whose procurement wants SSO before a trial — if that market ever matters, it is a separate product on top of the same open format, never a change to the format.

### Two users, two surfaces

The product claims two users, and they read differently. **The agent needs no screen:** it reads `--json`, and Probe C showed that answer is 948 bytes at any size. **The human needs one:** the CLI for the dozens of small commands a day, and the TUI to *see* the work — columns, priorities, a card to open, a sprint to close. The TUI is therefore not polish on top of the product; it is the half of the product the human touches, and the four bugs that shipped past a green suite all lived there.

Three rules follow:

- **Parity.** Everything the CLI can do is reachable from the board, and the board calls the same function the CLI does. The test that every field in the dialog is backed by a real command stays.
- **Tested where it can be, used where it cannot.** Key routing is a pure function with tests; the rest is verified by a human running `kadence ui` before every release (G7).
- **Still no web UI.** The human's surface is the terminal, without a server. If someone needs a browser view, the core-as-library item exists so they can build one that reads the files — as Beads' community did — without us hosting anything.

### One sentence

> Your team and your agents work from the same context. It lives in your repository and remembers what the code cannot.

That sentence is already the README's. This document does not change the destination; it defines the distance.

### Why now

Three things moved in the last twelve months and none of them is ours:

- **The agents got memory, and it is private.** Claude Code's Auto Memory lives in the user's home directory, does not sync between machines and is invisible to a teammate. The vendors solved single-user amnesia; nobody solved shared amnesia.
- **The category got a leader with our pitch.** Beads (26.8k stars, 22.9k npm downloads a month) sells "memory for agents" — with a Dolt database, a daemon and a git ref namespace of its own. It proved the demand and left "plain files, zero dependencies" empty.
- **Context files got measured.** ETH Zurich showed that long generated `AGENTS.md` files cost 20% more and help less than nothing. "Fetch on demand, keep the static part short" went from our preference to the published recommendation.

---

## 2. What `1.0.0` means

SemVer's test is blunt: production use and an API people depend on. For a tool whose data sits in other people's repositories, the API is the **event format, the `.kadence/` layout, the `--json` contract and the error codes.** 1.0 is the moment we can be held to them.

Seven gates. Every one is checkable; none is a date.

| # | Gate | How we know | Where it stands today |
|---|---|---|---|
| G1 | **Someone we do not control depends on it** | ≥ 5 public repositories with `.kadence/events` from two authors 14 days after `init` ([North Star](north-star.md)), found by GitHub search; plus ≥ 5 Probe B conversations completed | 0 and 0 |
| G2 | **The bet has an answer** | Probe B reports whether people name context loss before we do; Probe E measures the same task with and without the journal (clarifying questions, tokens) | Neither run |
| G3 | **The contract is frozen and proven** | A compatibility suite folds fixtures from every 0.x release into the same state; `kadence schema --json` is additive-only under test; a written deprecation policy | Schema test exists (ADR-009); no 0.x fixture corpus, no policy |
| G4 | **It installs everywhere it claims to** | CI matrix: npm, pnpm, yarn, bun on macOS, Linux, Windows; a Homebrew tap; `npx`/`pnpm dlx`/`bunx` smoke test | Node shebang verified; no matrix, no Windows CI, no tap |
| G5 | **It survives real size** | 10k events cold ≤ 200 ms and warm ≤ 20 ms stay in CI; `board --json` no longer grows with history (Probe C finding 4); compaction tested on a real-size journal | Budgets tested; `board --json` unfixed |
| G6 | **The site exists and every number on it has a source** | `kadence.tools` live; `content/facts.json` with a `source` per figure (ADR-008); docs generated from `--help` and `schema --json`, not typed | Site live on the Vercel subdomain; `facts.json` with a source per figure; docs and quickstart exist but are typed by hand; no custom domain yet |
| G7 | **A human has used every screen** | The TUI checklist in CLAUDE.md run on the release candidate; the `init` section length under a guardrail test | Checklist informal; no length test |

**What 1.0 does not require:** an MCP package, a web UI, a single binary, an importer. Each may arrive before 1.0 if a Next item earns it; none is a gate.

---

## 3. Horizons

Outcome first, feature second. Later is vague on purpose — metrics on unresolved questions are invented precision.

### Now — `0.3.x`

Unchanged from [roadmap.md](roadmap.md): **one product item, and it is not a feature.**

**Enable us to** learn whether teams of 3–8 lose context between sessions **so that** every item below is ordered by evidence, not by our reasoning.

- Probe B: 5–7 conversations by the [script](../research/interview-script.md). Counter-metric: conversations where we named the problem first must be zero.
- Dogfood `kadence decision` in this repository for two weeks. Zero `decision` events here is a free answer about the operating model that no code will fix.

Two ecosystem items ride along **because they cost hours and add no bet:**

- **G4, first half.** A CI job that installs from the packed tarball with npm, pnpm, yarn and bun and runs `kadence --version` and `kadence schema --json` under each. Not a feature; a proof that the one package already works.
- **G1, instrument.** A weekly search for public `.kadence/events` directories, recorded in a file. If the instrument cannot see anything, we learn that before we need it.

### Next — `0.4` to `0.6`

Conditional on Probe B. If the answer is "no context loss", the first two items vanish; the rest stay because they serve the narrower product ([positioning](positioning.md) plans for it).

**`0.4` — the agent's loop, the human's proof, and the branch.** *(Rescoped 2026-09-09 by the owner; reasoning and per-feature verdicts in [feature-adoption-2026-09.md](feature-adoption-2026-09.md). This is the second time a feature set goes ahead of Probe B; it is recorded as such, and the 22 September date stands.)*
**Enable** an agent starting a session **to** learn what to do next and claim it in two calls, and a human **to** see what "done" was measured against, **so that** neither re-derives the state of the work. `ready`, `prime` with an opt-in session hook, `claim` with contested-not-rejected merges, `note`; acceptance criteria with a Definition of Done; milestones; `stats` and shell completion; `task list --branch` after checking it is not `--search` renamed; `board --json --summary`. Three former "no"s become experiments with kill conditions: a static HTML/Markdown export instead of a web UI, a separate one-way `@kadence/github` package instead of sync, create-and-link instead of storing documents. Seventeen tasks in three shippable slices, [plan Milestone 15](../../tasks/plan-to-1.0.md).

**`0.5` — the ecosystem.**
**Enable** a team that has never heard of us **to** go from a search result to a working board in under five minutes without reading the repository **so that** Probe B's successors come from outside our network.
- The site already exists ([ADR-008](../decisions/008-where-the-site-lives.md) executed; `facts.json` in place). What 0.5 adds: the `kadence.tools` domain, reference docs generated from `--help` and `schema --json` instead of typed, the demo recording, and a line in the release checklist that `facts.json` is verified against each npm publish. The "Book twenty minutes" CTA is Probe B's recruiting channel from outside our network.
- Homebrew tap. Core when notability allows (≈75 stars, 30 days); not sooner, they will refuse.
- Nix expression if a contributor wants it; one file, real audience.
- **Probe E**, the with/without-journal measurement. Its result is the only speed claim the site may ever carry.
Metric: README-to-`init` conversion > 5% ([lean canvas §5](lean-canvas.md)); site visits that end in a copied install command.

**`0.6` — the doors in.**
**Enable** a team already on Beads or Backlog.md **to** carry its history into a journal in one command **so that** switching is a decision, not a project. Importers from Backlog.md markdown and Beads' `issues.jsonl` — the latter is their declared interchange format. Gate: Probe B says migration is a channel; otherwise this stays Later.
Optional MCP package, only when a user appears who cannot call a CLI ([Probe C](../research/probe-c-agent-cost.md) removed the token argument).

### Later — `0.7` to `1.0-rc`

Hardening toward the gates. No metrics here; the questions are still open.

- **Contract freeze (G3).** Fixture corpus from every 0.x; compatibility suite; deprecation policy; `board --json` pagination or projection so it stops growing with history.
- **Size (G5).** Compaction exercised on a journal of 10k+ events in CI, not a synthetic one; a `doctor` command that rebuilds, verifies and reports.
- **Platforms (G4).** Windows CI; line endings, paths and the editor path in the TUI are the known risks.
- **Single binary.** Bun `--compile` or Node SEA, *measured*: start time, size, and whether anyone without Node ever asked. winget and scoop only after a binary exists.
- **Agent surface.** Guardrail test on the `init` section length. Revisit per-vendor entry points only if a major agent stops reading `AGENTS.md` (ADR-009).
- **Release candidate.** `1.0.0-rc.1` sits for a stated period with no contract changes; the TUI checklist is run by hand; then `1.0.0`.

---

## 4. The ecosystem around the binary

| Channel | What it takes | When |
|---|---|---|
| **npm, pnpm, yarn, bun** | One registry. `npx`, `pnpm dlx`, `yarn dlx`, `bunx` all run the same package; `bunx` honours our `node` shebang. Cost is a CI matrix, not code | Now |
| **Homebrew** | Personal tap: one formula, one repository, a hash per release. Core later, when notable | Next (tap) · Later (core) |
| **Nix** | One expression, as Backlog.md ships | Next, if asked |
| **Single binary; winget, scoop** | Bun compile or Node SEA plus an arch-switching bin. Measure before deciding | Later |
| **Deno / JSR** | Different registry, different audience. Not planned | — |
| **Site (`kadence.tools`)** | Live from its own repository on Vercel with `facts.json`. Remaining: custom domain, docs generated from the tool, demo | Exists · Next |
| **Agent skill packages** | A `SKILL.md`-style package for Claude Code, Cursor rules and the skill marketplaces where Beads is already listed. Agents install tools their users ask for; this is where they look. Cheap, and it is also a length-controlled alternative to growing the `init` section | Next |
| **Core as a library** | Publish the projection and the event schema as an importable package so others can build viewers and integrations on the format without us running anything. Beads' community built its own TUI and web viewers; that only happens when the format is buildable-on | Later |
| **Agent entry points** | Short section in `AGENTS.md` and `CLAUDE.md`, regenerated on `init`; length under test | Now (exists) · Later (test) |
| **MCP** | Optional package; trigger is a user who cannot call a CLI | Next, conditional |
| **GitHub Action** | Runs the CLI in CI to post velocity or a board to a PR. Offline inside the runner, so within the rules. Only if a user asks | Later, conditional |
| **Editor extensions** | No. The TUI is the second surface; a third splits a solo developer | — |

---

## 5. Money

The [lean canvas](lean-canvas.md) said on day one that an MIT CLI in a category of MIT CLIs has almost no direct revenue, and that the honest reward is reputation. Nothing found since contradicts it: Beads, Backlog.md, git-bug and git-issues sell nothing. What people *do* pay for in this neighbourhood is hosted memory — $19 to $249 a month — and every one of those is a service, which is the thing we promise never to be.

**Decision for now: the core is MIT, forever, and nothing about the journal format is ever gated.** The format is the product; a paid format is a dead format.

**What remains possible, in order of plausibility:**

1. **Sponsorship.** GitHub Sponsors and a company FOSS fund or two. Real tiers run $50–1,000 a month with no deliverables. It pays for a domain, not a salary. Turn it on at 1.0, not before — asking with zero users is noise.
2. **Support and consulting.** Helping a company adopt the journal across teams. Requires the company to exist first.
3. **A product on top, outside the core.** Views across repositories and organizations — velocity for twenty repositories, decisions across a company — need a server *by nature*, so they do not break the core's promise; they sit beside it. This is the only open-core shape that does not betray the README. It is also a guess: nobody has asked. **Do not build toward it. Do not close the door on it:** keep the event format open and documented, keep the projection reusable as a library.

**What we will not do:** dual licensing, a "community edition" with features removed, telemetry to learn what to charge for.

The moment to revisit this section is when G1 is observable and above zero. Until then the question has no data, and a monetization plan without users is a wish with a spreadsheet.

---

## 6. How we help, and how much — the honest version

We are asked how much we accelerate development. **We do not know, and neither does anyone selling a claim like it.** METR's randomized trial found experienced developers 19% slower with AI tools while believing they were 20% faster; their follow-up collapsed because developers refused to work without the tools. Self-reported speed is not evidence in this field.

What we have measured, and may say:

- The answer to "where does this task stand and how did it get here" is **948 bytes** whether the project has ten tasks or a thousand, while the journal behind it grows to 528 KB. The cost of asking does not grow with the history that makes the answer worth having ([Probe C](../research/probe-c-agent-cost.md)).
- Linking a document to a task cut what an agent had to sift by **up to 34×** across five real questions — an upper bound, and we say so ([Probe D](../research/probe-d-docs-linkage.md)).
- Three people editing one task on three branches, merged in every order: **zero conflicts**, every intent preserved ([Probe A](../research/probe-a-results.md) and the integration test).

What we help with, in words rather than numbers: **less re-explaining.** The human does not retell Tuesday's decision; the agent does not reread the repository to learn what is blocked; the second machine and the second vendor see the same history as the first. Whether that is worth minutes or hours a week is Probe E's question, and the site carries no speed number until it is answered.

---

## 7. Not doing

Carried from [roadmap.md](roadmap.md) and extended.

| What | Why |
|---|---|
| A hosted core, an account, telemetry | The promise. Also the only differentiation the memory-layer market has left us |
| **Two-way** sync with GitHub Issues or Jira | The fastest way to become a mediocre bridge. *Since 2026-09-09:* a **one-way publish** is an experiment in a separate package that shells out to `gh`; the core still makes no request, and nothing is ever read back ([feature-adoption](feature-adoption-2026-09.md)) |
| A web **server** | Contradicts "no server". *Since 2026-09-09:* a **static HTML/Markdown export** is an experiment — a file, no process, no port |
| Manual time tracking | Time is derived from events; a timer contradicts the idea |
| `delegated` / `automated` context levels | Need a daemon ([context-handoff §1.2](../research/context-handoff-2026-09.md)) |
| A `kadence doc` that **stores** documents | Git already does; we link ([Probe D](../research/probe-d-docs-linkage.md)). *Since 2026-09-09:* `task doc add` creates the file from a template and links it in one command — still only the link is kept |
| `llms.txt` | 10% adoption, no correlation with citations ([§6](../research/agent-readability-2026-09.md)) |
| Editor extensions | A third surface for a solo developer |
| Competing with Spec Kit on specifications | It writes the spec; we remember what happened to it |

---

## 8. How this document could be wrong

- **Probe B says "no".** Next shrinks to `0.5` and the importers; the product is a conflict-free journal with sprint cost for a narrower segment. 1.0 still has meaning; G2 is answered in the negative and the site says so.
- **A vendor ships committed, project-scoped memory.** Our differentiation narrows to cross-vendor and to the cost analytics. Then velocity moves back toward the headline, which the [positioning review](positioning-review-2026-09.md) already argued is the one empty cell.
- **Beads adds a plain-file mode.** Their Rust community port froze exactly that. If the main project follows, we compete on zero dependencies and append-only alone; the merge proof (Probe A) becomes the headline again.
- **Nobody without Node ever appears.** Then the single binary, winget and scoop are deleted from Later without regret.
- **The gates are too strict for a solo developer.** Then 1.0 is later, not smaller. Lowering G1 or G3 would make 1.0 a label instead of a promise, which is the thing SemVer exists to prevent.

---

## 9. Decisions taken — 2026-09-08

None of these was derivable from evidence; each changes what gets built. The owner decided the same day the document was written.

1. **Monetization intent: reputation now, door open.** Core MIT forever; the format never gated; the projection kept reusable as a library so a product on top stays possible. Sponsorship at 1.0, not before.
2. **G1 threshold: five** public repositories with two authors 14 days after `init`, plus five Probe B conversations.
3. **Site: already live.** The question was moot — [kadence-site.vercel.app](https://kadence-site.vercel.app/) exists with sourced numbers, docs and a "Book twenty minutes" CTA. That CTA becomes Probe B's outside channel. G6 keeps the domain and the generated docs.
4. **Windows is a gate** (G4). A journal that corrupts on one platform is trusted on none.
5. **Single binary: measure once** during `0.7`, one afternoon, then decide. Not assumed either way.

---

## 10. Does this deserve to live — and how we would know it does not

Asked plainly on 2026-09-08. The plain answer: **as software it already lives; as a product it has not yet earned the right to.** The difference is a person we do not control depending on it.

**Desk discovery the same day** ([discovery-verdict-2026-09.md](../research/discovery-verdict-2026-09.md)) narrowed the answer to one sentence: *the product makes sense as the plain-file, append-only, zero-dependency journal for repositories where more than one human or more than one agent vendor works — and as nothing else.* The users of the category leader asked for exactly that shape, with reaction counts, and lost it. Three things it is **not**: a velocity product (zero requests across 1,076 open Beads issues and all of Backlog.md's), a "memory for agents" product (six projects above 5,000 stars own that axis), or a solo-developer tool (vendor memory now covers the single person on the single machine).

### The case for

- The category was validated by someone else's money and attention: Beads at 26.8k stars, a hosted-memory market charging $19–249 a month.
- The vendors' own memory is per user and per machine. Shared, versioned, cross-vendor memory is unsolved and is what a repository already is.
- Our shape — plain files as the source of truth, zero dependencies, no daemon, append-only — is the one nobody with an audience occupies, and it is measured, not claimed.
- The cost analytics (velocity, hours per point, burndown from events) exist in no neighbour.

### The case against

- No unfair advantage. Beads could add a plain-file mode in a fortnight; their community already froze one.
- The bet is ten months old and untested. The script for testing it has existed since 2026-09-02 and has not been used. That is the single most damaging fact in this document.
- One maintainer. Assumption #11 in the [map](../research/assumptions-map.md): open source without money must outlive the author's enthusiasm.
- The name is taken by a WordPress builder with 400,000 installs; organic search is closed.

### Pre-mortem: it is 2027-03-01 and kadence is abandoned. Why?

| Risk | Kind | Evidence | Urgency |
|---|---|---|---|
| Probe B was never run; we kept shipping mechanics to a segment we never spoke to | **Tiger** | Six days, four features, zero conversations | **Blocking.** Owner: the owner. Decision date: 2026-09-22 — either five conversations booked or the reason written down |
| Nobody found it: one star, a name that belongs to someone else, no channel with a tested conversion | **Tiger** | Lean canvas §5 had channel tests; none has run | Fast-follow: run the README→`init` and one-post tests within 30 days of Probe B |
| Beads shipped a plain-file mode and the differentiation collapsed to "append-only" | **Tiger** | Their Rust port froze SQLite+JSONL (1,075 stars); a markdown-backend RFC with a working branch sits in their tracker; `decisions.md` appeared on 2026-09-08 | Track. Mitigation is speed to G1, not code — the shape is being rediscovered monthly |
| The author's attention moved to the next project | **Tiger** | Portfolio of 28 repositories on the same account, most idle | Track. Kill criteria below are the mitigation |
| No MCP, so agents could not use it | Paper tiger | Probe C: ~700 tokens a session; Beads' users call a CLI | — |
| No web UI, so PMs would not adopt it | Paper tiger | Positioning: PMs work through agents; the TUI exists | — |
| Node instead of a binary | Paper tiger | 60 ms start; no one has asked | — |
| **What the owner actually wants from this**: a product, a portfolio piece, or a place to practise the method | **Elephant** | Decision 1 says reputation. A reputation project does not need 1.0; it needs the article with the numbers | Name it before Probe B, because it changes whether a "no" from Probe B ends the project or just the roadmap |

### Kill criteria

Written now so that the decision later is not made by fatigue.

The project moves from "product" to "finished portfolio piece" — README updated to say so, no further features — if, **90 days after the site carries Probe B's answer**, all of the following hold:

- fewer than 20 `init`s we can see (site copy-clicks, npm weekly downloads above the bot floor, public `.kadence/` directories);
- zero public repositories with a second author;
- zero inbound questions, issues, or forks with changes;
- and Probe B found no one who named context loss unprompted.

Any one of the four being false keeps it alive. The clock does not start until Probe B is done — which is one more reason Probe B is the only item in Now.

### How it grows if it lives

Not by features. By the order in [prioritization.md](prioritization.md)'s own finding: research supplies the backlog cheaper than prioritization orders it.

1. **The format is the product.** Everything else — CLI, TUI, site, skills, library — exists to make the format worth adopting and safe to depend on. Anything that would gate or fork the format is out.
2. **Kadence runs on kadence.** This repository's journal is the first case study and the first place `decision` either proves its operating model or does not.
3. **Go where the agents look.** The `AGENTS.md` convention, a skill package, the marketplaces that list Beads. Agents install what their users ask for, and users ask for what the agent already knows.
4. **One article with the numbers**, as the lean canvas planned: 8,396 merges, 948 bytes, 0 conflicts. Authority in a narrow topic is the only advantage a solo MIT project can build that is hard to copy.
5. **Doors in, never doors out.** Importers from Beads and Backlog.md; no sync to Jira or GitHub Issues.
6. **Let others build on it** by publishing the core as a library, so viewers and integrations appear without a server of ours.
