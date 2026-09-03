<!-- flowit:begin -->
## Project tasks — FlowIt

Tasks live in `.flowit/` as plain files. Read them directly or via the CLI:

    flowit board --json           the whole board
    flowit task list --json       all tasks
    flowit task move FLOW-1 done  change state

`--json` responses carry `schema: "flowit/v1"`; stdout is JSON only.
When acting as an agent, set `FLOWIT_SOURCE=agent`.

Details: `.flowit/README.md`
<!-- flowit:end -->
