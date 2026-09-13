# Go-to-market: the first users — kadence

- **Date:** 2026-09-08
- **Method:** `gtm-strategy` (seven components), `gtm-icp` (eight dimensions, qualification rubric), `gtm-acquisition-channels` (test / scale / kill per channel). Validator output in §11.
- **Decision this supports:** how kadence gets from zero known users to G1 — five repositories we do not control with two authors 14 days after `init` ([roadmap-to-1.0 §2](roadmap-to-1.0.md)) — and how each step leaves a public trace.
- **Inputs:** [positioning](positioning.md) · [roadmap](roadmap.md) · [roadmap-to-1.0](roadmap-to-1.0.md) · [plan-to-1.0 "Як залучаємо перших користувачів"](../../tasks/plan-to-1.0.md) · [lean canvas §5](lean-canvas.md) · [north star](north-star.md) · [landing research §7, §9](../research/landing-page-research.md) · [ecosystem and monetization](../research/ecosystem-and-monetization-2026-09.md) · [interview script](../research/interview-script.md) · [Probe A data](../research/probe-a-data.csv)
- **Relation to plan-to-1.0:** that file owns the task numbers (T50–T68). This document says *who*, *where*, *what we say*, *what we measure* and *in what order*, and refines three of its lines (§7). Where they disagree, the plan's task ACs win on scope; this document wins on sequencing and thresholds.
- **Status:** working. Every number in §6 is a target, not a measurement.

## Assumptions this document stands on

Named at the top because they are unproven, as the skill requires.

1. **The segment** — teams of 3–8 developers who work with coding agents daily and keep work next to code. A guess ([PRD §3.2](../PRD.md)); Probe B has not run.
2. **The bet** — such teams lose enough context between sessions to keep a journal for it. Named by the field, never confirmed on our users.
3. **Self-serve works for a stranger.** `npm install -g kadence && kadence init` has been run by one person. Nobody outside the author has gone from a search result to a board. Pilot 0 (§7, week 1) tests this before any post does.
4. **The owner's inputs**, given 2026-09-08 and not derivable from the repository: goal is *product first, reputation alongside*; **4–8 hours a week** for GTM work; channels that exist today are the owner's **workplace team that uses agents daily**, **Ukrainian developer communities** (DOU, Telegram, meetups) and an **English-language audience** on X/LinkedIn/HN. The owner did **not** claim five named developers in agent-using teams — the warm network is thinner than plan-to-1.0 assumed, and §4 is built for that.

## 0. Facts on the day this was written

| Fact | Value | Source |
|---|---|---|
| Published version | `kadence@0.3.0` | npm |
| GitHub | 1 star · 0 forks · 0 issues · 0 watchers | `gh api` 2026-09-08 |
| npm downloads, last 30 days | 102 — with zero known users, so **this is the bot floor**, not a signal | api.npmjs.org |
| Site | live at kadence-site.vercel.app; `facts.json` sources every number; "Book thirty minutes" CTA exists | ADR-008 |
| Probe B | scripted 2026-09-02, rewritten 2026-09-08, **not run** | interview-script.md |
| Price | $0, MIT, forever; no gated format; sponsorship only at 1.0 | roadmap-to-1.0 §5 |
| Telemetry | none, ever — the North Star is observable only through public repositories and people who tell us | north-star.md |
| Name | shared with Kadence WP (400k installs); organic search for the word is closed | positioning.md |

The last two rows shape everything below: we cannot buy, track or search our way to users. We have to **talk to them, install with them, and be found where agents and switchers already look.**

---

## 1. Ideal customer profile

### The eight dimensions

| Dimension | Definition | Why this and not wider |
|---|---|---|
| **Firmographics** | A software team of **3–8 developers** sharing one or a few GitHub repositories. Product company or agency, any vertical. Ukrainian- or English-speaking. Node ≥ 20 already on the machines (JS/TS-adjacent stack, or any stack with Node in the toolchain) | Below 3 there is no second author, so the North Star cannot be hit. Above ~12, someone asks for SSO and Jira sync, both of which we refuse. Node is a hard install prerequisite until a binary exists (0.7) |
| **Tech-stack signals** | Claude Code, Cursor or Codex CLI used **daily by at least two people**; a `CLAUDE.md` / `AGENTS.md` in the repo; short-lived branches merged often; already some work-in-repo file — `TODO.md`, `docs/decisions/`, `backlog/`, `.beads/`, `.issues/` | These are the visible traces of a team that has already accepted "work lives next to code". They are also *searchable*: Probe A found 130 such repositories by directory name |
| **Buyer persona** | The **tech lead or senior developer who owns the team's agent setup** — the person who writes `CLAUDE.md` and gets asked "why did the agent do that?" There is no buyer in the money sense; the cost is a `.kadence/` directory in a shared repo, and this person can say yes to that alone | Nobody else in a team of five can commit a new directory without asking; this person can |
| **Job to be done** | *When I start a new agent session on work that was started earlier — by me, a teammate, or another agent — I want the agent to already know what was tried, decided and blocked, so that I do not re-explain it and it does not repeat a rejected path* | Straight from the positioning; the interview script tests whether people describe this job unprompted |
| **Existing alternatives** | Re-explaining in the prompt · a growing `CLAUDE.md` (which ETH Zurich measured as harmful past a point) · hand-written ADRs nobody reads · Beads · Backlog.md · a hosted memory layer at $19–249/month · Linear/Jira plus copy-paste into the prompt | Each has a named weakness we can speak to (§5) |
| **Trigger events** | (1) The team went from one agent user to three, and the agent's memory is per user and per machine · (2) a new developer onboarded and the agent re-derived everything · (3) an agent proposed something the team had rejected last week, in front of the tech lead · (4) `CLAUDE.md` passed ~200 lines and the agent got worse · (5) a Beads team hit the Dolt migration ([#2573](https://github.com/gastownhall/beads/issues/2573)) · (6) a Backlog.md team hit its first task-file merge conflict | Without a trigger there is no reason to act this month. Triggers 5 and 6 are the switcher path (§2, second pin) |
| **Budget authority** | None needed. What is needed is **the team's consent to a new directory in the repo** and one person willing to be the first author | This is why the persona is the tech lead and why concierge onboarding (§3) installs *with* them, in their repo |
| **Reachability** | Owner's workplace (1 team) · DOU + Ukrainian Telegram/meetups (owner present) · X/LinkedIn/HN (owner present) · the 130 Probe A repositories with public file trackers (maintainers, one message each) · the site's "Book thirty minutes" CTA · agent skill marketplaces where Beads is listed · search terms we can own: "backlog.md alternative", "beads without dolt", "append-only task tracker git" | Every channel in §4 maps to one of these. A pool we cannot reach is not in the ICP |

### Disqualifiers — who we do not chase

- **Solo developers.** No second author, no North Star. They may install and like it; they are not the beachhead. (Exception: a solo developer with two agents on two machines — a valid "two authors" if `KADENCE_SOURCE=agent` is set, but rare and unobservable.)
- **Teams with a Jira/Linear mandate and no repo-side list.** We will never sync; saying so early saves both sides a month.
- **Teams that do not use coding agents daily.** Conflict-freedom and sprint cost alone are a narrower product ([positioning](positioning.md), last section). They come later, if Probe B says "no context loss".
- **Organizations above ~20 developers** asking for SSO, audit, hosted views. Out of scope by design (roadmap-to-1.0 §1).
- **Machines without Node** — until 0.7 measures a binary.

### Qualification rubric

For a candidate in T50's list, before offering an install:

```
[ ] 3–8 developers on shared repositories
[ ] ≥ 2 people use a coding agent daily
[ ] CLAUDE.md / AGENTS.md or a work-in-repo file already exists
[ ] a tech lead who can add a directory without a committee
[ ] a concrete story of context loss or a rejected-path repeat in the last 90 days
[ ] a workaround they already do for it (file, prompt, ritual, tool)
[ ] Node ≥ 20 available
```

5+ boxes → offer a concierge install (§3). 3–4 → conversation only, no install. < 3 → thank and record.
The two bold lines of the interview script — *story* and *workaround* — are the fifth and sixth boxes; a candidate who ticks both is a pilot, not an interviewee.

---

## 2. Beachhead

**One segment:** *Ukrainian-speaking teams of 3–8 who already use Claude Code or Cursor daily, reached through the owner's workplace and the DOU/Telegram communities, onboarded by hand.*

Why this pin and not the others considered:

| Candidate beachhead | For | Against | Verdict |
|---|---|---|---|
| **Ukrainian agent-using teams via own community** | In-language conversations at Mom Test quality; the owner is already present; concierge installs fit 4–8 h/week; most likely place to find people who will *show* a workaround | Mostly private repositories, so the North Star is observable only by consented report; smaller pool | **Beachhead.** Observability is solved by asking pilots to report (§6) |
| Probe A maintainers (130 public repos with file trackers) | Pre-qualified on "work in repo"; **public**, so G1 is observable by search; the natural switcher pool | Cold; one message each by our own rule; they already have a tool and need an importer (0.6) to move cheaply | **Second pin.** Conversations now, installs after the importer |
| English-language Claude Code power users via X/HN | Largest pool; reputation goal lives here | Zero warm contacts; a post reaches thousands and converts a handful we cannot talk to; a post before Probe B spends the one HN shot on an untested message | **Reputation layer, week 8.** Not a beachhead |
| Owner's workplace team | Cheapest install on earth; first-run experience observed live | One team; colleagues are not "someone we do not control" | **Pilot 0**, week 1. Counts toward G1 only if a second author writes events without being asked to |

**What "winning" the beachhead means:** three Ukrainian teams (pilot 0 plus two from Probe B) with two authors after 14 days, and one of them reachable for a quote. Then the second pin: two public repositories from the Probe A pool via the importer. That is G1's five.

---

## 3. Motion

**Product-led, community-distributed, founder-onboarded for the first ten.**

- **ACV is $0** — every other motion breaks on that ([skill table](../../.claude/skills/gtm-strategy/SKILL.md): < $1K → PLG). There is no sales, no demo call, no trial.
- **PLG needs an activation that a stranger can complete.** Ours is `npm install -g kadence && kadence init`, then the second author's first event. Assumption 3 says this has never been watched. So for the first ten teams the motion is **concierge**: the owner sits with the tech lead (20 minutes, screen share), runs `init` in *their* repository, watches where they hesitate, and writes it down. This is not a sales motion; it is Probe B's second half and the cheapest usability test we will ever get.
- **Community-distributed** means we go where the ICP already reads and where agents already look — communities, the `AGENTS.md` convention, skill marketplaces — and we do not build an audience from scratch.

**The built-in loop.** The product has one viral mechanic and we should name it: `.kadence/` is in the repo, so the *second author* is recruited by the first without any action from us, and every agent that reads `AGENTS.md` learns the tool exists. Intra-team spread is free; cross-team spread is the article, the skill package and public repositories with `.kadence/` in them.

**Not doing:** sales-led anything · marketing-led inbound at scale · paid · partnerships. One motion until it works (anti-pattern A6).

---

## 4. Channels

Each channel has a purpose, a hypothesis, a test with a threshold set before it runs, an hours budget from the 4–8/week, and a kill rule. Rules inherited from plan-to-1.0 and the lean canvas: **no messages in competitors' issue trackers, no mailing lists, no ads, one launch post not a campaign, stars are not a metric.**

| # | Channel | Purpose | Hypothesis | Test and threshold | Hours (total) | Kill / scale rule |
|---|---|---|---|---|---|---|
| C1 | **Workplace team** | Pilot 0; first-run observation | The install works for people who are not the author, and a second author appears within 14 days without being asked | Day-14 check: ≥ 2 authors in `.kadence/events`; hesitations written in `probe-b-results.md` | 3 | Cannot be killed; it is one team. If no second author, fix the first-run experience before any other install |
| C2 | **DOU + Ukrainian Telegram** | Recruit Probe B conversations; later, the Ukrainian long-form | A short *research* post ("I study how teams work with coding agents, 45 minutes, nothing to sell") yields conversations at Mom Test quality | ≥ 3 booked conversations from one post within 7 days | 8 (post 1, replies 2, Ukrainian article 5) | < 3 bookings → second post in one Telegram channel with a named audience, not DOU again. Still < 3 → the beachhead moves to C3 |
| C3 | **Probe A maintainers** | Conversations from outside our circle; the switcher pool | Maintainers who already keep tasks in files will answer one honest email about their merge and context experience | 30 messages → reply rate ≥ 20% → ≥ 3 conversations | 6 | Only maintainers with a **public contact on their profile or README**; one message each, no follow-up (T50 AC). < 10% reply → stop; the pool is dead cold |
| C4 | **Site CTA "Book thirty minutes"** | Passive recruiting from outside | Someone who found the site books a call | Any booking in 12 weeks | 0.5 (verify the link works) | Not killable; it costs nothing. Zero bookings in 12 weeks is data for §6 |
| C5 | **Article + one Show HN** | Reputation; README→`init` conversion test; inbound issues | The measured numbers (8,396 merges · 15% · 89% · 948 bytes · 0 conflicts) earn attention that a pitch would not | > 30 site visits in 48 h (lean canvas); copy-click / visit ≥ 5%; ≥ 1 inbound issue or question within 7 days | 16 (article 10, native read 2, post + 48 h watch 4) | One shot; there is no second HN. If < 30 visits: the message, not the channel, is wrong — do not repost, re-read Probe B |
| C6 | **Agent skill package + marketplaces** | Be where agents look; the constant channel | Agents install what their users ask for; a `SKILL.md` in the marketplaces that list Beads makes kadence askable | A mention in someone else's `AGENTS.md` or a marketplace install count > 0 within 30 days of listing | 4 (T65 is engineering; GTM is submission and monitoring) | Not killable; near-zero maintenance. No installs in 60 days → do not add more marketplaces |
| C7 | **Bottom-funnel pages** `/compare/backlog-md`, `/from-beads` | Catch the two trigger events we cannot create | People leaving Beads' Dolt migration or hitting Backlog.md conflicts search for exactly these words | Any organic visit to either page; a switcher conversation | 4 | Only after C5, only when the importer (0.6) exists for the "one command" claim to be true. Kill if the importer is not built |

**Channel–product fit, checked** (skill §"Channel-product fit"):

- *SEO*: the word "kadence" is closed, but the *problem* is SERP-able ("agent forgets between sessions", "backlog.md merge conflict", "beads dolt"). Long content exists (the article, the ADRs). Fit: yes, narrow.
- *Viral*: the second author is built in. Fit: yes, intra-team.
- *Community*: passionate users exist in the neighbourhood (Beads' 26.8k stars, its 866 open issues); room to participate: yes. Fit: yes.
- *Outbound*: ICP is defined and the value fits in one sentence. Fit: yes, at 30 messages, not 300.
- *Paid*: no LTV, no CAC. Fit: none. Not doing.

**Budget check:** C1–C7 total ≈ 42 hours across 12 weeks, leaving ≈ 30 hours for conversations, synthesis, pilots and the weekly review (§7) inside a 4–8 h/week envelope. If the week runs over 8 hours, the thing that slips is C7, then the Ukrainian article, never a conversation.

---

## 5. Messaging

### Positioning (unchanged)

> For teams of 3–8 developers who work with AI agents and keep work next to code, kadence is a journal of the team's work in the repository that keeps tasks, their full history and time spent as immutable events beside the code — so context is not lost between sessions, does not conflict on merge, and shows what the work cost. Unlike Spec Kit, Beads and Backlog.md, which store mutable state, kadence stores events.

### Hero and three supporting messages

**Hero:** *Your team and your AI agents work from the same context — it lives in your repo and remembers what the code cannot.*

1. **Events, not state.** State drifts, conflicts and forgets. An event cannot. State is folded from the journal on read, so the board cannot disagree with reality.
2. **The answer does not grow.** `task show --json` is 948 bytes at ten tasks or a thousand, while the journal behind it grows to 528 KB. Measured, not claimed.
3. **Nothing leaves the machine.** No server, no account, no network. Leaving is `rm -rf .kadence`; the files are readable without us.

### Talk tracks per persona

| Persona | Open with | Prove with | Never say |
|---|---|---|---|
| **Tech lead of an agent-using team** (beachhead) | "Every new session your agent starts from zero — and the memory the vendor gave it is per user, per machine, invisible to your teammate" | `kadence task show KAD-1 --json` on their own repo after pilot; the 948-byte number | "Faster" — Probe E has not run; METR shows self-reported speed is wrong |
| **Backlog.md team** (switcher) | "Same idea — work in the repo, agents read it. Different storage: events instead of task files, so two branches editing one task do not conflict, and history is never rewritten" | Probe A: 15% of file-tracker repos hit task-file conflicts, 89% the exact kind append-only removes; their own `task-4.12`; the importer (0.6) | Anything in their issue tracker; anything about their maintainer |
| **Beads user after Dolt** (switcher) | "Plain files, zero dependencies, no daemon, no second database. `git checkout v2.3` still shows the tasks as they were" | The dependency count (one, lazy-loaded); the 60 ms start; a `.kadence/` directory they can `cat` | "Beads is wrong" — Beads proved the category; we thank them for it |
| **Ukrainian community reader** | The same as the tech lead, in Ukrainian, plus the honesty block: what is measured, what is not | Numbers from `facts.json`; the interview findings, anonymised | Anything that reads as a launch before Probe B has an answer |
| **HN reader** | The measurement first, the product second: "We counted 8,396 merges in 130 repos with file-based trackers before building on the claim" | Links to raw data, the integration test, the ADRs with "what would make us revisit" | Superlatives; comparisons to Jira; the word "tracker" |

### Objections and answers

| Objection | Answer | Source |
|---|---|---|
| "Beads already does this" | It does, with a Dolt database, a daemon and its own ref namespace. We store plain files, zero dependencies, append-only. Their JSONL export is our import path | ecosystem §1 |
| "I'll just put it in CLAUDE.md" | Per user, per machine; and past a point generated context files cost 20% more and help less than nothing. A short pointer plus fetch-on-demand is what the evidence recommends | ecosystem §4 |
| "We have Linear / Jira" | kadence lives beside it and will never sync — that is a design boundary, not a roadmap gap. If your team's truth must be in Jira, we are not for you | roadmap-to-1.0 §7 |
| "Another tracker?" | A journal that a tracker view is folded from. Delete the view; the journal still answers "how did we get here" | positioning |
| "What does it do to my repo?" | Creates `.kadence/`, appends files, never edits, never runs git for you | landing FAQ |
| "Does it phone home?" | No network at all. Unplug and check | landing FAQ |
| "How much faster will we be?" | We do not know and will not guess. What we measured is what the agent has to read, and that it does not grow | roadmap-to-1.0 §6 |

### Honesty rules for every channel

- No speed claim anywhere until `probe-e-results.md` exists (T63 AC).
- No "used by" until `north-star-log.md` has a real repository (T78 AC).
- The site's "honest status" block is updated with Probe B's answer *before* the HN post, whichever way it goes.
- In conversations, kadence is not named until the participant has told their stories (interview script). The counter-metric "we named the problem first" must be zero.

---

## 6. Success metrics

### North Star (unchanged)

> Repositories where `.kadence/events` has entries from at least two authors 14 days after `init`.

Target for this document's horizon (12 weeks): **≥ 2.** Target for G1: **5.**

### How we observe it without telemetry

| Source | What it sees | Bias |
|---|---|---|
| `scripts/north-star.mjs` → `north-star-log.md` (T54), weekly | Public repositories only | Misses every private team — which is most of the beachhead |
| Pilot day-14 check-in (§3, concierge) | Private repositories, with consent: the pilot runs `kadence task list --json --fields author` or just tells us | Only teams we installed with |
| Site events (cookie-less): copy-click, docs click, CTA click | Top of funnel | Says nothing about `init` |
| npm weekly downloads | Installs above the ~100/month bot floor | Cannot distinguish `npx` curiosity from a team |
| GitHub: issues, forks with changes, `AGENTS.md` mentions | Leading signals of real use | Lagging by weeks |

### The funnel, with targets

| Stage | Metric | Target by week 12 | Instrument |
|---|---|---|---|
| Reach | Site visits in the 48 h after the HN post | > 30 | site analytics |
| Reach | Replies to Probe A outreach | ≥ 20% of 30 | `probe-b-candidates.md` |
| Conversation | Probe B conversations completed | 5–7 by week 4 | `probe-b-results.md` |
| Conversation | Named context loss **unprompted** | ≥ 4 of 7 | same |
| Conversation | Showed a workaround | ≥ 3 | same |
| Conversation | We named the problem first | **0** (counter-metric) | same |
| Activation | Copy-click ÷ visit | ≥ 5% | site analytics |
| Activation | Pilots installed (concierge) | 3 incl. pilot 0 by week 6 | `north-star-log.md` |
| Retention | Pilots with a second event | ≥ 2 of 3 by day 14 | pilot check-in |
| **North Star** | Repos with two authors at day 14 | ≥ 2 | `north-star-log.md` |
| Trace | Public artefacts | 1 article (EN), 1 HN post, 1 DOU piece (UK), 1 skill package listed | `channel-tests.md` |
| Trace | Inbound: issues, questions, forks with changes | ≥ 1 within 7 days of the HN post | GitHub |

### Guardrails

- ≤ 8 hours a week on GTM. Overrun is a signal to drop C7, not to skip a conversation.
- Zero messages in competitors' issue trackers; one message per Probe A maintainer.
- Zero speed claims. Zero "trusted by".
- Stars are recorded, never targeted.

### The weekly ritual (30 minutes, Monday)

Read `north-star-log.md`, `probe-b-candidates.md`, `channel-tests.md` and the site numbers. Write three lines in `channel-tests.md`: what moved, what did not, the one thing this week. That file is the GTM journal; the product keeps one for code, this is the same discipline for users.

---

## 7. Sequence — twelve weeks from 2026-09-08

Not a T-90 launch: there is no launch, there is a sequence with thresholds, and each step opens only when the previous one's threshold is passed or its failure is written down. Hours are the GTM budget for the week; engineering is outside them. **Only one date is a commitment — 22 September, from plan-to-1.0.** The rest are the order, placed on a calendar so that slipping is visible.

| Week | Dates | GTM work | Hours | Task | Threshold to move on |
|---|---|---|---|---|---|
| **0** | Sep 8–14 | **Foundations.** Candidate list (15 names: workplace 3, DOU/Telegram ask → 5, Probe A shortlist 30 with public contact → send 15, X/LinkedIn "I'm interviewing teams" → 2). Verify the site's booking link. Post the DOU/Telegram research ask (C2) | 6 | T50 | 15 names with a source and a status |
| **1** | Sep 15–21 | Send the remaining 15 Probe A messages. **Pilot 0**: `init` with the workplace team, screen shared, hesitations written down. Book conversations as replies come | 6 | T50, T52b (pilot 0) | **Sep 22: five conversations booked, or the reason written** |
| **2–3** | Sep 22 – Oct 5 | **Conversations** (5–7 × 45 min + 30 min notes each). Pilot 0 day-14 check. No product talk in the interviews | 8 + 6 | T51 | ≥ 5 completed; counter-metric = 0 |
| **4** | Oct 6–12 | **Synthesis** → `probe-b-results.md` with the three numbers and the verdict. Pick 2–3 pilots among those who *showed a workaround*. Update the site's honest-status block with the answer — **this starts the 90-day kill clock** (roadmap-to-1.0 §10) | 6 | T51, T52 | Verdict written; Next confirmed or cut |
| **5–6** | Oct 13–26 | **Concierge pilots** (20 min each, in their repo). Weekly ping. Draft the article from `facts.json` (C5). Probe E design lands in engineering | 5 + 5 | T52b, T64, T63 | 3 pilots installed |
| **7** | Oct 27 – Nov 2 | Article reviewed by a native reader. Skill package submitted where Beads is listed (C6). Pilot day-14 checks → `north-star-log.md` | 5 | T64, T65 | ≥ 2 of 3 pilots have a second event; article final |
| **8** | Nov 3–9 | **Show HN** (Tue–Thu, morning US). 48-hour watch; answer every comment; `channel-tests.md` gets the numbers at 72 h | 6 | T64 | > 30 visits; ≥ 5% copy-click; ≥ 1 inbound |
| **9–10** | Nov 10–23 | Respond to inbound. **DOU long-form in Ukrainian**: the article plus Probe B findings, anonymised (C2). `/compare/backlog-md` if the importer is on the way (C7) | 4 + 4 | T64, T67 | Ukrainian piece published; any switcher conversation |
| **11–12** | Nov 24 – Dec 7 | **GTM v2.** Every threshold in §6 against its number. Decide: importer as a channel (0.6) or Later; beachhead holds or moves to the Probe A pool; sponsorship stays off until 1.0 | 4 | — | This document rewritten with numbers, not targets |

Total ≈ 76 hours over 12 weeks, inside 4–8 a week with slack for two slipped weeks.

**Three refinements to plan-to-1.0's "Як залучаємо перших користувачів":**

1. **"One post, HN or DOU"** becomes **HN for the launch post, DOU for recruiting and the Ukrainian long-form.** They are different acts: the DOU ask in week 0 is research recruiting with nothing to install; the HN post in week 8 is the one launch, and its 48-hour test stays as written. The Ukrainian long-form in week 9 is repurposed, in a different language, measured separately, and is not a second launch.
2. **The article does not wait for 0.4.** Versions are ordered, not scheduled; the post waits for Probe B's answer and the article, not for `--branch`.
3. **Pilot 0 is week 1, not after T51.** The workplace install costs three hours and answers assumption 3 before any stranger sees the product. Its findings feed T51's synthesis.

**Decision points, named so they are not made by fatigue:**

- **Sep 22** — five booked or the reason written. Silence is not an outcome.
- **Week 4** — Probe B verdict. "No context loss" shrinks messaging to conflict-freedom and sprint cost (positioning, last section); the sequence continues unchanged except the article's lead.
- **Week 8 + 72 h** — HN numbers. Below threshold: the message is wrong, not the channel; no repost.
- **~Jan 5, 2027** — 90 days after week 4: the kill criteria in roadmap-to-1.0 §10 are evaluated. Any one of the four being false keeps the product alive.

---

## 8. Risks and the anti-patterns we are closest to

| Risk | Which anti-pattern | Evidence it is real | Mitigation |
|---|---|---|---|
| Probe B slips again — the most likely way this plan fails | A9, no lighthouse customers | Scripted since Sep 2; six days, four features, zero conversations | The Sep 22 date with two acceptable outcomes; week 0 is recruiting only |
| Warm network thinner than the plan assumed | A13, beachhead unreachable | Owner did not claim five named developers | Recruiting is carried by C2 and C3 (35 asks for 5–7 conversations); the workplace supplies pilot 0 |
| Leading the witness in interviews | A4, untested messaging that tests itself | The script's own warning | Counter-metric = 0; kadence unnamed until stories are told; notes within 30 min |
| Posting to HN before the message is tested | A7, launch = press release | One HN shot per project | Post is week 8, after Probe B and after two pilots survived day 14 |
| The North Star is invisible for private teams | A5, metrics not tracked | No telemetry by principle | Consented day-14 check-in in the concierge script; public search for the rest |
| Running C1–C7 at once | A3 / A6 | Seven rows in §4 | Weeks 0–4 use only C1–C4; C5–C7 open after the verdict |
| Owner's attention moves | — | 28 repositories on the account, most idle | Kill criteria and a 30-minute weekly ritual; each week ends with something written |
| Beads ships a plain-file mode | — | Their Rust port froze one | Speed to G1, not code; the article's authority in the narrow topic is the only durable edge |

---

## 9. How this document could be wrong

- **The beachhead speaks Ukrainian but builds in private.** Then G1's "found by GitHub search" clause is unmeetable from the beachhead alone, and the Probe A pool (public) must supply the five. Week 11's review decides whether to swap pins.
- **C2 yields polite interest and no stories.** The interview script counts that as refutation. Then the product narrows to conflict-freedom and sprint cost, and the ICP's trigger events 5 and 6 (switchers) become the whole plan.
- **HN converts readers to stars and nothing else.** North Star says stars do not count; the plan says do not repost. It would still be the reputation trace the owner asked for, and §2's "product first" ordering would need to be re-asked.
- **Concierge does not scale past ten.** It is not meant to. The tenth team is where the first-run experience must work alone; if pilots keep needing the owner in the room, that is a product finding for 0.5, not a GTM finding.
- **The owner's 4–8 hours turn out to be 2.** Then the sequence stretches to 20 weeks, and the only thing that must not stretch is the Sep 22 date.

---

## 10. Decisions taken — 2026-09-08

Owner's answers, recorded because they are inputs the repository cannot show:

1. **Goal:** both product and reputation, **product first.** Success is G1; every step must also leave a public trace.
2. **Time:** **4–8 hours a week** for GTM, separate from engineering.
3. **Channels that exist today:** the workplace team using agents daily; Ukrainian communities (DOU, Telegram, meetups); an English-language audience on X/LinkedIn/HN. **Not** a warm list of five developers in agent-using teams.

Consequences already applied: beachhead in §2, recruiting mix in §4/§7, pilot 0 in week 1, HN in week 8 rather than week 0.

---

## 11. Validator result

`gtm_strategy_validator.py` from the skill, run 2026-09-08 on a JSON summary of this document (`avg_acv_usd: 0`, `budget_usd: 0`, `motion: plg`, `lighthouse_customers_count: 0`): **0 fail, 4 warn, 0 info.**

| Warning | Verdict |
|---|---|
| 7 channels — usually 2–4 with real investment | **Structural, and already handled.** Weeks 0–4 run only C1–C4; C5–C7 open after the Probe B verdict (§7). C4 and C6 are near-zero cost and cannot spread attention |
| Messaging not tested with ICP customers | **Real.** The hero message has never been read by a member of the ICP. Probe B fixes half of it (do people describe the job in our words?) and the concierge pilots fix the rest (do they repeat the message back?). Until week 4 this warning stands |
| 0 lighthouse customers — target 3+ | **Real, and the whole point of the document.** Pilot 0 plus two Probe B pilots are the three, and the HN post waits for two of them to survive day 14 |
| No budget allocated | **Structural.** The budget is 76 hours of the owner's time (§4, §7), not dollars. The validator is tuned for funded launches, as the lean canvas validator was |

Net: the two real warnings are the two thresholds the sequence is built around, which is what a validator should find on a plan written before its first conversation.
