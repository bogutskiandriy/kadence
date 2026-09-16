# North Star log

The North Star (docs/product/north-star.md): repositories whose `.kadence/events`
holds events from at least two different authors 14 days after `kadence init`.
One row a week (strategy O2, KR 2.2). Rows are appended by
`node scripts/north-star.mjs --search --append` and never edited.

- **public** — public GitHub repositories with a journal, found by code search
  and verified against their git tree (bogutskiandriy/kadence itself excluded)
- **≥ 14 d** — of those, journals at least 14 days past their first event
- **North Star** — of those, journals with events from ≥ 2 authors. An author is
  the event's `actor` email, so one person through a human and an agent is one
- **pilots** — consented private check-ins (`--local`), counted by hand

Limits of the method: GitHub's REST code search does index dot-directories
(`repo:cli/cli path:.github/workflows` returns hits), but it does not index
every repository — on 2026-09-16 it returned nothing at all for
bogutskiandriy/kadence, public with 45 event files on main. The public count is
a floor, not a census. The script asks several query shapes
and verifies every hit; `--repo owner/name` adds a known repository directly.

| date | public | ≥ 14 d | North Star | pilots | notes |
|---|---|---|---|---|---|
| 2026-09-16 | 0 | 0 | 0 | — | code search: 0 candidate repo(s) from 5 queries; control: bogutskiandriy/kadence is public with 45 event files on main yet returns 0 hits for every query, while dot-dirs are indexed elsewhere (repo:cli/cli path:.github/workflows = 21) — REST code search has not indexed the repo; tree read of it works (--include-self); local self-check: 358 events, 1 author, 12 d — not yet day 14 |
