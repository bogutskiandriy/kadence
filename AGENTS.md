<!-- flowit:begin -->
## Задачі проєкту — FlowIt

Задачі лежать у `.flowit/` як звичайні файли. Читай їх напряму або через CLI:

    flowit task list --json      перелік задач
    flowit task move FLOW-1 done змінити стан

Відповіді `--json` мають поле `schema: "flowit/v1"`; у stdout тільки JSON.
Працюючи як агент, виставляй `FLOWIT_SOURCE=agent`.

Подробиці: `.flowit/README.md`
<!-- flowit:end -->
