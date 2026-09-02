# Example: Transforming Pylon's Q3 Roadmap from Output to Outcome

> Real-world scenario showing how to transform a feature-list roadmap into Now/Next/Later outcomes.

## Context

Pylon is a Series-A vertical SaaS for industrial-equipment service teams (~120 customers, $4M ARR). The current Q3 roadmap is a feature list: "Build offline mode", "Build SSO", "Build mobile native". The CEO has been asking, "what will be different for customers if we ship this list?" and the team has struggled to answer.

The PM (Hugo Aalto) is transforming the roadmap from output-heavy to outcome-driven before the next exec review on 2026-05-29. The team needs Now/Next/Later horizons, clear outcomes, and measurable indicators.

## Inputs

- Current Q3 roadmap: 11 features in a flat list with quarter tags
- Customer feedback triage output (see `customer-feedback-triage/`) -- 12 deduped opportunities
- North Star Metric (input metric tree available)
- Engineering capacity: 80 days for Q3
- Quarterly objective: "Make Pylon stickier for the field-tech segment"

## Applying the skill

1. **Gathered the current output-based roadmap** -- 11 features.
2. **Applied the "so what?" chain** to each. Several features collapsed to the same outcome ("Build offline mode" + "Build conflict resolution" + "Build mobile native" all roll up to "Field techs can work without connectivity at customer sites").
3. **Categorized into Now / Next / Later** based on commitment level and stage of validation.
4. **Added success metrics** for Now and Next items (2-3 per item).
5. **Identified dependencies** -- offline mode depends on the data-platform change to support local cache.
6. **Reviewed with the CEO** -- the question "what's different for customers?" now has a one-sentence answer per row.

Key decision quoted: *"'Later' items do not have detailed metrics. If we knew the metrics with precision, they would not be Later -- they would be Next."*

## The artifact

````markdown
# Pylon Q3-Q4 Outcome Roadmap (v1)

**PM:** Hugo Aalto
**As of:** 2026-05-22
**Quarter:** Q3 2026 (start 2026-07-01) + Q4 outlook
**Quarterly objective:** Make Pylon stickier for the field-tech segment

## How to read this roadmap

- Format: `Enable [segment] to [outcome] so that [business impact]`
- Each item answers: Who benefits, What changes for them, Why it matters to the business
- Now items have dates and detailed metrics; Later items do not (by design)

## NOW (in flight or starting in next 2 weeks)

### N1 -- Enable field technicians to access and update work orders without connectivity, so that we are usable at the 40% of customer sites with no coverage

- **Source features (output)**: offline mode, local cache, conflict-resolution
- **Outcome**: A field tech can pick up a job at the dispatch shop, drive to a remote customer site, log work, mark the job complete, and sync when back in coverage -- with no "you're offline" failure
- **Success metrics**:
  - Primary: % of work orders completed at low/no-coverage sites without sync errors (target: 95%)
  - Secondary: Median session duration on mobile while offline (target: > 12 min)
  - Counter: Sync-conflict rate per 100 jobs (target: < 5%)
- **Owner**: Mobile + Data Platform squads
- **Status**: In design; eng start 2026-06-01
- **Dependency**: Data Platform local-cache schema (see `dependency-map/`)
- **Commitment**: Locked for Q3 ship

### N2 -- Enable dispatch supervisors to reassign jobs in fewer clicks, so that urgent reassignments don't lose 5 minutes per job

- **Source features**: re-assign UX, list-view tech filter
- **Outcome**: Dispatcher sees job queue + tech assignments in one view; reassignment is 2 clicks
- **Success metrics**:
  - Primary: Median time-to-reassign (target: < 30s from 90s baseline)
  - Secondary: Reassignment volume per dispatcher per day (no change expected; behavior change isolated)
  - Counter: Reassignment-revert rate (target: < 10%)
- **Owner**: Web squad
- **Status**: In flight; design done; eng start 2026-05-26
- **Commitment**: Locked for Q3 ship

### N3 -- Enable customers to share work-order status with stakeholders who don't use Pylon, so that we stop being a single-tenant tool

- **Source features**: shareable status link, audit log
- **Outcome**: Customer admin can generate a read-only link, send to their stakeholder, see view count
- **Success metrics**:
  - Primary: % of workspaces generating >= 1 share link in 30 days post-launch (target: 40%)
  - Secondary: Recipient NPS (target: >= 30)
  - Counter: Share-link revoke rate within 7 days (target: < 15%, indicates regret)
- **Owner**: Web + Platform squads
- **Status**: In design; eng start 2026-07-01
- **Commitment**: Locked for Q3 ship

## NEXT (1-3 months out)

### X1 -- Enable enterprise admins to manage user access via their existing IDP, so that we close $80k+ deals we are currently losing on security review

- **Source feature**: SSO (Google, Okta, Azure AD)
- **Outcome**: Workspace admin connects their IDP; new users provision automatically; deprovisioning is instant
- **Success metrics (draft)**:
  - Primary: # of accounts with SSO enabled (target: 25 by end of Q4)
  - Secondary: Sales deals closed citing SSO as enabler
  - Counter: User-confusion tickets on SSO setup
- **Owner**: Web + Auth squads
- **Status**: Discovery + RFC; build start 2026-08-15
- **Commitment**: Direction set; scope flexible (which IDP first?)

### X2 -- Enable dispatch supervisors to bulk-edit job priorities, so that morning re-prioritization takes 2 minutes instead of 25

- **Source feature**: bulk-edit priority
- **Outcome**: Dispatcher selects multiple jobs, changes priority in one action
- **Success metrics (draft)**:
  - Primary: Median time-per-morning-re-prioritization (target: < 3 min from 25)
  - Counter: Bulk-edit revert rate
- **Owner**: Web squad
- **Status**: Refining; eng start 2026-09-01
- **Commitment**: Direction set

### X3 -- Enable customer admins to customize job-status taxonomy, so that we fit enterprise workflows without forcing them to compromise

- **Source feature**: custom job-status per workspace
- **Outcome**: Admin defines custom statuses; reports adapt; UI honors customer terminology
- **Success metrics (draft)**:
  - Primary: # of workspaces using custom statuses (target: 30)
  - Secondary: Enterprise deal cycle days (looking for reduction)
- **Owner**: Web squad
- **Status**: Discovery -- needs validation with the 3 enterprise accounts requesting
- **Commitment**: Direction set; scope undefined

## LATER (3-6 months, problem space only)

### L1 -- Enable field technicians to update jobs via their phone's native app instead of mobile web

- **Source feature**: native iOS + Android app
- **Outcome (problem)**: Mobile web has friction; native may unlock offline-first UX patterns
- **Status**: In strategic radar; will validate after offline mode (N1) ships -- if N1 solves the core problem, native may not be needed
- **Commitment**: Strategic intent only; no scope, no metrics yet

### L2 -- Enable customers to integrate Pylon with their existing CMMS

- **Source feature**: API + webhook integrations
- **Outcome (problem)**: Several enterprise prospects use SAP, Maximo, IBM Maximo; Pylon as a silo is a deal-killer
- **Status**: Strategic radar; validated by 2 sales conversations, not yet enough for Next
- **Commitment**: Strategic intent only

### L3 -- Enable Pylon to surface predictive failure indicators to dispatchers

- **Source feature**: ML-based predictive maintenance
- **Outcome (problem)**: Could be a differentiator; needs data volume we don't yet have
- **Status**: Far horizon; depends on offline mode and integrations to gather enough data
- **Commitment**: Watch only

## Output-to-outcome transformation table

| Output (was) | Outcome (now) | Horizon |
|---|---|---|
| Build offline mode | N1: Field techs work without connectivity | NOW |
| Build local cache | N1: (subsumed) | NOW |
| Build conflict resolution | N1: (subsumed) | NOW |
| Build re-assign UX | N2: Dispatchers reassign in 2 clicks | NOW |
| Build list-view tech filter | N2: (subsumed) | NOW |
| Build shareable status link | N3: Customers share with non-Pylon stakeholders | NOW |
| Build SSO | X1: Enterprises use their IDP | NEXT |
| Build bulk priority edit | X2: Morning re-prio in 3 min | NEXT |
| Build custom job statuses | X3: Customers customize their taxonomy | NEXT |
| Build native mobile app | L1: (problem only -- may be redundant after N1) | LATER |
| Build CMMS integrations | L2: (problem only) | LATER |
| Build predictive maintenance | L3: (watch only) | LATER |

## Dependencies (across horizons)

| Item | Depends on | Mitigation |
|---|---|---|
| N1 | Data Platform local-cache schema | In flight; tracked via dependency-map |
| N3 | Audit-log infrastructure | In flight |
| X1 | Auth squad capacity | Roadmapped Q4 if Q3 slips |
| X3 | N3 (sharing must understand status names) | Sequenced after N3 |

## Risks

| Risk | Item | Mitigation |
|---|---|---|
| N1 offline scope creep (3 sub-features in one outcome) | N1 | Lock v1 to "read-only offline + sync conflict basic"; advanced conflict to v1.1 |
| X3 validates as "feature only 3 customers need" | X3 | Discovery first; do not build until validated |
| L1 (native app) gets reprioritized to Now by exec demand | L1 | Outcome roadmap: if N1 succeeds, native may be redundant. Use the data to defend the prioritization. |

## What this roadmap is NOT

- A delivery commitment beyond Now items.
- A feature wish-list ordered by squeaky wheel.
- A timeline for each output.
- A guarantee that Later items will ever ship.

## How we use this with stakeholders

| Stakeholder | What they see |
|---|---|
| CEO | This document, in full |
| Board | Now + Next, headline outcomes only |
| Sales | All horizons, with explicit "we cannot commit to Next or Later in a deal" instruction |
| CS | All horizons, with permission to use Next/Later in customer roadmap conversations as "exploring" |
| Customers (via Productboard) | Now items as "in flight"; Next as "considering"; Later as "future" |
| Engineering | All horizons with detailed scope on Now, lighter scope on Next |
| Investors | Now + Next, outcome-framed |

## Review cadence

- Weekly: PM updates Now item status
- Monthly: Re-review Now -> Next transitions; new Later items added
- Quarterly: Full re-validation; promote Later -> Next; demote Next -> Later if needed
- Strategy change: Trigger full re-derivation
````

## Why this works

- The "so what?" chain collapses 3 features into 1 outcome (N1), which prevents shipping "offline mode" without "conflict resolution" and calling it done.
- Now items have specific dates and metrics; Later items have only problem statements. The discipline of NOT pre-committing Later metrics is rare and valuable.
- The output-to-outcome transformation table is preserved as a translation key so anyone asking "where did feature X go?" can find it.
- Each item names exactly who benefits, what changes for them, and the business impact -- the CEO's "what's different for customers?" question now has a one-row answer.
- The "what this roadmap is NOT" section heads off Sales pressure to commit Now-level dates on Next items.

## What's next

- Pair with [../north-star-metric/](../north-star-metric/) -- ensure every Now outcome maps to an NSM input metric.
- Use [../brainstorm-okrs/](../brainstorm-okrs/) to translate Now outcomes into Q3 KRs.
- Pair with [../prioritization-frameworks/](../prioritization-frameworks/) (RICE) when promoting Next -> Now.
- Use [../roadmap-communication/](../roadmap-communication/) for the stakeholder-specific variants (exec, sales, customer).
- Use [../dependency-map/](../dependency-map/) for the cross-team dependencies (N1 + N3).
