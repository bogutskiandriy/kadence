<!-- kadence:begin -->
## Project tasks — kadence

Tasks live in `.kadence/` as plain files. Read them directly or via the CLI:

    kadence board --json           the whole board
    kadence task list --json       all tasks
    kadence task move KAD-1 done  change state

`--json` responses carry `schema: "kadence/v1"`; stdout is JSON only.
When acting as an agent, set `KADENCE_SOURCE=agent`.

Details: `.kadence/README.md`
<!-- kadence:end -->

## Where the context is

`kadence task show <ref> --json` returns the full state of one piece of work:
status, blockers, comments, logged hours and the complete `history` of events
that led there. Read it before asking a human what happened — it is the layer
the code and `git log` do not carry.
