# Sprint Capacity Math

## 1. Why capacity math matters

Most sprints miss because the team committed more than their real
capacity. The standard story-point + velocity model often hides:

- PTO (vacation, sick, parental)
- On-call rotation overhead
- Meeting overhead
- Interrupt + support tax
- New-hire ramp
- Cross-functional reviews
- Production incident response

A team that "did 50 points last sprint" probably did 50 points *given that
sprint's PTO and interrupts*. Tomorrow's sprint will be different.

## 2. The per-person formula

```
Raw hours = sprint days × hours/day
- PTO / holidays
- Meetings (recurring + ad-hoc)
- On-call hours (avg per sprint)
- Interrupt tax (support, Slack, drive-bys)
- Ramp (new-hire / new-area discount)
= Available hours
× Focus factor (0.6-0.75)
= Effective hours for sprint work
```

### Sprint days
- 1-week sprint: 5 days
- 2-week sprint: 10 days (most common)
- 3-week sprint: 15 days

### Hours per day
- 8 (standard)
- 7 (with 1-hour lunch)
- 6 (very conservative; accounts for breaks)

### Focus factor
- 0.5 — heavy interrupt environment (support engineer)
- 0.6-0.7 — most product engineers
- 0.7-0.8 — focused product team in flow
- 0.8+ — rare; isolated specialist work

Don't assume 1.0. Engineering doesn't happen in 8-hour pure flow.

## 3. Per-team aggregate

Sum across the team:

```
Engineer A: 36 effective hours
Engineer B: 28 effective hours (on-call this sprint)
Engineer C: 0 effective hours (parental leave)
Engineer D: 36 effective hours
Engineer E: 30 effective hours (3 days PTO)
EM (50% IC): 18 hours
---
Total: 148 effective hours = ~18.5 days of real work
```

This is your real capacity. Commit ≤ 80% of this.

## 4. Story point calibration

If you use story points, calibrate to hours:

| Story points | Approximate hours | Typical |
|--------------|-------------------|---------|
| 1 | 2-4 hours | Trivial change |
| 2 | 4-8 hours | Small feature |
| 3 | 1 day | Standard story |
| 5 | 2-3 days | Larger story |
| 8 | 4-5 days | Should split |
| 13 | 1+ weeks | Definitely split |
| 20+ | 2+ weeks | Epic; not a story |

Calibrate quarterly. Each team's points mean different things.

## 5. Velocity tracking

Track per sprint:
- Committed points
- Stretch points
- Actually delivered points
- Carried over

After 3-5 sprints, you have signal:
- Average velocity (delivered)
- Velocity stability (standard deviation)
- Commit vs deliver ratio

Use **average velocity × commit ratio** for next sprint's commit.

Example:
- Avg velocity: 40 points
- Commit ratio: 0.85 (commit 47, deliver 40)
- Next commit: 40 × 0.85 = ~34 points

This is more conservative than naive "commit avg." Most teams under-deliver.

## 6. Common capacity drains

### On-call
- 1-week rotation on a noisy service: 30%+ of week
- 1-week rotation on a quiet service: 5-10% of week
- Plan zero new work for on-call week

### Support tier
- "Support engineer this week" = 50%+ time
- Mid-sprint pull to support = unplanned hours lost

### New hire ramp
- Month 1: 25% productivity
- Month 2: 50%
- Month 3: 75%
- Month 6+: 100%

Plan for ramp; don't commit at full productivity.

### Meetings
- Standup: 15 min × 10 days = 2.5 hrs
- Sprint planning: 2 hrs / 2-week sprint = 0.4 hrs/day
- Retro: 1 hr / 2-week sprint
- 1:1s: 1-2 hrs / week
- Cross-functional: 1-3 hrs / week
- Total: typically 8-15 hrs / 2-week sprint per engineer

### Interrupts
- Slack questions: ~30 min / day = 5 hrs / sprint
- Drive-by reviews / pairings: 1-3 hrs / sprint
- Production triage: 0-10 hrs / sprint
- Customer escalations: 0-8 hrs / sprint

Together: 6-25 hrs / sprint depending on team role.

## 7. Capacity for non-feature work

Reserve capacity for:
- Tech debt (10-20%)
- Production support (5-15%)
- Code review for the team
- New-hire ramp
- Sprint planning + retro

These often aren't planned but happen anyway. Reserve or surprise.

## 8. Capacity by role

### Senior engineer
- 60-70% on feature work
- 20-30% on review / mentoring / pairing
- 10% on tech debt / improvement

### Mid-level engineer
- 80% on feature work
- 15% on review
- 5% on overhead

### Junior engineer
- 70% on feature work
- 30% on learning / asking / re-doing

### Engineering manager (50% IC)
- 30-50% on feature work
- 50-70% on people / meetings / planning

Match capacity expectations to role.

## 9. Quarter-level capacity

Roll up capacity across sprints:

```
6 sprints × team's avg sprint capacity (after PTO etc)
= quarter capacity

Allocate to:
- Run the business (50%): bugs, support, tech debt, OKR maintenance
- Grow the business (35%): feature roadmap
- Transform the business (15%): bigger bets, experiments
```

If you're allocating 100% to feature roadmap, you're going to miss
because run-the-business absorbed the rest.

## 10. Capacity for adjacent work

Don't forget:
- Code review (~30 min per PR; 5-10 PRs / sprint per engineer)
- Pairing / mentoring
- Design reviews
- Architecture decisions
- Hiring (interviews × number of loops)
- Conferences / learning
- Recognition + retention activities

Sum these; they're real hours.

## 11. Mid-sprint reality

A healthy sprint plan:
- Has 15-20% buffer (commit + stretch < 100%)
- Allows for unplanned production / support
- Has a "shut down stretch first" rule
- Has a "drop a commit, don't push past" rule

When unplanned work arrives:
1. Is it truly urgent? (production incident, exec ask)
2. If yes: descope stretch first
3. If still over capacity: descope a commit; communicate to stakeholders
4. If can't descope (committed externally): formal mid-sprint adjustment with PO

## 12. Common capacity mistakes

- Assuming 1.0 focus factor
- Not subtracting on-call hours
- Forgetting PTO
- Underestimating interrupts
- Counting EM at 100% IC
- Counting new hire at 100% productivity
- Counting "support tier" person at 100% on new work
- No buffer for unknowns
- Stuffing commits + stretch to 100%

## 13. Per-sprint plan template (capacity section)

```
Sprint: [name]
Dates: [start - end]

Team capacity:
- Alice: 40 hrs (no PTO)
- Bob: 28 hrs (on-call this sprint)
- Carol: 32 hrs (1 day PTO)
- Dave: 0 hrs (parental leave)
- Eve: 40 hrs
- Frank (EM): 18 hrs (50% IC)
Total: 158 hrs = ~20 person-days

Commitment target (80%): 126 hrs
Stretch (15%): 24 hrs
Reserve (5%): 8 hrs

Velocity over last 3 sprints: 40, 42, 38 pts = avg 40
Commit ratio: 0.85
Next commit: 34 pts (~120 hrs)
Stretch: 6 pts (~24 hrs)
```
