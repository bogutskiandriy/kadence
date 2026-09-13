# @kadence/github

Publishes kadence tasks to GitHub Issues. **One direction only.**

```bash
npx @kadence/github publish KAD-1
npx @kadence/github publish KAD-1,KAD-2 --dry-run
```

## What it does, and what it will never do

It reads `kadence board --json`, and for each task you name it runs
`gh issue create` or `gh issue edit`. A marker in the issue body —
`<!-- kadence:KAD-1 -->` — makes a second publish an edit rather than a
duplicate.

**It never reads anything back.** Editing the issue on GitHub edits the issue,
not the task, and the next publish overwrites your text. If you want the
reverse direction, the answer is no. The reasoning is recorded as ADR-012 in
the kadence repository, under `docs/decisions/`.

## Why it is a separate package

kadence makes no network requests. That is a constraint, not an oversight, and
it survives because the network lives here instead of in the tracker. Install
nothing and you have nothing: `kadence` alone still opens no socket.

The credential is `gh`'s, not ours. This package holds no token and reads no
credential file — it spawns a CLI you already trust.

## Requirements

`gh` on your PATH and authenticated (`gh auth login`), and a repository with a
GitHub remote.
