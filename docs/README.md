# Документація kadence

Порядок читання — від «чи варто це робити» до «як це зробити».

**Починати з [product/strategy.md](product/strategy.md).** Де документ нижче
розходиться зі стратегією, правильна стратегія. Позначка **Замінено** означає:
документ лишається як історія, але рішень із нього більше не беремо.

## 1. Продуктова основа

| Документ | Що всередині |
|---|---|
| [product/strategy.md](product/strategy.md) | **Єдина стратегія (2026-09-16).** ICP, outreach-first мотив, канали з лімітами платформ, SMART-цілі по фазах до 2027-01-18, гейти з датами, тижневий ритм і scorecard, pre-mortem. Замінює GTM, positioning, roadmap, north-star, lean canvas, prioritization, discovery. Англійською |
| [PRD.md](PRD.md) | **v2, 2026-09-16.** Що продукт має робити, для кого і як зрозуміти, що зроблено; покриває 0.4.1 і невипущене. Де розходиться зі strategy.md — стратегія правильна. Англійською |
| [product/roadmap-to-1.0.md](product/roadmap-to-1.0.md) | **Дорога до 1.0.** Сім гейтів для `1.0.0`, екосистема, гроші. Стратегія на нього посилається й не замінює. Англійською |
| [product/feature-adoption-2026-09.md](product/feature-adoption-2026-09.md) | **Що беремо в сусідів і як.** Вердикт по кожній фічі Beads і Backlog.md, «по-нашому» через події, три експерименти замість трьох «ні». Англійською |
| [product/positioning.md](product/positioning.md) | **Замінено [strategy.md](product/strategy.md).** Формулювання за Moore. Категорія — не «трекер» |
| [product/positioning-review-2026-09.md](product/positioning-review-2026-09.md) | Перегляд 2026-09-04: чому ставка змістилася з аналітики спринтів на спільний контекст |
| [product/lean-canvas.md](product/lean-canvas.md) | **Замінено [strategy.md](product/strategy.md).** Бізнес-модель. Несправедливої переваги немає — і це записано прямо |
| [product/north-star.md](product/north-star.md) | **Замінено [strategy.md](product/strategy.md)** (сама метрика перенесена туди без змін). Метрика фази валідації. Не зірки |
| [product/roadmap.md](product/roadmap.md) | **Замінено [strategy.md](product/strategy.md).** Now/Next/Later |
| [product/discovery-2026-09.md](product/discovery-2026-09.md) | **Замінено [strategy.md](product/strategy.md).** Стан дискавері: що доведено, що ні, і що прибрати з роадмапу |
| [product/gtm-first-users.md](product/gtm-first-users.md) | **Замінено [strategy.md](product/strategy.md).** GTM: перші користувачі. ICP, beachhead, сім каналів із порогами, 12 тижнів по 4–8 годин. Англійською |
| [product/landing-copy.md](product/landing-copy.md) | Копія лендінга, 2026-09-04. Писалася на 0.1–0.2 — перелік можливостей застарів |

## 2. Дослідження

| Документ | Що всередині |
|---|---|
| [research/competitive-snapshot.md](research/competitive-snapshot.md) | Категорія зайнята: git-bug 10k, Backlog.md 6.6k. Знімок часів 0.1–0.2 |
| [research/assumptions-map.md](research/assumptions-map.md) | 14 припущень, 10 у зоні «тестувати негайно». Оновлений рейтинг ризиків — у [strategy.md §6](product/strategy.md) |
| [research/jtbd.md](research/jtbd.md) | Роботи, болі, здобутки з мітками доказовості |
| [research/value-proposition-canvas.md](research/value-proposition-canvas.md) | Fit не досягнутий, і показано чому |
| [research/feature-gap.md](research/feature-gap.md) | Прогалини проти Jira, ClickUp, Linear, Notion і Planner, 2026-09-03 |
| [research/landing-page-research.md](research/landing-page-research.md) | Структура лендінга й меседжі, 2026-09-03. Рішення про заголовок «аналітика» відтоді змінене |
| [product/product-icp-fit-2026-09.md](product/product-icp-fit-2026-09.md) | **Продукт × ICP.** Які 16 із ~60 можливостей потрібні тімліду; перший запуск досі говорить мовою спринт-трекера; п'ять рекомендацій для 0.5 «релізу другого автора». Англійською |

## 3. Перевірка

| Документ | Що всередині |
|---|---|
| [research/probe-a-results.md](research/probe-a-results.md) | **✅ Виконано.** 8 396 злиттів зі 130 репозиторіїв. 15.4% — неоднозначно |
| [research/pol-probe.md](research/pol-probe.md) | Дизайн probe. A, C і D виконано; **B — ні** |
| [research/interview-script.md](research/interview-script.md) | **Probe B, переписано 2026-09-08.** Головне питання — втрата контексту між сесіями агента, не конфлікти |
| [research/probe-b-outreach.md](research/probe-b-outreach.md) | **Probe B: бібліотека повідомлень**, 2026-09-16. Усі тексти для LinkedIn, X, email, Telegram/DOU, EN і UA; правила персоналізації. Надсилає лише власник, вручну. Англійською |
| [research/probe-b-candidates.md](research/probe-b-candidates.md) | **Probe B: перший пул кандидатів**, 2026-09-16. Називає реальних людей — перед публікацією вирішити, чи цьому файлу місце в git ([strategy.md §7](product/strategy.md)). Англійською |
| [research/probe-b-results.md](research/probe-b-results.md) | **Probe B: результати. Порожньо — розмов ще не було.** Шаблон, у який лягають нотатки. Англійською |
| [research/context-handoff-2026-09.md](research/context-handoff-2026-09.md) | Як прийнято передавати контекст AI, як це робимо ми, і три умови дешевої координації між людьми |
| [research/decision-capture-2026-09.md](research/decision-capture-2026-09.md) | Чи існує біль під `kadence decision`. Біль описаний зовні; питання тепер про механізм, не про існування |
| [research/probe-d-docs-linkage.md](research/probe-d-docs-linkage.md) | **✅ Виконано.** Зв'язок документа із задачею економить не пошук, а відсіювання: 34× на п'яти випадках |
| [research/reports-discovery-2026-09.md](research/reports-discovery-2026-09.md) | **Звіти.** Що пропонують Jira, PMI Agile, Kanban Guide, GitHub Projects; що з цього виводиться з журналу. Англійською |
| [research/branch-context-2026-09.md](research/branch-context-2026-09.md) | **✅ Виконано.** `--branch` — не `--search` під іншою назвою: приналежність живе в історії git, а не в тексті. Звуження від 3.2× до 20.8× на розмірах борду з Probe A. Англійською |
| [research/probe-c-agent-cost.md](research/probe-c-agent-cost.md) | **✅ Виконано.** Відповідь про задачу — 948 байт незалежно від розміру проєкту (на 0.2.1; на 0.4 — 982); журнал росте до 528 КБ. Спростував наш власний аргумент про MCP |
| [research/agent-readability-2026-09.md](research/agent-readability-2026-09.md) | **Читати перед зміною агентського контракту.** Як агенти читають репозиторій. Знахідка «Claude Code не читає `AGENTS.md`» виправлена в 0.2.1: `init` пише і `AGENTS.md`, і `CLAUDE.md` |
| [research/ecosystem-and-monetization-2026-09.md](research/ecosystem-and-monetization-2026-09.md) | Докази для дороги до 1.0: Beads як головний конкурент, ринок памʼяті для агентів, ETH Zurich про контекстні файли, METR про швидкість, дистрибуція, моделі доходу |
| [research/discovery-verdict-2026-09.md](research/discovery-verdict-2026-09.md) | **Вердикт дискавері.** Продукт має сенс як один продукт і як три інші ні. Скарги користувачів Beads і Backlog.md з реакціями, нуль запитів на velocity, розмір сегмента знизу вгору |
| [research/tech-lead-feedback-2026-09-10.md](research/tech-lead-feedback-2026-09-10.md) | **Перший відгук ззовні, n=1.** Тех-лід погодився, що проблема є, назвав продукт «Jira, але в репо», і сказав, що дрейф — від уваги, а не від сховища. Формулювання в README звужено до «борд не може розійтися з журналом». Англійською |

## 4. Проєктування

| Документ | Що всередині |
|---|---|
| [design/state-machine.md](design/state-machine.md) | Стани задачі й спринту, 7 інваріантів, правила розв'язання конкурентних намірів |
| [design/user-flows.md](design/user-flows.md) | П'ять потоків: init, життєвий цикл, агент, злиття, закриття спринту |
| [design/edge-cases.md](design/edge-cases.md) | Сім груп межових випадків із текстами повідомлень |
| [design/brand-and-visual-direction.md](design/brand-and-visual-direction.md) | Візуальний напрям лендінга й логотипа, 2026-09-03 |
| [design/ui-spec.md](design/ui-spec.md) | UI-специфікація лендінга: сітка, компоненти. Сайт живе в окремому репозиторії ([ADR-008](decisions/008-where-the-site-lives.md)) |

## 5. Скоуп і реалізація

| Документ | Що всередині |
|---|---|
| [product/story-map.md](product/story-map.md) | Карта історій, переглянуто 2026-09-08, стан на 0.2.1 |
| [product/prioritization.md](product/prioritization.md) | **Замінено [strategy.md](product/strategy.md).** Value/Effort, переглянуто 2026-09-08 |
| [../SPEC.md](../SPEC.md) | Технічна специфікація, вісім модулів |
| [review-stage-2.md](review-stage-2.md) | Борг, залишений свідомо, з аргументами |
| [decisions/](decisions/) | Тринадцять ADR, усі підкріплені вимірами (001–008 українською, 009–013 англійською) |
| [decisions/010-decisions-as-events.md](decisions/010-decisions-as-events.md) | Чому заміщення — одна подія, чому `list` за замовчуванням ховає скасоване, і чому документи лише зв'язані |
| [decisions/011-claims-as-events.md](decisions/011-claims-as-events.md) | Чому claim — не лок, і чому другий претендент зберігається як `contested`, а не відхиляється. Англійською |
| [decisions/012-network-only-in-packages.md](decisions/012-network-only-in-packages.md) | Чому мережа живе в окремому пакеті й лише через `gh`, і чому публікація односпрямована. Англійською |
| [decisions/013-labels-as-deltas.md](decisions/013-labels-as-deltas.md) | Єдине поле, де «кожен намір збережено» було неправдою. Чому набір лейблів рухається дельтами, чому об'єднання при згортанні не підходить, і чому старі журнали досі читаються по-старому. Англійською |
| [decisions/009-the-agent-contract.md](decisions/009-the-agent-contract.md) | Контракт для агентів: дві точки входу, коди помилок, `kadence schema --json` |
| [decisions/007-what-goes-into-git.md](decisions/007-what-goes-into-git.md) | Що комітимо, а що ні. Читати перед додаванням нової теки |

## Стан на 2026-09-16

Опубліковано `kadence@0.4.1` (2026-09-13). У робочому дереві, ще не випущено:
`report burndown | velocity | workload`, `report --list`, `report <name> --html`,
`npm run reference`. Список змін — у [CHANGELOG.md](../CHANGELOG.md).

Технічна частина перевірена вимірами. Продуктова — ні. Probe A виконано:
конфлікти реальні, але рідкісні — одне злиття з двохсот, і 89% із них того типу,
який архітектура усуває. Тому безконфліктність — доказ, а не заголовок.

Ставка з 2026-09-04 — **спільний контекст** команди та її агентів. Velocity і
звіти є в продукті, але не в заголовку.

**[Probe B](research/probe-b-results.md) не проведено: нуль розмов, нуль пілотів,
нуль відомих зовнішніх користувачів.** Що з цим робимо і до яких дат —
[strategy.md](product/strategy.md): вердикт Probe B 2026-10-19, kill-clock
2027-01-18.
