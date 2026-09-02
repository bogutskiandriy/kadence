# Red Flags: Job Stories

> Common ways this skill's output goes wrong — concrete examples, why they're bad, and how to fix them.

## How to use this document

Scan job stories before they enter sprint planning. Each red flag shows the *bad* version next to the *good* version, anchored to the JTBD "When/Want/So" format (Klement, Christensen) and Bill Wake's INVEST.

---

## Red Flag 1: Job story is a feature request in disguise

**Symptom.** Story reads "When I want to use saved searches, I want a saved-search button, so I can save searches."

**Why it's bad.** The Situation is a tautology ("when I want to use feature X"), the Motivation names the implementation ("button"), and the Outcome restates the feature. The story has been wrapped in JTBD framing without changing the team's solution-first thinking.

**Bad example:**
> "When I want to use saved searches, I want a saved-search button on the toolbar, so I can save searches."

**Good example:**
> "When I am exploring listings late at night and find one I want to revisit tomorrow, I want to bookmark the listing without losing my current search context, so I can resume my search later without re-running it."

**How to catch it.** Strip the Want clause. Does the remaining "When ... so I can ..." describe a recognizable real-world moment? If the situation tautologically references the feature, the story is feature-in-disguise.

---

## Red Flag 2: Vague situation ("when I use the app")

**Symptom.** Situation reads "When I open the app" or "When I need data" or "When I am working".

**Why it's bad.** Vague situations are unfalsifiable. The team cannot disprove them; they cannot design for them. Every user "opens the app" — that's not the trigger that creates the need. The specific moment is what informs the design.

**Bad example:**
> "When I open the app, I want to see my data, so I can be informed."

**Good example:**
> "When I am about to walk into my Monday 9:30am pipeline review and I have not opened the app since Friday, I want to see the deals that moved or stalled in those 3 days, so I can focus the review on the changes."

**How to catch it.** Apply the "could you video this?" test. If a film crew could not capture the moment described, the situation is too vague.

---

## Red Flag 3: Motivation prescribes the UI

**Symptom.** Motivation reads "I want a dropdown" or "I want a button" or "I want a modal".

**Why it's bad.** INVEST-N (negotiable) fails. The story has locked in an implementation before design has explored alternatives. Engineering builds the dropdown; six months later, research shows users wanted a search-as-you-type input.

**Bad example:**
> "When I am filtering my list, I want a dropdown of all available filters, so I can pick one."

**Good example:**
> "When I am filtering my list of 200+ items, I want to narrow it by status and assignee, so I can quickly find the items I need to act on."

**How to catch it.** Search the Motivation for: dropdown, button, modal, picker, panel, sidebar, popup. Each is an implementation lock.

---

## Red Flag 4: Outcome is not measurable

**Symptom.** Outcome reads "so I can be productive" or "so I can feel confident" or "so I can do my job".

**Why it's bad.** Unmeasurable outcomes give the team no way to validate the story shipped its value. The acceptance criteria collapse into "feature exists"; the team produces output instead of outcome.

**Bad example:**
> "When I review my dashboard, I want to see my key metrics, so I can be productive."

**Good example:**
> "When I review my dashboard on Monday morning, I want to see my 3 key team metrics with week-over-week change, so I can decide where to focus my 1:1s this week (and skip the 'how is the team doing' question entirely)."

**How to catch it.** Ask: "How would you know the user achieved this?" If no observable signal exists, rewrite.

---

## Red Flag 5: Multiple situations packed into one story

**Symptom.** Story has "When I am creating a new project OR editing an existing project OR cloning a template, I want to set permissions..."

**Why it's bad.** Multiple situations = multiple stories. Each context has different design needs, different acceptance criteria, different complexity. Packing them violates INVEST-S (small).

**Bad example:**
> "When I am creating a new project, editing an existing project, or cloning a project template, I want to configure access permissions, so I can ensure the right people can collaborate."

**Good example:**
> "Split into 3:
> 1. When I am creating a new project from scratch, I want to invite the first collaborators by email, so they receive an invitation immediately.
> 2. When I am editing an existing project's team, I want to add or remove members and see what changed, so I can audit access.
> 3. When I am cloning a project template, I want to choose whether to bring the original collaborators or start clean, so I can match the new project's team."

**How to catch it.** Look for "OR" or commas listing situations in the When clause. Each is a separate story.

---

## Red Flag 6: ACs describe implementation, not behavior

**Symptom.** Acceptance criteria include "API returns 200", "React component renders", "DB column populates".

**Why it's bad.** Implementation ACs cannot be observed by users; they cannot be tested by QA; they lock in technical choices. They produce "done" stories that fail user value.

**Bad example:**
> "AC1: POST /saved-searches returns 201
> AC2: SavedSearchPanel React component renders
> AC3: saved_searches table row inserted
> AC4: Redux store updates"

**Good example:**
> "AC1: After clicking 'Save', the search appears in the user's Saved list within 1 second.
> AC2: The saved search can be re-run, producing the same results.
> AC3: The saved search persists across logout/login.
> AC4: If the user has 25 saved searches, the 26th save shows a paywall with upgrade CTA."

**How to catch it.** Read each AC. Does it mention an API, an endpoint, a database table, HTTP status code, or a UI framework? If yes, rewrite as observable behavior.

---

## Red Flag 7: Story has no acceptance criteria

**Symptom.** Story is well-written (When/Want/So) but has 0 acceptance criteria. "We'll figure out the details in implementation."

**Why it's bad.** INVEST-T (testable) fails. Without ACs, the team cannot agree on "done". The story will be marked done when code merges; QA will reject; engineering will redo. Sprint flow is destroyed.

**Bad example:**
> "Story: When I am preparing for a meeting, I want to see the agenda, so I can come prepared. Acceptance: (empty.)"

**Good example:**
> "Story: When I am preparing for a meeting, I want to see the agenda, so I can come prepared.
> AC1: Agenda visible in the meeting card on dashboard, no extra click.
> AC2: Agenda shows time + topic for each item.
> AC3: If no agenda is set, a 'add agenda' prompt is visible.
> AC4: Agenda updates within 30 sec of being changed in the calendar tool.
> AC5: Agenda is accessible on mobile without scrolling.
> AC6: Items the user owns are visually distinguished."

**How to catch it.** Each story must have 6-8 ACs. < 4 means the team has not thought through behavior.

---

## Red Flag 8: Outcome is internal (not user-facing)

**Symptom.** Outcome reads "so the database is normalized" or "so the API is consistent" or "so the architecture is clean".

**Why it's bad.** INVEST-V (valuable) fails. The user does not benefit from a normalized database; they benefit from the user-facing capability that normalization enables. The story buries the user value in technical language.

**Bad example:**
> "When I want to use the system, I want consistent data types, so the schema is clean."

**Good example:**
> "When I export my dashboard to CSV for my exec review, I want every numeric column to use the same decimal format, so I do not have to reformat 40 cells before pasting into the slides."

**How to catch it.** Read the outcome aloud. If it describes internal system properties, rewrite to describe what the user can now do that they could not before.

---

## Red Flag 9: Story is too small (a task pretending to be a story)

**Symptom.** Story reads "When I want to change my password, I want a password field, so I can change my password." Acceptance: 1 AC. Estimate: 30 min.

**Why it's bad.** Stories should be in the 1-5 day range (INVEST-S). Tasks roll up into stories; stories do not need to be split into tasks-pretending-to-be-stories. A 30-min item is a task — track it in the parent story, not as a separate story.

**Bad example:**
> "STORY-401: Add password change field (30 min, 1 AC).
> STORY-402: Add password change submit button (30 min, 1 AC).
> STORY-403: Add password change confirmation message (30 min, 1 AC)."

**Good example:**
> "STORY-401: When I am securing my account, I want to change my password without contacting support, so I can rotate credentials per my company's policy. (6 ACs covering field, validation, submit, confirmation, audit log, email notification. Estimate: 2 days.)"

**How to catch it.** Filter the backlog for estimates < 1 day. > 20% of stories under 1 day = tasks dressed as stories.

---

## Red Flag 10: No JTBD discovery behind the story

**Symptom.** Story arrives at refinement with no link to a customer interview, support ticket, or observed behavior. The PM wrote it from desk imagination.

**Why it's bad.** Job stories work *because* they ground in real user context. Without research, the team invents situations. Invented situations don't match reality; engineering builds for fictional users.

**Bad example:**
> "STORY-501: When I am using the app, I want a quick way to find help, so I can solve my problem. (Source: 'we should probably have help.')"

**Good example:**
> "STORY-501: When I have just signed up and I am on the empty dashboard with no data, I want a guided next-step prompt, so I do not bounce out of the product confused. (Source: 5 user research interviews with new signups; support tickets [link] showing 23% of first-week tickets are 'I don't know what to do next'; analytics showing 41% bounce rate from empty dashboard.)"

**How to catch it.** For each story, ask "what is the source?" If no interview quote, ticket, or analytics signal, the situation is invented.

---

## Red Flag 11: ACs ignore edge cases

**Symptom.** All 6 ACs describe the happy path. None describe error states, empty states, or edge cases.

**Why it's bad.** Production users hit edge cases first. A happy-path-only AC set ships features that work in demos and break for the first user who has no data, low connectivity, or weird input. QA finds the gaps late; engineering reopens the story.

**Bad example:**
> "AC1: User clicks save and search appears in list.
> AC2: User can re-run saved search.
> AC3: User can delete saved search.
> AC4: User can rename saved search.
> AC5: Search list shows newest first.
> AC6: Each search shows name and date saved."

**Good example:**
> "AC1: Happy path: user clicks save → appears in list in 1 sec.
> AC2: Happy path: user re-runs → same results as save time.
> AC3: Edge: user at 25-search limit → save attempt shows paywall.
> AC4: Edge: search produces no results → save still works; re-run shows 'no results' empty state.
> AC5: Edge: search criteria reference a now-deleted field → re-run shows error with 'edit search' CTA.
> AC6: Empty state: user has 0 saved searches → list shows 'Save your first search' prompt with link.
> AC7: Error: save fails due to network → user sees inline error with retry button.
> AC8: A11y: all interactions keyboard-accessible; screen reader announces save success."

**How to catch it.** Count ACs by category. < 30% covering edge cases / empty states / errors / a11y = happy path only.

---

## Red Flag 12: Job story without strategic linkage

**Symptom.** Story is well-formed but the team cannot answer "why is this in this sprint?"

**Why it's bad.** A good job story is locally coherent (matches a user job) but may not be strategically coherent (matches the team's quarterly OKR). Without a "Supports:" linkage, the backlog fills with disconnected user-value stories that don't aggregate into impact.

**Bad example:**
> "STORY-601: When I am reviewing my team's performance, I want to see metric trends, so I can spot issues early. (PM asked 'why this sprint?' — no answer.)"

**Good example:**
> "STORY-601: When I am reviewing my team's performance ... so I can spot issues early.
> Supports: KR2 'D30 retention from 58% to 70%' (Q3 OKR). Hypothesis: managers who spot issues early intervene earlier; teams with engaged managers retain 23% better (`customer-feedback-triage/` cluster C-014, 18 distinct customers).
> Outcome metric: '% of users who view this view weekly' (target 60% within 30 days of launch)."

**How to catch it.** For each story, ask: "Which OKR or strategic outcome does this serve?" If the answer is "general improvement", the story may be wrong-prioritized.

---

## Red Flag Quick Reference

| # | Anti-pattern | One-line check |
|---|---|---|
| 1 | Feature request in disguise | Strip the Want clause — is there still a real moment? |
| 2 | Vague situation | Apply the "could you video this?" test |
| 3 | Motivation prescribes UI | Search for: dropdown, button, modal, picker, panel |
| 4 | Outcome not measurable | How would you know the user achieved this? |
| 5 | Multiple situations packed | "OR" or commas in the When clause? |
| 6 | ACs describe implementation | Do ACs reference API, DB, HTTP, framework? |
| 7 | Story has no ACs | < 4 ACs? |
| 8 | Outcome is internal | Does Outcome describe what the *user* can now do? |
| 9 | Story too small | Estimate < 1 day? |
| 10 | No JTBD discovery behind story | What is the source: interview, ticket, analytics? |
| 11 | ACs ignore edge cases | % of ACs covering errors / empty / a11y? |
| 12 | No strategic linkage | Which OKR does this serve? |

## Related Reading

- SKILL.md Troubleshooting
- references/jtbd-guide.md
- `wwas/` (Why-What-Acceptance for stories needing business context)
- `backlog-refinement/` (INVEST grading and DoR)
- `discovery/jtbd-workshop/` (sourcing real jobs from customer research)
- `discovery/interview-synthesis/` (interview → opportunities → job stories)
- Alan Klement, *When Coffee and Kale Compete* (2016) — JTBD framing
- Clayton Christensen, *Competing Against Luck* (2016) — JTBD theory
