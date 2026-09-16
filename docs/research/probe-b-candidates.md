# Probe B — candidates

- **Date:** 2026-09-16 (week 1; strategy in [strategy.md](../product/strategy.md))
- **Task:** T50 / KAD-1 — 15 names with a source, five booked by **2026-09-22** or the reason written
- **Script:** [interview-script.md](interview-script.md) (Ukrainian, 45 min) · English 30-minute cut in [probe-b-outreach.md](probe-b-outreach.md)
- **Messages:** [probe-b-outreach.md](probe-b-outreach.md)

> **Privacy.** This file names real people who never asked to be in it. Everything
> here is already public — a GitHub handle and the issue they opened — and no
> address is copied into the file: the column says *where* a public contact is,
> not what it is. Keep it that way. Before this file reaches a public branch,
> decide whether it belongs in git at all; the statuses (`declined`, `no reply`)
> are about people, not about code.

## Rules, from T50 and strategy §2

- **No email taken from GitHub.** GitHub's Acceptable Use Policy §7 forbids unsolicited email using information from the service. Reach people through a contact they published on their own site, LinkedIn or X.
- **This file is superseded as a tracker by the ledger outside git** ([strategy §5](../product/strategy.md)). Keep it only until the rows are copied there, then remove it before any push.

- Never in the issue thread, never in any competitor's tracker.
- Only people with a **public contact on their own site, LinkedIn or X**. No contact → `skip`, not a hunt.
- **One message, no follow-up** to anyone from the public pools (A, B).
- Disclose in the first message that the owner builds tooling in this area; do not name kadence or describe it until the stories are told.
- Ask for **30 minutes**, not 45 — a stranger's yes costs less, and the site's CTA already says thirty.

## Status values

`to send` → `sent YYYY-MM-DD` → `replied` → `booked YYYY-MM-DD HH:MM` → `done` · or `declined` / `no reply` (7 days after sent) / `skip (reason)`

## A. Authors of the public pain — discovery verdict §2 (door 1 and 2)

They described the loss in their own words, in public, before we existed for them. Highest-value pool, coldest contact.

| # | Handle | Source | What they said publicly | Why it matters for Probe B | Public contact | Status |
|---|---|---|---|---|---|---|
| A1 | `mieubrisse` | [beads#2938](https://github.com/gastownhall/beads/issues/2938) "Beads feels painful to use" · 17 reactions | ~10 hours caring for the tool instead of the work | Adopted the category, measured the cost of the workaround himself | personal site, X | to send |
| A2 | `rrnewton` | [beads#158](https://github.com/gastownhall/beads/issues/158) "RFC for markdown backend" · 12 comments | wants a "dumb as bricks" backend that merges when it diverges; has a working branch | Wrote the RFC for the shape we built — the strongest switcher signal, and the likeliest to tell us why it is *not* enough | LinkedIn, X | to send |
| A3 | `gaugau3000` | [Backlog.md#711](https://github.com/MrLesk/Backlog.md/issues/711) collision-free task IDs | hit ID collisions "in production twice", humans plus a server-side agent | Exactly the multi-author team G1 needs | X | to send |
| A4 | `iRonin` | [Backlog.md#843](https://github.com/MrLesk/Backlog.md/issues/843) `task edit` loses concurrent writes | lost update on the edit path | Runs an agency (Poland) — a team, near our time zone | company site | to send |
| A5 | `KevinFink` | [beads#2466](https://github.com/gastownhall/beads/issues/2466) recurring merge conflicts, multi-machine | state conflicts across machines | Multi-machine is the two-author case | personal site (not the GitHub email) | to send |
| A6 | `roberto-mello` | [beads#2029](https://github.com/gastownhall/beads/issues/2029) crash with more than one instance open | concurrent access breaks | Concurrent use = more than one author or agent | LinkedIn, X (not the GitHub email) | to send |
| A7 | `jeremy-newhouse` | [Backlog.md#997](https://github.com/MrLesk/Backlog.md/issues/997) create reuses an archived ID | silent wrong reference | Works in a company org on GitHub — likely a team | **only a GitHub-profile email** | skip unless a contact is found on his own site or LinkedIn |
| A8 | `schickling` (via `schickling-assistant`) | [beads#2489](https://github.com/gastownhall/beads/issues/2489) Dolt breaks atomic code+issues-in-same-commit | "one of beads' killer features was issues in git … same commit, same PR" | The issue was filed by his *agent account* — a rare look at an agent-first workflow. High-profile; expect no reply, costs one message | via the human's public profile | to send |
| A9 | `galexy` | [beads#2430](https://github.com/gastownhall/beads/issues/2430) Dolt journal corruption | data loss in the tracker | Trust in the storage layer | personal site | to send |
| A10 | `srobertson` | [beads#376](https://github.com/gastownhall/beads/issues/376) "I want to love Beads but…" · 25 reactions | docs volume as a barrier | Works at a large company — likely a disqualifier as a *team*, still a good story. Lowest priority in A | X (not the GitHub email) | to send (last) |
| — | `iamlasse` | [beads#2573](https://github.com/gastownhall/beads/issues/2573) · 38 reactions, the top complaint | "Tasks disappear" | Would be the best interview in the pool | **none on profile** | skip (no public contact) |
| — | `murdoch-development` | [Backlog.md#937](https://github.com/MrLesk/Backlog.md/issues/937) atomic task coordination | two agents claim one task | Right problem | **none on profile** | skip (no public contact) |

## B. Probe A maintainers whose task files actually conflicted

From [probe-a-data.csv](probe-a-data.csv), `task_conflicted > 0`, sorted by count. They did not complain — the git history did. Ask about their experience, not about our number.

| # | Handle | Repository | Task-file conflicts / merges | Public contact | Status |
|---|---|---|---|---|---|
| B1 | `usmcamp0811` | crystal-forge | 7 / 127 (pushed 2026-09-16) | personal site | to send |
| B2 | `yaleh` | baime | 5 / 132 | **only a GitHub-profile email** | skip unless a contact is found elsewhere |
| B3 | `jpoley` | flowspec | 5 / 263 | site, X | to send |
| B4 | `madebyraygun` (org, agency) | nigel | 2 / 111 | company site | to send |
| B5 | `rvdbreemen` | OTGW-firmware, **adr-kit** | 2 / 300 · 1 / 129 | **only a GitHub-profile email** — look for LinkedIn | to send if found — maintains an ADR kit, so branch 2 of the script ("where does *why* live") is his own subject |
| B6 | `seabo` | seaborg | 2 / 149 | company site | to send |
| — | `InbarR` | tmax | 2 / 20 | none on profile | skip (no public contact) |

## C. Warm and community

| # | Who | Source | Role in Probe B | Status |
|---|---|---|---|---|
| C1 | Workplace team (names stay out of this file) | owner | **Pilot 0**, not an interview: `init` in their repo, screen shared, hesitations written down | to ask |
| C2 | The tech lead from 2026-09-10 | [tech-lead-feedback](tech-lead-feedback-2026-09-10.md) | Already primed — the conversation named the product. Offer a **concierge pilot**, not an interview; do not count toward the five | to ask |
| C3–C7 | Respondents to the DOU / Telegram post | [outreach: DOU post](probe-b-outreach.md) | Interviews in Ukrainian with the full 45-minute script | post not published |
| C8 | Replies to the X / LinkedIn post | [outreach: public post](probe-b-outreach.md) | Interviews | post not published |

## Count

| | Contactable | Sent | Replied | Booked | Done |
|---|---|---|---|---|---|
| A — public pain | 9 | 0 | 0 | 0 | 0 |
| B — Probe A | 4 (+1 if B5 found) | 0 | 0 | 0 | 0 |
| C — warm / community | 2 + post | 0 | 0 | 0 | 0 |
| **Total** | **15 + posts** | **0** | **0** | **0** | **0** |

Expected yield, stated before sending so it cannot be adjusted after: cold reply rate 10–20% → 2–3 conversations from A+B; the DOU/Telegram post ≥ 3 bookings (channel O5). The Sep 22 gate is now ≥ 40 touches and ≥ 2 booked ([strategy §4](../product/strategy.md)) — this pool alone cannot supply 40; the LinkedIn and warm channels do.

## If 2026-09-22 arrives with fewer than five booked

Write the paragraph here, with the counts above, answering: which pool under-delivered, whether the message or the pool was wrong, and what the next seven days do differently. That paragraph closes T50 as validly as five bookings do.
