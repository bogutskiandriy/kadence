# Копія лендінга kadence

- **Дата:** 2026-09-04 (переписано під нове [позиціонування](positioning.md))
- **Рішення:** меседж — спільний контекст роботи команди й AI; журнал — механізм; velocity — наслідок
- **Решта рішень:** демо з `kadence ui`; хостинг Vercel, домен `kadence.tools`; головний CTA — команда встановлення
- **Мова сторінки:** англійська, рівень читання ≤ 8 клас, жодного числа без джерела в репозиторії

---

## Ієрархія CTA

| Рівень | Дія | Де | Метрика |
|---|---|---|---|
| **Головна** | `npm install -g kadence` з копіюванням | hero + повтор біля FAQ | клік по копіюванню |
| Другорядна | Quickstart → Docs | під командою, у секції 6 | клік |
| Третинна | GitHub · npm | навігація й підвал | клік |
| Дослідницька | «Talk to us for 20 minutes» | лише в «чесному статусі» | заброньовані слоти |

**Чого немає:** `Book a demo`, `Contact sales`, `Star us on GitHub`, форм з email. Обґрунтування — у [дослідженні лендінга](../research/landing-page-research.md).

---

## Meta

```
title:       kadence — shared context for your team and your AI agents
description: Tasks, their history and the time they took live in your git repo as an
             append-only journal. Your team and your AI agents read the same thing.
og:image:    the task history JSON on the site's own background
```

---

## 1. Hero

**H1**

> Your team and your AI agents, working from the same context.

**Підзаголовок**

> Tasks, their whole history and the time they took live in your git repo as an append-only journal — one file per event, right next to the code. AI agents pick up where the last session stopped. Nobody fills in a form.

**Головний CTA**

```
npm install -g kadence          [ Copy ]
```

> then run `kadence init` — [60-second quickstart →](/docs/quickstart)

**Термінальний блок праворуч** — те, що бачить агент, справжнім текстом:

```
$ kadence task show KAD-1 --json

{
  "schema": "kadence/v1",
  "label": "KAD-1",
  "status": "in_review",
  "loggedHours": 4.5,
  "blockedBy": ["KAD-7"],
  "comments": [ … ],
  "history": [ … ]
}
```

**Чому саме цей вивід у hero.** Він за секунду показує головне: весь стан однієї роботи в одному виклику, без сервера й без відновлення контексту.

---

## 2. Демо

**Заголовок:** Forty seconds, from empty repo to a working board.

Сценарій без змін: `init` → `task add` → `kadence ui` (рух по колонках) → `sprint close` з числом в останньому кадрі. Умови зйомки — у [дослідженні](../research/landing-page-research.md), розділ 10.

---

## 3. Проблема

**H2**

> Your code says what. Git says when. Nothing says why.

**Before**

> A task moves, someone tries an approach and drops it, a decision gets made in a thread. Two weeks later the only trace is a diff that does not explain itself.

**Agitate**

> For a person that costs a few minutes. For an AI agent it costs the whole session: every new one starts from scratch, re-reads the same files, and asks the question you answered yesterday. Then the next one asks again.

**After**

> kadence keeps that missing layer as events, committed with the code. One call returns the whole state of a piece of work — status, blockers, comments, hours, and every step that led there. A person reads it in the terminal; an agent reads the same thing as JSON.

---

## 4. Чому події, а не файли

**H2**

> Everyone keeps work in the repo now. Almost everyone keeps state.

Три картки — єдине місце з картками на сторінці:

**State drifts.**
> A spec written on Monday and edited by an AI agent on Thursday no longer says what happened. An event cannot drift: it records that something occurred, not what is currently true.

**State conflicts.**
> Two people editing one task on two branches is a merge conflict in every file-based tracker. Here it is not, by construction: append-only, one file per event.

**State forgets.**
> Rewriting a task file destroys the previous version. The journal keeps every step — which is why «how did we get here» has an answer at all.

> Under the cards: State is still there when you want it. It is folded from the journal on read, so the board can never drift from reality.

---

## 5. Доказ тези про злиття

Без змін від попередньої редакції: 8 396 злиттів, 130 репозиторіїв, 15%, 89% `CONFLICT (content)`, нуль конфліктів в інтеграційному тесті. Посилання на [probe-a-results.md](../research/probe-a-results.md) і на тест.

---

## 6. Як це працює

Три кроки й схема `.kadence/` — без змін. Другорядний CTA: `Read the docs →`.

---

## 7. Ціна володіння

Таблиця без змін: 32 KB · 80 ms · 28 ms / 7 ms · 1.9 MB · MIT. Риск-редьюсери ті самі: нічого не залишає машину; вихід коштує одну команду; безкоштовно й без акаунта.

---

## 8. Для агентів

**H2**

> Files first. MCP optional.

> Every command speaks `--json`. Every response carries `schema: "kadence/v1"`. stdout is JSON and nothing else; warnings go to stderr. `init` writes a guide the AI agent finds on its own — no server to run, no token to issue, no network call to make.

```bash
kadence board --json
kadence task show KAD-1 --json        # full history and comments
KADENCE_SOURCE=agent kadence task move KAD-1 in_progress
```

> An MCP wrapper is coming as an optional package, so the core keeps its zero dependencies and still works with AI agents that have no MCP client at all.

**Формулювання свідоме.** Не «no MCP» як гасло — у 2026 це читається як «відстало». «Files first» — це факт і перевага: файли читає будь-який агент, включно з тим, у якого MCP немає.

---

## 9. Чесний статус

**Verified** — без змін.

**Not verified**
> That teams and their AI agents actually lose enough context to want this. The bet rests on reasoning and on the industry naming the problem out loud — not on our own users.

**On the roadmap, not shipped**
> `kadence context <task>` — the whole history of one piece of work, formatted for an AI agent's context window. `kadence decision` — record why, as its own event type. The optional MCP package. Today that history is reachable through `task show --json`, which is where the idea came from.

**Known limits** — без змін.

Далі — хук на розмову, той самий: «We have not talked to enough teams… No demo, no pitch: we ask, you talk.»

---

## 10. Міні-FAQ

1. **Is this another tracker? We use Jira.**
   > It does not replace Jira for the company. It keeps the layer Jira has no place for: what actually happened to a piece of work, in a form your AI agent can read. They live side by side.
2. **My AI agent already reads the repo. What does this add?**
   > The repo tells it what the code is. It does not tell it what was tried, what was rejected, what is blocked and why. That is the part people keep in their heads and in chat threads — and it is the part that disappears between sessions.
3. **What does it do to my repository?**
   > It creates `.kadence/` and appends files to it. It edits nothing, deletes nothing, and runs no git command on your behalf.
4. **Can anyone else see our work?**
   > No. There is no network code and no telemetry. This site counts anonymous page views without cookies; the CLI makes no requests at all.
5. **What if we change our mind?**
   > `rm -rf .kadence`. The events are plain JSON, so your history stays readable without kadence.

---

## 11. Підвал

Без змін: GitHub · npm · Docs · Changelog · Decisions (ADR) · MIT.

---

## Слова, яких на сторінці немає

`tracker` · `seamless` · `powerful` · `AI-powered` · `revolutionary` · `trusted by developers` · `no MCP` як гасло · порівняння з Jira й Linear у ролі заголовка · логотипи компаній, які нас не використовують.

## Що звірити перед публікацією

- [ ] Кожне число має тест або файл у `docs/research/`
- [ ] Жодна обіцянка не стосується команд, яких ще немає (`context`, `decision`, MCP — лише в «roadmap»)
- [ ] Один H1, `title` < 60, `description` < 155
- [ ] Демо перезнято після останньої зміни в `src/tui/`
- [ ] Термінальні блоки — текст, контраст ≥ 4.5:1 в обох темах
