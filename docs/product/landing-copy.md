# Landing copy — kadence

- **Date:** 2026-09-16. Rewritten for `kadence@0.4.1` and [strategy.md](strategy.md). Replaces the 2026-09-04 copy, which described the product at 0.2.
- **Message:** a team and its agents work from the same context, kept in the repo. The journal is the mechanism. Conflict-freedom is proof, not the headline. Velocity and reports are present but never headlined ([strategy §1](strategy.md)).
- **Order of the page:** the buyer's activation path (set up → capture → hand off → record why → see what is unattended → leave), not the list of commands. The same path as [story-map.md](story-map.md).
- **Page language:** English, reading level ≤ grade 8.
- **Skills used:** `copywriting` (structure, headline formulas, CTA), `design-ux-writing` (microcopy, FAQ, honest-status tone), `product-story-mapping` (section order).
- **Unchanged decisions:** hosting on Vercel at `kadence.guru` (since 2026-09-13); every number traced to a file in `content/facts.json` (ADR-008); a static page with no cookies.

### Rules this copy obeys

From [strategy §8](strategy.md) and the [tech-lead feedback](../research/tech-lead-feedback-2026-09-10.md):

- **No speed claims** until `probe-e-results.md` exists. Timings may appear only as *tested budgets* in the cost table, never as "fast", and never compared with another tool.
- **No "used by", logos or testimonials** until `north-star-log.md` has a real repository.
- **Never "drift from reality".** Say "the board cannot drift from the journal", and state the limit in the same place: *it only knows what gets written to it*.
- **Never "Beads is wrong".** Competitors appear only in the FAQ, and only as a fact about storage.
- **Nothing Unreleased is promised as shipped.** Items marked `[UNRELEASED]` stay off the page until they are on npm.
- **Every number carries `[src: …]`.** The marker is for the build and `facts.json`, not for the reader.

---

## CTA hierarchy

| Level | Action | Where | Measured by |
|---|---|---|---|
| **Primary** | `npm install -g kadence` with a Copy button | hero; repeated in the final section | copy clicks ÷ visits (KR 4.3: ≥ 5% by Nov 24) |
| **Research** | **Book thirty minutes** | a quiet link in the hero; a button in the honest-status block; a button in the final section | bookings (channel O7, "cannot be killed; zero is data") |
| Secondary | Quickstart → Docs | under the install command; end of "How a team starts" | clicks |
| Tertiary | GitHub · npm · Changelog · Decisions | nav and footer | clicks |

**Why install stays primary and the booking is the second button.** The self-serve test (KR 3.4) and the Show HN post both depend on someone installing without us, so the page's single conversion is the install. "Book thirty minutes" is the page's second and last button. It is a research ask, placed where a reader has just seen what is *not* proven. It replaces "Talk to us for 20 minutes": 30 minutes matches the interview length in strategy §2, rule 4, and the pilot install (20 minutes) is offered only on the call.

**Alternatives considered for the booking label:**
- A: **Book thirty minutes**: chosen. It is short, names the cost, and matches strategy O7 and roadmap-to-1.0.
- B: "Tell us how your team hands off work": says more, but it is too long for a button and names the problem for them, which the interview rules forbid.
- C: "Join the research": vague about the cost.

**Not on the page:** `Book a demo`, `Contact sales`, `Star us on GitHub`, an email form, a newsletter.

---

## Meta

```
title:       kadence — shared context for your team and your agents     (55 chars)
description: Tasks, decisions and their full history as append-only files in
             your git repo, so a teammate or a new agent session starts from
             what was already tried.                                      (~150 chars; recount at build)
og:image:    `kadence decision list` output on the site's own background, captured from the binary
```

---

## 1. Hero

**H1**

> Your team and your agents, working from the same context.

**Subheadline**

> kadence keeps tasks, decisions and their whole history as append-only files in your git repo. When a teammate or a new agent session picks up the work, it starts from what was tried, decided and blocked, not from you explaining it again.

**Qualifier line** (small, under the subheadline)

> For repositories where more than one person, or more than one agent, works. No server. No account. No network.

**Primary CTA**

```
npm install -g kadence          [ Copy ]
```

> then `kadence init` in your repo · [Quickstart →](/docs/quickstart) · Node 20 or newer
> Not proven yet, and we're asking. [Book thirty minutes](#honest-status)

**Terminal block on the right.** This is real text, captured from the published binary at build time and never typed by hand. It shows a handoff in two commands:

```
$ kadence decision add "Keep sessions in cookies" \
    --why "The redirect drops the header, not the cookie" \
    --rejected "JWT in localStorage: XSS surface" --task KAD-1

# next day, a teammate's agent starts a session
$ kadence prime
  …
  Decisions in force
    DEC-3  Keep sessions in cookies  (KAD-1)
  …
```

**Annotations**

- **H1** uses the formula *{key benefit} for {audience}* from the copywriting skill. It is kept identical to the README's opening line so the site, npm and GitHub say one thing.
- **The subheadline** follows the job statement in strategy §1 almost word for word ("what was tried, decided and blocked"). It says "decisions" where the 0.2 copy said "the time they took", because time is a report and reports are not headlined.
- **The qualifier** is the discovery verdict's sharpening: *more than one human, or more than one agent vendor*. It filters out solo developers, who are "not for" in the ICP.
- **Why this terminal block and not `task show --json`:** the job is a handoff, and a decision appearing in the next session's preamble *is* the handoff. The old block showed one task's state, which is the mechanism rather than the outcome.
- **Before publishing,** replace the `…` lines with the real `prime` output from the published version. If `prime` prints decisions in a different shape, the block follows the binary, not this document.

**Headline alternatives**

- A: **Your team and your agents, working from the same context.** Chosen. It is continuous with the README and names both users.
- B: *The next agent session already knows what your team decided.* More concrete, but it drops the human teammate, and the North Star counts humans.
- C: *What was tried, decided and blocked — in the repo, for whoever picks it up next.* It is precise, but reads as a description rather than an outcome. Keep it for the og:description if A tests poorly.

---

## 2. Three things we can prove

This section replaces the social-proof bar. We have no users to quote, so we show three measurements instead. Each card is one number, one sentence and a link to the evidence.

**Card 1 — One call, the whole story**

> **982 bytes** `[src: README "What it costs you"]`
> is what an agent reads to learn one task's status, blockers, criteria, comments, decisions and every step so far. It stays that size however long the task has been worked on. There is a 304-byte summary `[src: README "What it costs you"]` when that is all an agent needs.
> [How we measured it →](docs/research/probe-c-agent-cost.md)

**Card 2 — Two branches, one task, no conflict**

> **8,396 merges in 130 repositories** `[src: docs/research/probe-a-results.md]`
> We checked public repositories that keep tasks as files. **15% of them** had merge conflicts in task files `[src: probe-a-results.md l.29; 20 of 130 = 15.4%]`, and **89% of those conflicts** were the content type `[src: probe-a-results.md l.51–55; 25 of 28 classified]` that append-only files remove. Three branches editing one task, merged in every order, give zero conflicts `[src: test/integration/merge.test.ts]`.
> [The data →](docs/research/probe-a-results.md) · [The test →](test/integration/merge.test.ts)

**Card 3 — History grows; the cost of reading it is tested**

> **10,000 events: 21 ms** from a cold start with a compacted archive, **12 ms** warm, and **199 ms** if every event is still its own file `[src: README "What it costs you"; test/perf.test.ts; CHANGELOG 0.4 "Fixed before release"]`.
> These are test budgets, and the build fails if a change breaks them. `kadence compact` is how you get from the third number to the first.

**Annotations**

- **Card 3 is a cost statement, not a speed claim.** It does not say "fast" and compares against nothing, which keeps it inside strategy §8. It prints 199 ms because that is the uncompacted default most repositories will have, and hiding it behind the 21 ms would be exactly the overstatement the 0.4 changelog corrected ("the earlier 11 ms cold figure was a warm read").
- **982, not 948.** 948 bytes was measured at 0.2.1 (Probe C), before claims and criteria were added to the record. The inventory says to use 982 for today's product and 948 only when citing Probe C.
- **"Rare" is said later, in the honest-status block** (one merge in two hundred), so Card 2 cannot be read as "conflicts are everywhere".

---

## 3. Problem

**H2**

> Your code says what. Git says when. Nothing says why.

**Before**

> A task changes hands. Someone tried an approach and dropped it. A decision got made in a thread. Two weeks later, the only trace is a diff that does not explain itself.

**Agitate**

> For a teammate, that costs an interruption. For an agent, it costs the session: it re-reads the same files, asks the question you answered yesterday, and sometimes takes the path you already rejected. With three people and two agent tools in one repo, it happens every day, and nobody sees the whole of it.

**After**

> kadence keeps that layer as events, committed with the code. Whoever picks up the work next, person or agent, reads the same history. It only knows what gets written to it, so it is built to make writing cheap: one command, from the terminal or from the agent.

**Annotation.** "It only knows what gets written to it" appears in the first section that makes a promise, not in the FAQ. That is the limit the tech lead named. Saying it early costs a little conversion and buys the trust the pilots need.

---

## 4. How a team starts

The activation path, as four numbered steps with one outcome each. This is the section a tech lead reads to decide whether a pilot is worth an afternoon. The order and scope match slice 1 of [story-map.md](story-map.md).

### Step 1 — Set it up once

> ```
> kadence init
> ```
> This creates `.kadence/` and adds a short, marked section to `AGENTS.md` and `CLAUDE.md`, so any agent in the repo knows where to look. Nothing is committed; that is your call. On Claude Code, `kadence init --hooks` makes every new session start with `kadence prime`.
> [Exactly what init touches →](#faq-init)

### Step 2 — Write the work down, and what done means

> ```
> kadence task add "Fix login" --type bug --priority high
> kadence task ac add KAD-1 "redirect keeps the session"
> ```
> People and agents use the same commands. Anything an agent writes is marked as the agent's (`KADENCE_SOURCE=agent`), even though you share one git identity.

### Step 3 — Hand it off

> ```
> kadence prime          # the sprint, your work, what is ready, decisions in force
> kadence task claim     # take the top of what is ready
> ```
> A teammate's next agent session opens with the same picture you have. `prime` is held to 40 lines and 3 KB by a test `[src: CHANGELOG 0.4.0; test]`, because the agent pays for it on every turn that follows. If two people claim the same task before either pushes, the task shows both names as `contested`. It does not silently pick one.

### Step 4 — Record why

> ```
> kadence decision add "Keep sessions in cookies" \
>   --why "The redirect drops the header" --rejected "JWT in localStorage"
> ```
> The reason and the options that lost stay next to the code. When you change your mind, you supersede the decision rather than edit it, and the old one stays readable as history.

**Secondary CTA:** `Read the quickstart →`

**Annotations**

- **Each step is a user action with an outcome**, following the "How it works" pattern in the copywriting skill. It is four steps rather than three because "record why" is what tells us apart, and it cannot be folded into "hand off".
- **`--rejected` is used once in the example.** Passing it twice crashes in 0.4.1, and the fix is unreleased. Once the fix is on npm, show two `--rejected` flags, because that is the real use.
- **Kept off this section:** sprints, milestones, DoD, templates, the TUI and reports. They are real, but they aren't how a second author appears.

---

## 5. When nobody is looking

**H2**

> A journal can't watch the work for you. It can tell you what nobody touched.

> ```
> kadence report attention
> ```
> This lists work that has stalled in a started column, has no owner, has a claim nobody is using, or is waiting on a blocker that is already closed. The same short list appears in `prime` when there is something to say. It shows up when you ask, with no notifications and nothing running in the background.

**Annotation.** This section answers the tech lead's actual objection: drift comes from attention, not storage. It is also the only shipped report that belongs to the handoff story rather than to measurement, which is why it gets its own section while the rest are grouped in section 7.

---

## 6. Why events, not files

**H2**

> Most tools that keep work in the repo keep its current state. kadence keeps what happened.

Three cards. This is the only card grid on the page.

**State gets overwritten.**
> A spec written on Monday and edited by an agent on Thursday no longer says what happened in between. An event records that something happened; it is never rewritten.

**State conflicts.**
> Two people editing one task on two branches is a merge conflict in a task file. Here each change is its own new file, so there is nothing to conflict.

**State forgets.**
> Rewriting a task file loses the previous version. The journal keeps every step, so "how did we get here" has an answer.

> *Under the cards:* The board is folded from the journal every time you read it, so it cannot drift from the journal. It still only knows what was written to it. A task nobody has touched for three weeks shows up accurately, and that alone doesn't make it right.

**Annotations**

- **"It drifts" became "state gets overwritten".** "Drift" meant two different things to us and to our first reader. The card now names the mechanism, and the under-card line keeps the defensible claim and its limit together, as the tech-lead feedback proposed.
- **No competitor is named here.** Spec Kit, Beads and Backlog.md appear only in FAQ 2, as a fact about storage.

---

## 7. What else the journal knows

**H2** (deliberately small; this is the H2 styled one level down)

> Because every change has a timestamp, some answers come for free.

A compact two-column list, with no hero numbers and no charts in this section:

| Ask | Command | Status |
|---|---|---|
| What does the board look like? | `kadence ui` (keyboard, mouse, drag between columns) · `kadence board` | shipped |
| How did the sprint go? | `kadence sprint close`: points done, hours, carry-over | shipped |
| How long does work take? | `kadence report flow`: p50 / p85 / p95 cycle time, WIP, aging work | shipped |
| Where does work pile up? | `kadence report cfd` | shipped |
| Can I send this to someone without the CLI? | `kadence board export --html` or `--md`: one self-contained file | shipped |
| Can people outside the repo see chosen tasks? | `npx @kadence/github publish KAD-1`: one way, through `gh` | shipped (experiment) |
| Velocity as a range; who carries what; report pages with charts | `report velocity` · `report workload` · `report <name> --html` | **[UNRELEASED]**: add a row only after publish |

> *Under the table:* No averages anywhere. Velocity is a range, and every figure names the window it was measured over.

**Annotation.** This follows strategy §1: "Velocity and reports: present, not advertised. In no headline." The section sits after the differentiation and before cost of ownership, so a manager who scrolls finds it and a tech lead deciding on a pilot is not distracted by it.

---

## 8. For agents

**H2**

> Files first. Any agent that can run a command can read it.

> Every command speaks `--json`, and every response carries `schema: "kadence/v1"`. stdout is JSON and nothing else; warnings go to stderr. A failure carries an error code and, where it can be known, the list of allowed values, so an agent can recover without guessing your project's column names.

```bash
kadence schema --json                        # every command, field and error code
kadence ready --json                         # what can be started, in a few fields
kadence board --json --summary               # column state without the history
KADENCE_SOURCE=agent kadence task move KAD-1 in_progress
```

> `init` writes the same short guide into `AGENTS.md`, the convention most agent tools read, and `CLAUDE.md`, the file Claude Code reads. There is no MCP server to run and no token to issue. We measured an MCP layer at about **700 tokens more per session** than the CLI path `[src: docs/research/probe-c-agent-cost.md, Finding 3]`, so it stays an optional package for someone who cannot run a CLI.

**Annotation.** This section is below the handoff story because the agent contract is well proven but not unique. It is also the door for multi-vendor teams (door 3), who will arrive through `AGENTS.md` and the skill package.

---

## 9. What it costs you

**H2**

> Free, MIT, and small enough to forget about.

| | |
|---|---|
| Price | $0, MIT. The format is never gated `[src: strategy §8]` |
| Install | 76 KB packed; 233 KB unpacked, plus 1.8 MB for the terminal board's one dependency `[src: README "What it costs you"; CHANGELOG 0.4]` |
| Network | none. The core makes no request `[src: CLAUDE.md "Never"; CI grep of the core bundle]` |
| One task, as an agent reads it | 982 bytes, or 304 with `--summary` `[src: README]` |
| 10,000 events | 21 ms cold with a compacted archive · 12 ms warm · 199 ms if every event is its own file `[src: README; test/perf.test.ts]` |
| Journal on disk | under 5 MB, held by a test `[src: README; test/perf.test.ts]` |
| Runs on | Node 20 or newer. CI covers Linux with Node 20 and 22; Windows is not tested yet `[src: package.json engines; .github/workflows/ci.yml]` |

> *Under the table:* These numbers come from tests that fail the build when they regress. They were measured on one machine, not raced against anything.

**Risk reducers** (three short lines, no icons):
- Nothing leaves your machine.
- Leaving is a few deletions, listed in the FAQ.
- Your history is plain JSON that anyone can read without us.

**Annotation.** The old table said 32 KB and 80 ms, figures from 0.1 that are stale. The Windows line is here rather than in the FAQ because it is the most likely reason a pilot fails at install (G4).

---

## 10. Honest status {#honest-status}

A calm block with no warning colours, set apart visually from the sections above it. The status date is printed and updated at the Oct 19 verdict (KR 1.3).

**H2**

> What is proven, and what is not

**Status as of 2026-09-16**

| | |
|---|---|
| **Measured** | The merge claim, on real git branches and in 130 public repositories `[src: probe-a-results.md; merge.test.ts]` · the size of what an agent reads `[src: probe-c-agent-cost.md; README]` · load and size budgets, in tests that fail on regression `[src: test/perf.test.ts]` · the full test suite runs against the installed binary `[src: README "Honest status"; test count from facts.json at build]` |
| **Not measured** | Whether teams working with agents lose enough context to keep a journal for it. We have held **0 interviews** and run **0 pilots**, and we know of **0 external teams** using it `[src: strategy.md, status line]`. The interviews are [designed](docs/research/interview-script.md) and starting now. |
| **Not measured either** | Whether an agent from another team, left alone, reads a decision and acts on it. Whether a teammate starts writing to the journal without being asked. Those are the two things our first pilots will look for. |
| **Known limits** | Conflicts in task files are real but rare: about one merge in two hundred `[src: probe-a-results.md l.43]`. The terminal board is checked by hand; only its key routing is unit-tested. Claims have no lock, by design. A full `board --json` still grows with history, 855 KB at 1,000 tasks `[src: CHANGELOG 0.4 Notes]`; `--summary` and `--fields` exist for that reason. |
| **Not building** | A server, accounts, telemetry, two-way sync, time tracking. MCP only for someone who cannot run a CLI `[src: strategy §8]`. |

**The ask**

> If your team works with coding agents in a shared repo, we'd like to hear how work changes hands today: what gets lost, what you do about it, what you've tried. No demo and no pitch. We ask, you talk, and we write down what we heard.

```
[ Book thirty minutes ]
```

> Nothing is recorded without asking. We don't add you to a list.

**Annotations**

- **The zeros are printed.** Strategy §0 states them, and this audience checks. A page that hides them and gets found out loses the pilots it was written to win.
- **Booking microcopy (UX writing):** the button names the cost, and the line under it answers the two worries people have before booking (recording and lists). There is no "free", because nothing here is for sale.
- **Before publishing:** confirm that the booking tool neither records calls by default nor adds bookers to a list. If it does either, change the line, not the tool setting silently.

---

## 11. FAQ

Seven questions next to the repeated CTA. Each answer starts with a direct first sentence. Mark it up with FAQ schema.

**1. Is this another tracker? We use Jira or Linear.**
> No. It doesn't replace the company tracker. It keeps what that tracker has no place for: what was tried, decided and blocked on a piece of work, in the repo, where your agents can read it. The two live side by side, and `@kadence/github` can publish chosen tasks one way to GitHub Issues if people outside the repo need to see them.

**2. Our agents already read the repo and `CLAUDE.md`. What does this add?**
> The repo says what the code is. `CLAUDE.md` says how to work. Neither says what happened to this task yesterday: the approach that was dropped, the decision behind it, who has it now. That part lives in people's heads and chat threads, and it's what a new session doesn't have. Tools that keep tasks as files, such as Backlog.md, or in a database, such as Beads, store the current state. kadence stores the events, so the history stays and branches don't conflict.

**3. What does `kadence init` change in my repository?** {#faq-init}
> Four things. Nothing is committed and nothing is pushed:
> - **`.kadence/`**: the journal (`events/`) and a short `README.md` for agents.
> - **`AGENTS.md` and `CLAUDE.md`**: a section between `<!-- kadence:begin -->` and `<!-- kadence:end -->`. Either file is created if it doesn't exist. Text you wrote is left alone, and running `init` again updates the section instead of adding another.
> - **`.gitignore`**: one line, `.kadence/state.json`, a cache that is safe to delete.
> - **`.claude/settings.json`**: only with `kadence init --hooks`. It adds one `SessionStart` hook that runs `kadence prime` and keeps your other settings.
>
> kadence reads git (the repository root, your `user.email`, branch history) but never runs a git command that changes anything.
> `[src: src/cli/commands/init.ts; src/agent/contract.ts; src/core/git.ts]`

**4. How do I remove it?**
> 1. Optional: keep a readable snapshot first with `kadence board export --md --file board.md`.
> 2. Delete `.kadence/`.
> 3. Delete the section between `<!-- kadence:begin -->` and `<!-- kadence:end -->` in `AGENTS.md` and `CLAUDE.md`, or delete the file if `init` created it.
> 4. Delete the `.kadence/state.json` line from `.gitignore`.
> 5. If you used `--hooks`, delete the `kadence prime` hook from `.claude/settings.json`.
> 6. `npm uninstall -g kadence`.
>
> One thing to know: events you already committed stay in your git history, as any committed file does. kadence can't erase them, and it doesn't pretend to.

**5. Does everyone on the team need to install it?**
> Anyone whose agent should run `prime`, or who wants to write from the terminal, needs Node 20 or newer and `npm install -g kadence`. The events themselves are plain JSON files that anyone can open. CI tests Linux; Windows is not tested yet, so tell us if it breaks.

**6. Does it work with Cursor, Codex and other agents, not just Claude Code?**
> Yes. The guide goes into `AGENTS.md`, which most agent tools read, and everything is a CLI command with JSON output. Only Claude Code gets the automatic session hook. Other agents follow the instruction in `AGENTS.md`, and we haven't yet watched that happen outside our own repo.

**7. Can anyone else see our work?**
> No. The CLI makes no network requests and has no telemetry. This site counts page views without cookies. Your tasks are files in your repository, visible to whoever can see the repository.

**Annotations**

- **FAQ 3 and 4 answer the exact objection the pilot offer raises.** They are written from the code, not from memory. The old FAQ said "it creates `.kadence/` and appends files to it; it edits nothing", which was false: `init` edits `AGENTS.md`, `CLAUDE.md` and `.gitignore`.
- **FAQ 4 includes the hook,** which the pilot message leaves out, and the git-history caveat, which follows the product's append-only honesty.
- **Dropped from the old FAQ:** "what if we change our mind — `rm -rf .kadence`". It was incomplete; FAQ 4 replaces it.

---

## 12. Final CTA

**H2**

> Try it in one repo, with one teammate, for two weeks.

```
npm install -g kadence          [ Copy ]
```

> then `kadence init` · [Quickstart →](/docs/quickstart)
>
> Or tell us how your team works first: **[ Book thirty minutes ]**

**Annotation.** "One repo, one teammate, two weeks" is the North Star, written as an invitation. There is no urgency and no guarantee line; nothing is time-limited, and "free, MIT" is already in section 9.

---

## 13. Footer

GitHub · npm · Docs · Changelog · Decisions (ADRs) · MIT licence

---

## Demo (to decide before publishing)

The current recording follows the 0.2 story: `init` → `task add` → `kadence ui` → `sprint close`, ending on hours per point. That ending is the message we removed from the headline.

**Proposed re-record (≤ 45 s, no autoplay, click to play, poster is the `prime` frame):**
`kadence init` → `task add` + `task ac add` → `decision add --why --rejected` → *a new terminal, labelled "teammate's agent, next day"* → `kadence prime` showing the decision → `task claim` → `kadence ui` with the claim mark on the card.

- It is recorded from the published package, and after the `--rejected` fix is on npm.
- The rules from [landing-page-research §10](../research/landing-page-research.md) still apply: walk through the scenario by hand three times in the recording window size; nothing in frame outside the script; if something glitches, fix it and re-record rather than cut around it; re-record after any change in `src/tui/`.
- **Owner's call:** re-record now, or keep the current demo placed below section 7 (where velocity lives) until pilots start. Either way, the hero must not lead with the sprint-close frame.

---

## Words not on the page

`tracker` as a self-description · `drift from reality` · `stay in sync` · `fast`, `blazing`, `instant`, `lightweight` or any speed comparison · `used by`, `trusted by`, logos, star counts · `seamless`, `powerful`, `AI-powered`, `revolutionary` · `no MCP` as a slogan · `Beads is wrong` or any competitor as a headline · `context loss` in the hero (the job statement says it better in the user's own terms) · any Unreleased command presented as shipped.

## Check before publishing

- [ ] Every `[src: …]` resolves to an entry in `content/facts.json` with the same value; the markers themselves are stripped from the page
- [ ] 982 / 304 bytes, 76 KB / 233 KB, 21 / 12 / 199 ms and 855 KB re-read from the README and tests at the version being published
- [ ] Test count taken from `npm test` on the published tag, not from this document (the README says 898, CLAUDE.md 910)
- [ ] Nothing marked `[UNRELEASED]` appears, unless `npm view kadence version` shows it shipped
- [ ] The hero terminal block and the `prime` excerpt are captured from the published binary
- [ ] Section 4 shows two `--rejected` flags only once the crash fix is published
- [ ] Honest-status date and counts updated (0 interviews, 0 pilots) on the day of publishing, and again at the Oct 19 verdict
- [ ] The booking link works; the tool doesn't record calls or add bookers to a list by default
- [ ] One H1; `title` < 60; `description` < 155
- [ ] Terminal blocks are text; contrast ≥ 4.5:1 in both themes; the demo does not autoplay
- [ ] Nowhere says "drift from reality"; the under-card line in section 6 includes the limit
