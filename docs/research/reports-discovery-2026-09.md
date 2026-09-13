# Reports — what the journal already knows, and what to show

- **Date:** 2026-09-10
- **Question:** which of the reports Jira, PMI's Agile Practice Guide, the Kanban Guide and GitHub Projects offer can be derived from our event journal, which of them are worth showing, and where — the CLI, the static export, or both.
- **Method:** sources read on 2026-09-10 and cited per claim; derivability checked against `src/core/event.ts` and `src/core/projection.ts`; two prerequisites found by measurement rather than reading.
- **Status:** discovery complete; plan in [tasks/plan-to-1.0.md](../../tasks/plan-to-1.0.md), Milestone 15 slice D.

## The honest paragraph first

This is the third time in a week that work goes ahead of Probe B. [roadmap.md](../product/roadmap.md) says Now is one item, and it is not a feature. The argument for building anyway is the same one [feature-adoption-2026-09.md](../product/feature-adoption-2026-09.md) made: these reports are what the neighbours' users already use daily, and the [PRD](../PRD.md) named analytics as the architecture's consequence from the first page — "історія подій — це і є дані для звітів". The PM persona in the PRD asks for exactly this: predictability, honest velocity, data for retrospectives. It is still an argument, not a measurement. **22 September stands.**

And one guard that does not move: the [discovery verdict](discovery-verdict-2026-09.md) closed the door on *velocity as a headline*. Reports are a consequence served to a secondary persona. They go into the CLI and the export; they do not go into the README's first screen or the site's tagline.

## What the sources say

Full fact sheet with per-report data requirements is condensed below; every claim has a URL.

**Jira Software Cloud** offers, on a Scrum board: Burndown, Burnup, Sprint report, Velocity, Cumulative flow diagram, Control chart, Epic report, Epic burndown, Release burndown, Version report. On a Kanban board: only Control chart and CFD. Plus eleven "work item analysis" reports (Average age, Created vs resolved, Pie, Recently created, Resolution time, Single-level group-by, Time since, Time tracking, User workload, Version workload, Workload pie) and two DevOps reports that need commit and deployment events (Cycle time report, Deployment frequency). Sources: [report index](https://support.atlassian.com/jira-software-cloud/docs/generate-a-report/), [burndown](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-burndown-chart/), [burnup](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-burnup-chart/), [velocity](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-velocity-chart/), [CFD](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-cumulative-flow-diagram/), [control chart](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-control-chart/), [release burndown](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-release-burndown-report/), [version report](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-version-report/), [cycle time report](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-your-cycle-time-report/).

Two facts from Jira worth more than the list. First, Jira's own **Velocity chart defines commitment as the estimate at sprint start**, not at sprint end — a distinction most home-grown velocity numbers miss. Second, in June–July 2026 Atlassian marked Version report, Epic burndown and Release burndown for retirement as "among the six least-used reports", then reversed after feedback ([community thread](https://community.atlassian.com/forums/Jira-questions/Why-are-Version-Report-Release-Burndown-and-Epic-Burndown-being/qaq-p/3255262)). Least used is a measurement; we should weight those three accordingly.

**PMI Agile Practice Guide (2017), §5.4** names: story points, velocity (with the tip that it takes four to eight iterations to stabilise), burndown, burnup, lead time, cycle time, response time, throughput, WIP limits, feature chart / product backlog burnup, earned value adapted to agile (SPI from points, CPI needing cost), and the cumulative flow diagram. [Table of contents](https://www.oreilly.com/library/view/agile-practice-guide/9781628253993/toc.xhtml); the 2026 second edition adds "flow metrics" and "DORA metrics" to its topic list ([Agile Alliance](https://www.agilealliance.org/agile-practice-guide/)).

**The Kanban Guide (2025.5, CC BY 4.0)** mandates four flow metrics and no chart form. Verbatim: WIP is "the number of work items started but not finished"; throughput "the number of work items finished per unit of time"; work item age "the elapsed time between when a work item started and the current date"; cycle time "the elapsed time between when a work item started and when a work item finished". It introduces the **Service Level Expectation** — "85% of items finish in eight days or less" — which is a percentile, not an average. [kanbanguides.org](https://kanbanguides.org/english/). Vacanti's *Actionable Agile Metrics* adds the cycle-time scatterplot, the aging-WIP chart and Monte Carlo forecasting from throughput ([55 Degrees](https://www.55degrees.se/products/actionableagileanalytics), [scatterplot](https://www.55degrees.se/blog/post/what-is-a-cycle-time-scatterplot)).

**Scrum Guide 2020** mandates nothing: "Various practices exist to forecast progress, like burn-downs, burn-ups, or cumulative flows. While proven useful, these do not replace the importance of empiricism." ([scrumguides.org](https://scrumguides.org/scrum-guide.html))

**DORA** — change lead time, deployment frequency, change fail rate, failed-deployment recovery time — all need commit and deployment events ([dora.dev](https://dora.dev/guides/dora-metrics-four-keys/)). Note the name collision: Jira's "cycle time report" is DORA's change lead time (commit to production), not the Kanban Guide's cycle time (start to done).

**GitHub Projects Insights** offers current charts (snapshot, group-by) and historical charts (default: burn-up), no velocity, no cycle time, no CFD, no forecast; historical charts need a paid plan ([about insights](https://docs.github.com/en/issues/planning-and-tracking-with-projects/viewing-insights-from-your-project/about-insights-for-projects)).

## What the journal can derive

Every `task.moved` carries `from`, `to`, `ts` and `actor`. `task.created` carries `ts` and `estimate`. `sprint.task_added` and `milestone.task_added` carry `ts`, which is what makes scope lines possible. `task.blocked_by_added/removed` carry `ts`. There are no deployment or commit events, and no business-day calendar.

| Report | Minimum data | We have it | Verdict |
|---|---|---|---|
| Burndown (sprint) | points, done transitions, sprint dates | shipped | — |
| Sprint report | membership, outcome, points | shipped | — |
| Velocity | per closed sprint | shipped as one number; `stats` shows three | **Take**: full series, commitment measured at sprint start as Jira does — we have `sprint.task_added.ts` |
| Burnup (sprint) | as burndown + scope-change timestamps | yes | **Take**: same module as burndown, one more line |
| Cycle time, lead time, response time | a "started" boundary + transitions | yes, **once the boundary is configurable** | **Take**, as percentiles |
| Throughput | done per period | yes | **Take** |
| WIP, work item age, aging WIP | started boundary + current status | yes | **Take** |
| Cumulative flow diagram | every transition | yes; 2.4 ms over 10k events (measured) | **Take** |
| Control chart / scatterplot | cycle time per finished item by finish date | yes | **Take** as the table behind cycle time; no separate chart |
| Created vs resolved, average age, resolution time | created + done timestamps | yes | **Take**, as sections of the flow report, not separate commands |
| Blocked time | `blocked_by_added` → removed or blocker done | yes | **Take** — no neighbour has it as an event |
| Release burndown / version report / feature chart | milestone membership + points + done ts | yes — milestones shipped in 0.4.1 | **Take**: `report milestone`, forecast from throughput |
| Monte Carlo forecast ("when" / "how many") | throughput history | yes; pure computation | **Take**, with a fixed seed so the same journal gives the same answer |
| Epic report / epic burndown | parent + points | yes | **Later**: Jira's own least-used; milestones cover grouping by outcome |
| Pie / group-by / user workload | one field | `stats` has counts | **Extend `stats`** with open points by assignee; no new command |
| Time tracking (estimate vs spent vs remaining) | logged hours + estimates | pieces exist | **Extend the sprint report**, not a new report |
| Earned value: SPI | planned vs completed points | yes | **No**: velocity restated under another name |
| Earned value: CPI | cost | no | **No** |
| DORA, Jira cycle time report, deployment frequency | commit + deployment events | **no** | **No**. A `release.recorded` event is imaginable and is not this work |

## Two prerequisites, found by measurement

**1. The "started" boundary is hardcoded, and it is wrong on every custom board.** `workHours()` in `src/core/velocity.ts` looks for a move to the literal string `in_progress`; so do `task.reopened` and `prime`. Statuses are configurable. Reproduced: a board configured as `todo,doing,review,done` closes a sprint with `velocity: 3, actualHours: null, hoursPerPoint: null` — silently, on a task that was in fact worked on. Every flow metric above starts from this boundary, so it has to become a setting before any cycle-time number is honest: `board config --started doing`, defaulting to `in_progress`, folded like `statuses` and `dod` are, and used by every consumer including the sprint report that is broken today.

**2. The cold-start figure was a warm one, and compaction is not something a user can run.** The perf test removed the state cache once and took the best of three runs; the first run built the cache and the next two read it. Measured with the cache removed before every run, on 10,000 events: **199 ms cold with every event a separate file, 21 ms with a compacted archive**. The first number is the budget itself. `compact()` exists in `src/core/store.ts` and is called only by tests. Reports over a long history are exactly the case where this matters, so `kadence compact` becomes a command in the same slice, and the perf test and README now carry the honest numbers.

## Design

- **One command, `kadence report <name>`**, each report a fold over the same state, each with `--json`, each under the 200 ms budget with its own perf case. Names: `flow`, `velocity`, `burnup`, `milestone`, `forecast`. Burndown stays where it is.
- **Percentiles, never means.** Cycle time is reported as p50 / p85 / p95 and stated in the Kanban Guide's own form — "85% of finished items took 6 days or less". The Control chart's average and standard deviation are the two numbers Vacanti's book spends a chapter arguing against; we do not print them.
- **Calendar days, said so.** Every duration says "calendar days". A business-day option is a later decision, and a silent one would be a wrong number.
- **Windows are explicit.** `--since 30d` by default for flow; the response carries the window it used.
- **Everything goes into the export.** The static HTML and Markdown gain a Reports section with the same numbers. The export is the human's dashboard; the CLI is the agent's.
- **The TUI gets the reports behind the existing `s` menu**, as read-only text views, with the standing caveat that the TUI is verified by hand.
- **Deterministic forecast.** Monte Carlo uses a fixed seed derived from the journal's last ULID. The same journal always gives the same forecast (I1 applied to a report), and a different one after a new event, which is the right time for it to change.
- **`stats` does not grow into a report.** It stays the one-screen answer; `report` is where a question gets a chart.

## What would make this wrong

- **Probe B says the segment is solo developers.** Flow metrics on one person's board are a mirror, not a report. Cost: one M task and a slice of the export.
- **The PM persona never appears.** The PRD ranks them secondary and says they arrive after the team. If no pilot has one, the reports serve nobody, and `stats` was enough.
- **Someone asks for DORA.** Then they want deployment events, which means a new event type and a new boundary with CI. That is a separate decision with its own ADR, not a report.
- **The numbers get quoted without the boundary.** A cycle time from a board whose `started` was never configured is a number about the default, not the team. The command prints the boundary it used, every time, so nobody has to remember to ask.

## What this does not change

The three constraints. The contract: every report is additive within `kadence/v1`. The invariants: every report is a fold, and folds do not depend on read order. The positioning: velocity, and now cycle time, stay out of the headline.
