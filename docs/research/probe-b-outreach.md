# Outreach — message library

- **Date:** 2026-09-16 (rewritten the same day for direct outreach on LinkedIn and other networks)
- **Strategy:** [strategy.md §2](../product/strategy.md) — channels, limits, rules, ledger
- **For:** [interview-script.md](interview-script.md) · [probe-b-candidates.md](probe-b-candidates.md) · [probe-b-results.md](probe-b-results.md)
- **The owner sends every message by hand.** Nothing here is sent by a tool, an agent or an automation.

Counts are "total / without placeholders". Placeholders: `{name}` · `{topic}` (≤ 35 chars) · `{their phrase}` · `{hook}` · `{repo}` · `{issue}` · `{tool}` · `{url}` (their post) · `{link}` (booking link, verified before the first send) · `{me}`.

**LinkedIn note limit:** 200 characters on a free account, 300 on Premium; free accounts get only ~5–10 notes a month ([Taplio](https://taplio.com/blog/linkedin-connection-request-limit), [Dripify help](https://help.dripify.com/en/articles/8490987-limited-personalized-connection-request-notes-for-free-linkedin-accounts), checked 2026-09-16). Write to 200. Spend notes on public-pain people; invite everyone else without a note and send the DM after accept.

**Personalisation check, one line:** every message contains something only this person could receive — their quoted phrase, their post, issue or repo, their team or stack. If `{hook}` cannot be filled honestly, do not send.

---

## Stage 1 — the interview ask

No pitch. Disclose "I build tooling in this area". kadence is not named.

### Hooks — one per trigger, replaces `{hook}`

| Trigger | EN | UA |
|---|---|---|
| **T1** posted that the agent forgets / `CLAUDE.md` keeps growing | You wrote that "{their phrase}". That caught my eye, because it's the part of agent work I'm researching. (105/91) | Ви писали, що «{their phrase}». Мене зачепило, бо саме це я зараз досліджую. (76/62) |
| **T2** complained about Beads or Backlog.md | You wrote about moving off {tool} because "{their phrase}". I'm curious what the week before that decision looked like. (119/99) | Ви писали, що відмовилися від {tool}, бо «{their phrase}». Цікаво, яким був тиждень перед цим рішенням. (103/83) |
| **T3** maintains a repo with tasks in files | I noticed {repo} keeps its tasks in files inside the repository, and I'm curious how that has held up as more people and agents touch it. (137/131) | Побачив, що в {repo} задачі лежать файлами прямо в репозиторії. Цікаво, як це витримує, коли туди пишуть більше людей і агентів. (128/122) |
| **T4** tech lead of an agent-using team, no public complaint | I saw you lead a team that works with coding agents, and I'm curious how a new agent session starts on your team when someone else did yesterday's work. (152/152) | Бачу, ви ведете команду, яка працює з агентами. Цікаво, як у вас починається нова сесія агента, коли вчорашню роботу робив хтось інший. (135/135) |

For the hook test in [strategy §6](../product/strategy.md), the general pool rotates T4 with two alternatives of the same length: *B* "have two branches ever edited or numbered the same task?" and *C* "tried keeping tasks in the repo and stopped?". Record the hook in the ledger.

### LinkedIn — connection note, ≤ 200

**EN (163/150)**
> Hi {name}, your post on {topic} rang true. I build dev tooling in this area and I'm asking teams how they really work with coding agents. Nothing to sell. Connect?

**UA (166/153)**
> {name}, привіт! Ваш пост про {topic} влучив. Роблю інструменти для розробників у цій темі й розпитую команди, як вони працюють з агентами. Нічого не продаю. Додамося?

### LinkedIn — connection note, ≤ 300 (Premium)

**EN (252/239)**
> Hi {name}, your post on {topic} described something I keep hearing about. I build developer tooling in this area, and before I build more I'm talking to people whose teams use coding agents every day. Nothing to sell, no demo. Would be glad to connect.

### LinkedIn — DM after accept

**EN (369/351)**
> Thanks for connecting, {name}.
>
> {hook}
>
> I'd like to understand what that looks like day to day: the last time it happened, what you did next, what you use now. Would you have 30 minutes for a call? Not a demo. I build tooling in this area, which is exactly why I'd rather listen than show anything.
>
> Any slot that suits you: {link}. If it's not a fit, no need to reply.

**UA (337/319)**
> Дякую за контакт, {name}.
>
> {hook}
>
> Хочу зрозуміти, як це виглядає в роботі: коли це сталося востаннє, що ви зробили далі, чим користуєтеся зараз. Знайдете 30 хвилин на розмову? Це не демо. Я роблю інструменти в цій темі — саме тому хочу послухати, а не показувати.
>
> Будь-який зручний слот: {link}. Якщо не на часі — можна не відповідати.

### LinkedIn — InMail or Open Profile

**Subject (48/41):** `Your post on {topic}: 30 min about how you work?`
Body: the DM above without "Thanks for connecting", with "Thanks for writing it up publicly." before the sign-off `{me}`.

### X DM (205/181)

Only if their DMs are open or they follow back; otherwise reply publicly first.
> Hi {name}, your post on {topic} ({url}) matched what I keep hearing. I build dev tooling in this area and I'm doing 30-min calls on how teams actually handle it. No demo, nothing to sell. Up for it? {link}

### Reddit / Discord / forum DM (300/275)

Only if they posted about the problem publicly **and** the community's rules allow DMs — most do not. Never in the thread.
> Hi {name}, about your comment in {place} on {topic} ({url}). I build developer tooling in this area and I'm talking to people who've hit this before I build more. Would you do a 30-minute call about the last time it happened? No demo, no product link. If not, no worries, and thanks for the write-up.

### Email to an issue author or maintainer

**Only to an address the person published on their own site** — GitHub's Acceptable Use Policy §7 forbids unsolicited email using information taken from GitHub.

**Subject (59/46):** `Your {repo} issue about {topic}: 30 min about how you work?`
> Hi {name},
>
> I read your issue {issue}: "{their phrase}". I'm a developer building tooling for teams that work with coding agents, and before I build further I want to understand how people handle this day to day.
>
> Would you have 30 minutes to talk about what happened, what you did next and what you use now? Not a demo; I won't show anything.
>
> Any slot: {link}. If not, no reply needed, and thanks for writing the issue so clearly.
>
> {me}

For a maintainer with no issue, open with hook T3 instead of the issue line. For `rvdbreemen` (adr-kit), add: "I also noticed adr-kit — I'd be especially curious where decisions end up living on your projects."

### Telegram / DOU DM (UA, 320/295)

> Привіт, {name}! Побачив ваш {post} про {topic}. Я розробник, роблю інструменти для команд, які працюють з AI-агентами, і зараз розпитую людей, як це влаштовано насправді. Нічого не продаю й не показую.
>
> Знайдете 30 хвилин розповісти, коли це сталося востаннє і що ви зробили далі? Слот: {link}. Якщо ні — жодних проблем.

### DOU / Telegram research post (UA, channel O5)

Once on DOU, the same text in one Telegram channel about AI for developers. No product link.

> **Шукаю 5–7 розробників, які щодня працюють з AI-агентами в команді — на 30 хвилин розмови**
>
> Я розробник, роблю інструменти для команд, що працюють з Claude Code / Cursor / Codex. Перш ніж будувати далі, хочу зрозуміти, як це влаштовано в реальних командах — зокрема що працює погано.
>
> Нічого не продаю і нічого не показуватиму. Це розмова про ваш досвід: як ви починаєте нову сесію з агентом, що він забуває, де у вас живуть рішення команди.
>
> Кого шукаю: команда від 3 людей; хоча б двоє щодня працюють з агентом; стек будь-який.
>
> Формат: 30 хвилин, Google Meet або Zoom. Після розмови поділюся анонімізованими висновками з усіма учасниками.
>
> Записатися: {link} — або напишіть у коментарях чи в особисті.

If asked in comments «що за інструмент?»: «Розкажу після розмови, якщо буде цікаво — зараз мені важливо не підштовхувати відповіді».

### LinkedIn / X public post (EN, once, pinned for a week)

> I'm talking to developers whose teams use coding agents daily (Claude Code, Cursor, Codex) — 30 minutes about how you actually work: how a new session starts, what the agent doesn't know that the team does, where decisions end up.
>
> Not a demo, nothing to sell. Teams of 3+ especially.
>
> {link} — or reply here.

---

## Replies

| Reply | Response |
|---|---|
| **Yes** | "Great, thank you. Pick any slot here: {link}. It's 30 minutes, just a conversation." (83/77) |
| **"What's the tool?"** | EN: "Fair question. I'll tell you everything after the call if you're curious; I just don't want to steer your answers before I've heard how you actually work. If that's a deal-breaker, happy to explain now." · UA: «Чесне питання. Розповім усе після розмови, якщо буде цікаво, — зараз не хочу підштовхувати відповіді. Якщо для вас це принципово, поясню одразу.» — If they insist: give the one-sentence description from Stage 2, and treat them as a pilot lead, not one of the interviews |
| **"Not now"** | "Understood, thanks for replying. If it becomes relevant later, the link stays open: {link}." (91/85) → `declined`, never contacted again |
| **Silence, cold contact** | nothing. `no reply` after 7 days |
| **Silence, warm or 2nd-degree** *(pending owner decision, strategy §7)* | one bump after 7 days — EN: "Hi {name}, bumping this once in case it got buried. Totally fine if it's not a fit." · UA: «{name}, піднімаю одним повідомленням, раптом загубилося. Якщо не на часі — все гаразд.» Then nothing, whatever happens |

**Booking confirmation:** "Thanks, {name} — booked for {date time, their time zone}. It's 30 minutes, just a conversation. If anything changes, reschedule from the same link."
**Reminder, the day before:** "Hi {name}, a quick reminder about our 30-minute chat tomorrow at {time}. Link: {meeting link}."
**Thank-you, same day:** "Thank you for the time today — {one specific thing they said} was the most useful thing I've heard on this. I'll share the anonymised summary when the round is done."
**Referral, last minute of the call:** "One last thing: is there someone on your team, or elsewhere, who deals with this more than you do? An intro or just a name would help a lot." · UA: «І останнє: чи є хтось у вашій команді чи поза нею, хто стикається з цим більше за вас? Знайомство або просто ім'я дуже допоможе.»

---

## The interview — 30-minute English cut

The Ukrainian [script](interview-script.md) is 45 minutes and stays the reference; its thresholds apply to both.

| Min | Phase | Questions |
|---|---|---|
| 0–3 | Open | "Thanks. I'm researching how teams work with coding agents — nothing to sell, nothing to show. Mind if I take notes for myself only?" |
| 3–8 | Context | What are you working on, how big is the team? Which agent, how long, how many teammates use it? Where do tasks live — how did it end up there? *(if they switched)* **What happened that made you change?** |
| 8–23 | Stories | **The last time the agent proposed something you'd already tried and rejected** — what next, how long? · **The last time you had to find out why something was done a certain way** — where did you look, did you find it? · **Do you do anything to avoid this?** *(then silence)* |
| 23–27 | Contradictions | How many times this week? · What annoys you most about working with the agent? · Do you pay for or install anything for this today? |
| 27–30 | Close | What should I have asked? **Who else should I talk to?** |

Pool O1 shortcut: open Stories with their own words — "You wrote about {their phrase}. Walk me through what was happening that week."

---

## Stage 2 — the pilot offer

Only if on the call they **showed a workaround** and **asked about the product**, and the pilot rubric in [strategy §1](../product/strategy.md) scores ≥ 5.

`init` touches more than `.kadence/`: it also adds a section to `AGENTS.md` and `CLAUDE.md` and one `.gitignore` line (`src/cli/commands/init.ts`). The offer says so.

**EN (787/757)**
> Thanks again for today, {name}. You mentioned {their workaround} and asked what I'm building, so here it is.
>
> kadence is a free, MIT-licensed CLI that keeps a team's tasks and decisions as append-only files in the repo, so a teammate and a new agent session read the same history. No server, no account, no network. It only knows what gets written to it.
>
> If you'd like to try it: 20 minutes on a screen share, I run `kadence init` in your repo with you and note where it's confusing. It adds `.kadence/`, a short section in AGENTS.md and CLAUDE.md, and one .gitignore line, nothing committed. To leave: `rm -rf .kadence` and discard those edits.
>
> On day 14 I'll ask one question: has anyone besides you written to it? "No" is a useful answer too.
>
> Slot: {link}. If not, no reply needed.

**UA (760/730)**
> Ще раз дякую за розмову, {name}. Ви згадали {their workaround} і спитали, що я роблю, тож ось.
>
> kadence — безкоштовний CLI під MIT: задачі й рішення команди лежать файлами в репозиторії, які тільки дописуються. Колега й нова сесія агента читають ту саму історію. Без сервера, акаунта й мережі. Знає лише те, що в нього записали.
>
> Якщо захочете спробувати: 20 хвилин зі спільним екраном, я запускаю `kadence init` у вашому репо разом з вами й записую, де незрозуміло. Додасться `.kadence/`, коротка секція в AGENTS.md і CLAUDE.md та рядок у .gitignore, нічого не комітиться. Прибрати: `rm -rf .kadence` і відкотити ці правки.
>
> На 14-й день одне питання: чи писав туди хтось, крім вас? «Ні» — теж корисна відповідь.
>
> Слот: {link}. Якщо ні — можна не відповідати.

**Install with two people from the team in the room**, and end with a first handoff: the lead records one decision, a teammate's agent reads it through `prime` in its next session.

**Day-14 check-in**
- EN (182/176): "Hi {name}, it's day 14. One question: has anyone besides you written to `.kadence/`? `git log --format=%ae -- .kadence | sort -u` shows it. Yes, no or "we removed it" are all useful."
- UA (180/174): «{name}, привіт! Минуло 14 днів. Одне питання: чи писав у `.kadence/` хтось, крім вас? Показує `git log --format=%ae -- .kadence | sort -u`. «Так», «ні» чи «прибрали» — все корисно.»

**Pilot 0 — workplace team (UA)**
> Хочу спробувати свій інструмент для задач і рішень прямо в репозиторії на нашому проєкті — 20 хвилин разом, я поставлю, а ви скажете, де незрозуміло. Нічого не комітимо без вас. Додасться `.kadence/`, секція в AGENTS.md і CLAUDE.md та рядок у .gitignore — прибрати все це можна за хвилину. Через два тижні подивимося, чи хтось, крім мене, туди щось записав. Коли зручно?

---

## Stage 3 — after the article

**Sharing the article with someone who discussed the topic**
- EN (283/240): "Hi {name}, a while back you wrote about {topic}. I've since published what I measured on that: {article link}. It includes where the numbers don't support the idea. I'd value your pushback on one thing: does {specific claim} match what you've seen? No need to star or share anything."
- UA (263/220): «{name}, привіт! Ви колись писали про {topic}. Я опублікував, що виміряв на цю тему: {article link}. Там є й місця, де цифри ідею не підтримують. Буду вдячний за заперечення в одному: чи збігається {specific claim} з тим, що бачили ви? Зірки й репости не потрібні.»

`{specific claim}` example: "15% of file-tracker repos had task-file conflicts".

**Teammate nudge — the pilot lead sends it, not us**
- EN (331/325): "Hey, I've set up kadence in {repo} for a two-week try. Tasks and "why we chose X" notes live as files in `.kadence/`, and AGENTS.md/CLAUDE.md point the agents at them. Next time you pick up a task, try `kadence task claim`, or record a choice with `kadence decision add --why`. If it gets in your way, tell me and I'll take it out."
- UA (308/302): «Привіт! Я поставив kadence у {repo}, пробуємо два тижні. Задачі й нотатки «чому обрали X» лежать файлами в `.kadence/`, а AGENTS.md/CLAUDE.md відсилають туди агентів. Коли берете задачу — спробуйте `kadence task claim` або запишіть рішення через `kadence decision add --why`. Якщо заважає — скажіть, приберу.»

Record whether it was sent: a second author who was *asked* is not "without being asked", and the North Star check-in says which.

---

## Every message above

- No speed claims. No "used by". No "drift from reality".
- Stage 1 uses the person's words only; never "context loss" or "journal" first.
- The product is named from Stage 2 on, or when they ask.
- 30 minutes for an interview, 20 for an install.
