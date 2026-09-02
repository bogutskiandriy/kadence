# Example: 15 Job Stories for Wayfinder Onboarding

> Real-world scenario showing how to write JTBD job stories end-to-end.

## Context

Wayfinder is a Series-B B2B project-management SaaS. The Onboarding & Activation squad is redesigning the new-workspace onboarding flow. The previous "As a user, I want..." stories produced generic requirements ("the user wants a fast setup") that designers couldn't act on. The PM (Sam) is switching to JTBD job stories for this work.

Sam has 14 customer interviews from the last 6 weeks plus session-replay data from 200+ recent signups. She'll run a JTBD discovery canvas with the squad on 2026-05-22, then write 15 job stories covering the onboarding flow.

## Inputs

- 14 customer interviews (recorded + transcribed)
- 200 session replays from Pendo
- Squad: 1 PM, 1 EM, 3 engineers, 1 designer, 1 CSM
- Goal: 15 job stories that cover signup -> first project -> first invite -> first task -> activation
- 90-minute workshop

## Applying the skill

1. **Ran the JTBD discovery canvas** with the squad for 30 minutes. Surfaced 7 functional jobs, 5 pains, 5 gains.
2. **Mapped canvas rows to job-story components**: Functional jobs -> Motivation; Pains -> Situation; Gains -> Outcome.
3. **Drafted 15 job stories** in the When / I want / So I can format, covering signup through first-week activation.
4. **Reviewed each for INVEST applicability**. Job stories pass V (valuable) and T (testable) by construction if the outcome is named; verified S (small) by sizing each at <= 5 days.
5. **Cross-referenced** stories against the canvas to ensure every pain and gain is addressed by at least one story.

Key decision quoted: *"We do not write 'As a user, I want X' anywhere in this backlog. The format pretends to be user-centered but it lets us avoid naming the situation that triggers the need."*

## The artifact

````markdown
# Wayfinder Onboarding Job Stories (v1)

**PM:** Sam (Onboarding & Activation)
**Workshop date:** 2026-05-22
**Source:** 14 interviews + 200 session replays + squad canvas
**Format:** When ... / I want ... / So I can ...

## Discovery canvas summary (condensed)

### Functional jobs

- Get my team set up so we can start tracking work
- Migrate work-in-progress from spreadsheets/Trello/Asana
- Demonstrate Wayfinder's value to my manager in week 1
- Configure permissions so the right people see the right work
- Connect Wayfinder to Slack so the team doesn't have to leave Slack
- Avoid losing visibility on work already in flight

### Pains

- "I'm setting this up at 9pm; my team needs it by tomorrow's standup"
- "I have a 60-task spreadsheet I can't lose"
- "I'm worried about looking incompetent if I pick the wrong setup"
- "Standups happen even when the tool isn't fully set up"
- "Old tool had everything wired to Slack; switching breaks our flow"

### Gains

- "Setup takes < 20 min start to finish"
- "I can import what I have in 1 click"
- "Templates that match how my team actually works"
- "Slack notifications working before standup tomorrow"

## The 15 job stories

### Signup phase

#### JS-1 -- Workspace owner: setup-time anxiety

```
When I sign up for Wayfinder at the end of my work day
  knowing my team needs it operational tomorrow,
I want to complete the essential setup in under 20 minutes,
So I can stop worrying and start standup tomorrow with the tool ready.
```

**Source:** Interview #4 (Maya, head of analytics, signed up at 21:14 the night before a sprint)
**Acceptance:**
- Time-to-first-project < 5 min
- Time-to-first-invite < 2 min
- Total wizard flow < 20 min p85
- Wizard is resumable across sessions
**Sizing:** 5 days

#### JS-2 -- Workspace owner: workspace identity

```
When I create a new Wayfinder workspace for my company,
I want to name it and brand it with our logo and color,
So I can quickly orient teammates that this is "our" tool, not generic SaaS.
```

**Source:** 6/14 interviews mentioned wanting to see company name in the header on first login
**Acceptance:**
- Workspace name + logo + accent color set in step 1
- Header reflects branding from first page-load post-signup
**Sizing:** 3 days

#### JS-3 -- Workspace owner: choosing a template

```
When I'm new to project-management tools and unsure how to structure work,
I want to pick from templates matched to my team type (engineering / marketing / ops / design),
So I can avoid blank-page anxiety and start from something credible.
```

**Source:** Interview #11 (first-time PM tool buyer); 4 other interviews showed similar
**Acceptance:**
- 4 starter templates visible in wizard step 2
- Each template is one-click; backed by 3-5 example tasks + boards
- User can edit or discard template after creation
**Sizing:** 5 days

### First-project phase

#### JS-4 -- Workspace owner: import from spreadsheet

```
When I have an active 60-task spreadsheet and I'm switching to Wayfinder,
I want to paste or upload the spreadsheet and have it become a project,
So I can start using Wayfinder without losing my work-in-flight.
```

**Source:** 9/14 interviews; the #1 reason customers stalled in past onboarding
**Acceptance:**
- CSV upload or paste-from-clipboard import
- Auto-detect columns (title, owner, status, priority)
- Preview before commit
- Imports complete in < 30s for files up to 500 rows
**Sizing:** 8 days (split into 4a CSV upload, 4b paste import)

#### JS-5 -- Workspace owner: import from Trello

```
When my team has been on Trello for 18 months and we are switching,
I want a 1-click import that pulls boards, cards, comments, and assignees,
So I can preserve the team's institutional memory.
```

**Source:** Interview #2, #8, #13 -- migrating from Trello
**Acceptance:**
- OAuth flow to Trello
- Import maps Boards -> Projects, Cards -> Tasks, Lists -> Statuses
- Comments and assignees preserved
- Imports < 5 min for boards up to 500 cards
**Sizing:** 8 days (defer to next sprint)

### Invite phase

#### JS-6 -- Workspace owner: bulk invite teammates

```
When I have 8 teammates who need access by tomorrow standup,
I want to paste 8 emails and have invites sent in one action,
So I can invite the whole team in under a minute.
```

**Source:** 8/14 interviews; existing in-app feedback widget item
**Acceptance:**
- Multi-email input field with validation
- Invites send within 30s
- Visible "8 of 8 sent" confirmation
**Sizing:** 3 days

#### JS-7 -- Workspace owner: optional invite step

```
When I'm onboarding solo and just want to evaluate the tool first,
I want to skip the team-invite step without feeling guilty about it,
So I can explore the product before committing to invite my team.
```

**Source:** Session replays: 32% of solo signups bounce at the invite step in the old flow
**Acceptance:**
- "Skip for now" CTA at the invite step
- Skipping does not penalize the user (no nag for 7 days)
- Skipped state is captured as `wizard_invite_skipped` event for analysis
**Sizing:** 2 days

#### JS-8 -- Invited teammate: first login experience

```
When I receive an invite email from my workspace owner,
I want to sign in and immediately see what work is mine,
So I can contribute on day 1 instead of poking around to find my place.
```

**Source:** Interview #6 (invited teammate, week 1 perspective)
**Acceptance:**
- Invite link goes directly to "My tasks" view
- View pre-filtered to tasks assigned to me
- Onboarding tour appears once, dismissable
**Sizing:** 3 days

### First-task phase

#### JS-9 -- Workspace owner: create first task with assignee

```
When I'm setting up my first project and want to feel like work is happening,
I want to create a task with a title, owner, and due date in <30 seconds,
So I can stop configuring and start managing.
```

**Source:** Interview #9; session replays show 78% of time in old wizard spent on task creation
**Acceptance:**
- Single-line creation supports natural language ("@maya design the auth flow due Friday")
- Auto-parses owner and date; user confirms with one keypress
- Task visible in board immediately
**Sizing:** 5 days

#### JS-10 -- Workspace owner: first task feels like a milestone

```
When I finish creating my first real task in Wayfinder,
I want some signal that something meaningful just happened,
So I can confirm I am doing this right and feel motivated to continue.
```

**Source:** 5 interviews mentioned "I never knew if I was on the right path"
**Acceptance:**
- First-task creation triggers a celebratory confetti + "First task created!" toast
- Celebration is dismissable; does not re-fire for subsequent tasks
- Telemetry confirms first-task event fired
**Sizing:** 2 days

### Integration phase

#### JS-11 -- Workspace owner: connect Slack before standup

```
When I'm onboarding and standup is tomorrow,
I want Slack notifications working without leaving the wizard,
So I can keep our standup ritual intact through the switch.
```

**Source:** Interview #3, #5, #10; this is the make-or-break for several teams
**Acceptance:**
- Slack OAuth from wizard step 4
- Sends a test message within 30s to confirm
- Default subscriptions sensible (task created, task completed, blocker added)
**Sizing:** 5 days

#### JS-12 -- Workspace owner: defer Slack to later

```
When I have a workspace using Microsoft Teams instead of Slack,
I want to skip the Slack step without feeling like onboarding is broken,
So I can finish onboarding and connect Teams later.
```

**Source:** Interview #14 (Teams-only org)
**Acceptance:**
- "I use Teams" CTA visible at Slack step
- "Skip integration" CTA also visible
- Skipped state does not block wizard completion
- Future: Teams integration deferred to v1.1 (out of scope here)
**Sizing:** 1 day

### Activation phase (post-wizard)

#### JS-13 -- Workspace owner: see the value in week 1

```
When I'm in my first week of Wayfinder usage,
I want to see a dashboard that shows what my team got done this week,
So I can prove value to my manager and convince myself this was a good choice.
```

**Source:** 7/14 interviews; activation literature on "aha moments"
**Acceptance:**
- Dashboard available from main nav after first task created
- Shows count of tasks created, completed, in flight
- Updates in real time
**Sizing:** 5 days (defer to next sprint)

#### JS-14 -- Workspace owner: get a nudge if I stall

```
When I have not opened Wayfinder for 4 days after signup,
I want a friendly nudge with something specific I can do,
So I can re-engage instead of forgetting I have an account.
```

**Source:** 38% of new workspaces show no activity 4 days post-signup
**Acceptance:**
- Email sent on day 4 if no `user_active` event since signup
- Email subject and body A/B-tested
- Click-through to a specific in-app action (e.g., "create your first task")
- Unsubscribe honored
**Sizing:** 3 days

#### JS-15 -- Workspace owner: dismiss onboarding when I'm done

```
When I have completed the essentials and don't need the checklist anymore,
I want to dismiss the onboarding UI permanently,
So I can use the product without feeling babied.
```

**Source:** Interview #1, #7 (both expert users; old flow nagged forever)
**Acceptance:**
- Dismiss CTA on the onboarding checklist
- Dismissed state persists across sessions and devices
- Telemetry confirms dismissal event
**Sizing:** 1 day

## Canvas coverage check

| Canvas item | Covered by job stories |
|---|---|
| Functional: get team set up | JS-1, JS-2, JS-6 |
| Functional: migrate work | JS-4, JS-5 |
| Functional: demonstrate value | JS-13 |
| Functional: configure permissions | (deferred to next sprint -- not in 15) |
| Functional: connect Slack | JS-11, JS-12 |
| Pain: setup time anxiety | JS-1 |
| Pain: 60-task spreadsheet | JS-4 |
| Pain: standup tomorrow | JS-11 |
| Pain: looking incompetent | JS-3, JS-10 |
| Gain: <20 min setup | JS-1 |
| Gain: 1-click import | JS-4, JS-5 |
| Gain: templates that match | JS-3 |
| Gain: Slack working before standup | JS-11 |

Coverage gap: workspace-level permissions setup. Captured as backlog item to address in the next workshop.

## Sizing roll-up

| Story | Sizing (days) |
|---|---|
| JS-1 | 5 |
| JS-2 | 3 |
| JS-3 | 5 |
| JS-4 | 8 (split) |
| JS-5 | 8 (defer) |
| JS-6 | 3 |
| JS-7 | 2 |
| JS-8 | 3 |
| JS-9 | 5 |
| JS-10 | 2 |
| JS-11 | 5 |
| JS-12 | 1 |
| JS-13 | 5 (defer) |
| JS-14 | 3 |
| JS-15 | 1 |
| **Total** | **59 days** |

Squad capacity ~22 days per sprint. Top-RICE ordered. JS-5, JS-13 deferred to next sprint.

## Job-story format rules used here

1. **Situation, not persona.** Every story names a When that names a real situation, not a generic "as a user".
2. **Outcome, not output.** Every So I can names a desired outcome that the customer can verify (not the same as the engineering output).
3. **Source-tagged.** Every story cites the interview or replay it came from. No story is "obvious to PM".
4. **Sized.** Every story has a sizing estimate; INVEST-S is enforced.
5. **Acceptance criteria are observable.** No "the system is fast"; instead "p85 < 20 min".
````

## Why this works

- Every story names the situation (When) -- 9pm with standup tomorrow, 60-task spreadsheet I can't lose. The persona is built into the situation, not abstracted as "user".
- Every story has a source citation -- interview number or session-replay statistic. Pure invention is excluded.
- The canvas coverage check catches the gap (permissions) instead of letting it surface in week 2 of build.
- Acceptance criteria are observable and quantitative ("p85 < 20 min", "30s import for 500 rows"), so QA and PM can both verify done.
- JS-15 (dismiss onboarding) is included -- the "expert user" perspective is captured, preventing the common onboarding-nags-everyone failure.

## What's next

- Feed top stories into [../backlog-refinement/](../backlog-refinement/) for INVEST scoring before sprint planning.
- Pair with [../story-splitting/](../story-splitting/) for JS-4 (CSV + paste split) and JS-5 (Trello).
- Use [../prioritization-frameworks/](../prioritization-frameworks/) for RICE scoring across the 15.
- Use [../create-prd/](../create-prd/) if any story grows into a feature initiative (e.g., a Trello migration tool).
- Feed activation metrics from JS-13, JS-14 into [../activation-funnel/](../activation-funnel/).
