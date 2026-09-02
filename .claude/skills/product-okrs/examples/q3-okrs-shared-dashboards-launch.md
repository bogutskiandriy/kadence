# Example: Q3 OKRs for Acme Analytics Shared Dashboards Launch

> Real-world scenario showing how to apply the Radical Focus OKR workflow end-to-end.

## Context

Acme Analytics is gearing up for the Q3 GA launch of "Shared Dashboards" -- a feature that lets customers share read-only dashboards with their own clients. The Customer Workflows product team (PM Devi, EM N. Okafor, 4 engineers, 1 designer) needs Q3 OKRs that reflect the launch impact, not the launch itself. The team has been burned before by "ship X" KRs that produced shipped-but-unused features.

The PM is running a Q3 OKR brainstorm on 2026-05-22 (start of quarter is 2026-07-01). She wants three candidate OKR sets, the team picks one, and the team's OKRs map cleanly into the Customer Workflows org OKR ("Make Acme stickier with the customer's own stakeholders").

## Inputs

- Org-level OKR for Customer Workflows: "Make Acme stickier with the customer's customers" (single theme)
- Closed beta data: 75% activation, 56% outcome rate, NPS 38, 6 quotable testimonials
- Q3 capacity: ~80 engineering days
- The `okr_validator.py` tool for SMART scoring

## Applying the skill

1. **One theme, locked**: "Adoption of Shared Dashboards drives expansion." Rejected secondary themes (mobile parity, design system) -- they're sprints, not OKRs.
2. **Generated 3 OKR sets** -- adoption-led, expansion-led, retention-led -- each with one objective, three KRs (including a counter-metric), and rationale.
3. **Applied the counter-metric test** to each set. The adoption-led set was missing a counter-metric on quality; added "weekly NPS of share recipients >= 30".
4. **Validated against SMART + Wodtke** using the validator tool. The expansion-led set failed Wodtke's "set at 60-70% confidence" (KR1 was sandbagged at 95% confidence). Reset to 60% confidence.
5. **Team picked the expansion-led set** as primary, with adoption-led as a watch list (informally tracked).
6. **Wrote a kill-criteria note**: if KR1 misses 50% of target by mid-Q, declare a learning quarter and pivot.

Key decision quoted: *"Sandbagged KRs are not safe -- they signal the team is not actually betting on the launch."*

## The artifact

````markdown
# Q3 2026 OKRs -- Customer Workflows squad (Shared Dashboards)

**Theme:** Adoption of Shared Dashboards drives expansion.
**Window:** 2026-07-01 to 2026-09-30
**Confidence ratings:** as of 2026-05-22 (planning); revisit weekly during Q3

## The chosen OKR (Expansion-led)

### Objective
**"By end of Q3, Shared Dashboards is the reason mid-market customers expand into the Pro tier."**

- Qualitative: yes
- Inspirational: yes (every CSM and AE has a story they will want to repeat)
- Time-bound: yes (Q3)
- Actionable: yes (PM + CSM + Sales own the levers)

### Key Results

| # | KR | Target | Baseline (beta) | Confidence | Counter? |
|---|---|---|---|---|---|
| 1 | % of Pro-tier expansions in Q3 attributed to Shared Dashboards (CSM-tagged in HubSpot) | >= 35% | 0% (pre-launch) | 60% | -- |
| 2 | Weekly share-link generation rate, mid-market segment | >= 1.2 links / active workspace / week | 0.7 (beta) | 65% | -- |
| 3 | NPS of share-link RECIPIENTS (external stakeholders, surveyed via in-link survey) | >= 30 | n/a | 60% | yes (counter-metric for KR2) |

### Rationale

The team's biggest risk on Shared Dashboards is shipping a feature that is loved by power users but ignored by the median Pro account. KR1 ties the feature to revenue impact (the company-level outcome). KR2 measures real usage (the leading indicator). KR3 is the counter-metric: if recipients hate the experience, KR2 can still climb (customers send links anyway) but the feature is poisoning trust. All three KRs together prevent the team from gaming any one.

### Why these confidence levels

KR1 at 60%: this is the first quarter the CSM team is asked to tag the attribution; the data pipeline is unproven. Wodtke's bar.
KR2 at 65%: usage in beta was 0.7; the Pro-tier segment has higher meeting cadence; 1.2 is a 70% lift -- ambitious but anchored.
KR3 at 60%: we have never measured recipient NPS; the survey instrument is itself an experiment.

### Kill criteria

- If KR1 < 17% by mid-Q (week 6), call a learning quarter: feature stays in market, GA already shipped, but Q4 OKRs reset around fixing the attribution gap.
- If KR3 < 15 in any weekly read, raise to a Sev2 design review immediately -- the feature is creating bad impressions externally, which damages the brand beyond Acme product surface.

### Weekly health check

| Indicator | Source | Owner |
|---|---|---|
| Share-link generation rate | Amplitude | Devi |
| Pro-tier expansion attribution | HubSpot CSM workflow | Head of CS |
| Recipient NPS | In-link Pendo survey | Devi + Design |

## Alternative OKR sets considered (not chosen)

### Alternative 1 -- Adoption-led

**Objective:** "Every Pro-tier workspace experiences Shared Dashboards in Q3."

| # | KR | Target | Confidence |
|---|---|---|---|
| 1 | % of Pro-tier workspaces that have generated >= 1 share link | >= 60% | 70% |
| 2 | % of Pro-tier workspaces with >= 2 active share links at end of quarter | >= 30% | 65% |
| 3 | Counter-metric: support-ticket rate per active workspace (no regression) | <= 1.1x baseline | 75% |

**Rejected because:** measures adoption breadth, not depth or business impact. A workspace that creates one link and never uses it counts. The expansion-led set forces revenue accountability.

### Alternative 2 -- Retention-led

**Objective:** "Shared Dashboards locks in mid-market customers ahead of renewal."

| # | KR | Target | Confidence |
|---|---|---|---|
| 1 | Net revenue retention, mid-market segment (vs prior quarter) | >= 112% | 60% |
| 2 | Gross churn, mid-market segment (vs prior quarter) | <= 1.4% / mo | 60% |
| 3 | Counter-metric: % of churned customers citing Acme product gaps in exit survey | <= prior quarter | 70% |

**Rejected because:** retention is influenced by too many factors outside the team's control; the squad cannot honestly say "we moved NRR by 4 points by shipping Shared Dashboards alone." Expansion-led keeps attribution clean.

## SMART + Wodtke validation (okr_validator.py output)

```
$ python scripts/okr_validator.py --input okrs.json --framework wodtke

Set: Expansion-led (CHOSEN)
  Objective:
    [PASS] Qualitative
    [PASS] Inspirational
    [PASS] Time-bound (Q3)
    [PASS] Actionable
  KR1 (35% expansion attributed):
    [PASS] Specific
    [PASS] Measurable (% with source = HubSpot)
    [PASS] Achievable (60% confidence)
    [PASS] Relevant (theme)
    [PASS] Time-bound (Q3)
  KR2 (1.2 links/wk):
    [PASS] All SMART
    [PASS] 65% confidence
  KR3 (NPS >= 30, recipient):
    [PASS] All SMART
    [PASS] 60% confidence
    [PASS] Counter-metric for KR2

Set: Adoption-led
  KR3 counter passes; KR1/KR2 high-confidence (>= 70%) -- borderline sandbagged

Set: Retention-led
  KR1 confidence 60% but attribution to team's work is weak -- WARN
```

## Connection to the company OKR

| Level | Objective | Connection |
|---|---|---|
| Company | Grow ARR to $58M | -- |
| Org (Customer Workflows) | Make Acme stickier with the customer's customers | Theme |
| Squad (Shared Dashboards) | Shared Dashboards is the reason mid-market customers expand | Direct contributor (KR1 -> expansion ARR) |

## Q3 weekly Monday cadence

- 15-min weekly OKR check-in at squad standup (Monday 10:00)
- Numbers refreshed Friday afternoon by Devi
- Mid-Q review with VP Product at week 6
- End-Q retro at week 13 using `sprint-retrospective/`

## Risks to the OKR

| Risk | Impact | Mitigation |
|---|---|---|
| HubSpot CSM tagging is inconsistent | KR1 unreadable | Devi runs a CSM training in week 1; sampling QA weekly |
| Recipient NPS survey has < 30% response rate | KR3 unreadable | Survey appears one time, on third dashboard view; A/B copy |
| Launch slips past 2026-07-14 | All KRs compressed | OKR window starts at GA + 7 days, not 2026-07-01 |
````

## Why this works

- One theme, one quarter, one chosen OKR set -- the focus discipline Wodtke insists on.
- KR confidence is honest (60-65%), not sandbagged at 95%. Wodtke's bar.
- KR3 is a real counter-metric (recipient NPS) for KR1+KR2, not a vanity metric.
- The expansion-led objective ties team output to company revenue; the adoption-led alternative was rejected on attribution grounds, not on ambition.
- Kill criteria are written into the OKR document, so a mid-quarter "learning quarter" decision is not a surprise.

## What's next

- Feed the OKR into [../outcome-roadmap/](../outcome-roadmap/) to ensure Now/Next items map to KR levers.
- Use [../north-star-metric/](../north-star-metric/) -- recipient NPS becomes an input metric for the org NSM.
- Pair with [../status-update-generator/](../status-update-generator/) for the Monday cadence.
- Use [../launch-playbook/](../launch-playbook/) to coordinate the GA event that the OKR window depends on.
- Revisit with [../../sprint-retrospective/](../../sprint-retrospective/) at end-of-Q for the OKR retro.
