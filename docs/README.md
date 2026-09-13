# Документація kadence

Порядок читання — від «чи варто це робити» до «як це зробити».

## 1. Продуктова основа

| Документ | Що всередині |
|---|---|
| [PRD.md](PRD.md) | Проблема, персони, рішення, метрики, скоуп. Головний документ |
| [product/positioning.md](product/positioning.md) | Формулювання за Moore. Категорія — не «трекер» |
| [product/lean-canvas.md](product/lean-canvas.md) | Бізнес-модель. Несправедливої переваги немає — і це записано прямо |
| [product/north-star.md](product/north-star.md) | Метрика фази валідації. Не зірки |
| [product/roadmap.md](product/roadmap.md) | **Now/Next/Later.** У Now один пункт, і це не фіча |
| [product/roadmap-to-1.0.md](product/roadmap-to-1.0.md) | **Дорога до 1.0.** Куди йдемо, сім гейтів для `1.0.0`, екосистема, гроші, чесна відповідь про прискорення. Англійською |
| [product/feature-adoption-2026-09.md](product/feature-adoption-2026-09.md) | **Що беремо в сусідів і як.** Вердикт по кожній фічі Beads і Backlog.md, «по-нашому» через події, три експерименти замість трьох «ні». Англійською |
| [product/discovery-2026-09.md](product/discovery-2026-09.md) | **Стан дискавері.** Що доведено, що ні, і що прибрати з роадмапу |
| [product/gtm-first-users.md](product/gtm-first-users.md) | **GTM: перші користувачі.** ICP, beachhead, мотив, сім каналів із порогами, меседжі за персонами, метрики без телеметрії, 12 тижнів по 4–8 годин. Англійською |

## 2. Дослідження

| Документ | Що всередині |
|---|---|
| [research/competitive-snapshot.md](research/competitive-snapshot.md) | **Читати першим.** Категорія зайнята: git-bug 10k, Backlog.md 6.6k |
| [research/assumptions-map.md](research/assumptions-map.md) | 14 припущень, 10 у зоні «тестувати негайно» |
| [research/jtbd.md](research/jtbd.md) | Роботи, болі, здобутки з мітками доказовості |
| [research/value-proposition-canvas.md](research/value-proposition-canvas.md) | Fit не досягнутий, і показано чому |

## 3. Перевірка — те, що треба зробити до коду

| Документ | Що всередині |
|---|---|
| [research/probe-a-results.md](research/probe-a-results.md) | **✅ Виконано.** 8 396 злиттів зі 130 репозиторіїв. 15.4% — неоднозначно |
| [research/pol-probe.md](research/pol-probe.md) | Дизайн трьох probe. A виконано, B і C — попереду |
| [research/interview-script.md](research/interview-script.md) | **Probe B, переписано 2026-09-08.** Головне питання — втрата контексту між сесіями агента, не конфлікти |
| [research/context-handoff-2026-09.md](research/context-handoff-2026-09.md) | Як прийнято передавати контекст AI, як це робимо ми, і три умови дешевої координації між людьми |
| [research/decision-capture-2026-09.md](research/decision-capture-2026-09.md) | Чи існує біль під `kadence decision`. Біль описаний зовні; питання тепер про механізм, не про існування |
| [research/probe-d-docs-linkage.md](research/probe-d-docs-linkage.md) | **✅ Виконано.** Зв'язок документа із задачею економить не пошук, а відсіювання: 34× на п'яти випадках |
| [research/reports-discovery-2026-09.md](research/reports-discovery-2026-09.md) | **Звіти.** Що пропонують Jira, PMI Agile, Kanban Guide, GitHub Projects; що з цього виводиться з журналу; дві передумови, знайдені вимірюванням — межа «почато» захардкоджена, а компакція недоступна користувачу. Англійською |
| [research/branch-context-2026-09.md](research/branch-context-2026-09.md) | **✅ Виконано.** `--branch` — не `--search` під іншою назвою: приналежність живе в історії git, а не в тексті. Звуження від 3.2× до 20.8× на розмірах борду з Probe A. Англійською |
| [research/probe-c-agent-cost.md](research/probe-c-agent-cost.md) | **✅ Виконано.** Відповідь про задачу — 948 байт незалежно від розміру проєкту; журнал росте до 528 КБ. Спростував наш власний аргумент про MCP |
| [research/agent-readability-2026-09.md](research/agent-readability-2026-09.md) | **Читати перед зміною агентського контракту.** Як агенти читають репозиторій. Claude Code не читає `AGENTS.md` — а `init` пише тільки його |
| [research/ecosystem-and-monetization-2026-09.md](research/ecosystem-and-monetization-2026-09.md) | Докази для дороги до 1.0: Beads як головний конкурент, ринок памʼяті для агентів, ETH Zurich про контекстні файли, METR про швидкість, дистрибуція, моделі доходу |
| [research/discovery-verdict-2026-09.md](research/discovery-verdict-2026-09.md) | **Вердикт дискавері.** Продукт має сенс як один продукт і як три інші ні. Скарги користувачів Beads і Backlog.md з реакціями, нуль запитів на velocity, розмір сегмента знизу вгору |
| [research/tech-lead-feedback-2026-09-10.md](research/tech-lead-feedback-2026-09-10.md) | **Перший відгук ззовні, n=1.** Тех-лід погодився, що проблема є, назвав продукт «Jira, але в репо», і сказав, що дрейф — від уваги, а не від сховища. Наше формулювання в README сильніше за те, що ми можемо довести. Англійською |

## 4. Проєктування

| Документ | Що всередині |
|---|---|
| [design/state-machine.md](design/state-machine.md) | Стани задачі й спринту, 7 інваріантів, правила розв'язання конкурентних намірів |
| [design/user-flows.md](design/user-flows.md) | П'ять потоків: init, життєвий цикл, агент, злиття, закриття спринту |
| [design/edge-cases.md](design/edge-cases.md) | Сім груп межових випадків із текстами повідомлень |

## 5. Скоуп і реалізація

| Документ | Що всередині |
|---|---|
| [product/story-map.md](product/story-map.md) | Карта історій, переглянуто 2026-09-08. Дві прогалини закрито, третя стала гострішою |
| [product/prioritization.md](product/prioritization.md) | Value/Effort, переглянуто 2026-09-08. Що відвантажено, що ні — і чому чотири найцінніші фічі 0.2.1 у плані були відсутні |
| [../SPEC.md](../SPEC.md) | Технічна специфікація, вісім модулів |
| [decisions/](decisions/) | Десять ADR, усі підкріплені вимірами |
| [decisions/010-decisions-as-events.md](decisions/010-decisions-as-events.md) | Чому заміщення — одна подія, чому `list` за замовчуванням ховає скасоване, і чому документи лише зв'язані |
| [decisions/011-claims-as-events.md](decisions/011-claims-as-events.md) | Чому claim — не лок, і чому другий претендент зберігається як `contested`, а не відхиляється. Англійською |
| [decisions/012-network-only-in-packages.md](decisions/012-network-only-in-packages.md) | Чому мережа живе в окремому пакеті й лише через `gh`, і чому публікація односпрямована. Англійською |
| [decisions/013-labels-as-deltas.md](decisions/013-labels-as-deltas.md) | Єдине поле, де «кожен намір збережено» було неправдою. Чому набір лейблів рухається дельтами, чому об'єднання при згортанні не підходить, і чому старі журнали досі читаються по-старому. Англійською |
| [decisions/009-the-agent-contract.md](decisions/009-the-agent-contract.md) | Контракт для агентів: дві точки входу, коди помилок, `kadence schema --json` |
| [decisions/007-what-goes-into-git.md](decisions/007-what-goes-into-git.md) | Що комітимо, а що ні. Читати перед додаванням нової теки |

## Стан на 2026-09-02

Технічна частина перевірена вимірами. Продуктова — ні: усі найризикованіші припущення стосуються цінності й не мають за собою доказів.

Probe A виконано: конфлікти реальні, але рідкісні — одне злиття з двохсот. 89% із них — саме того типу, який наша архітектура усуває. Probe знайшов дірку в моделі даних, її виправлено у SPEC.

Позиціонування переглянуто після probe: головний меседж — **аналітика спринту**, безконфліктність — доказ, а не обіцянка. Проєктування завершено: стани, потоки й межові випадки описані, і з них у SPEC додалося п'ять вимог, яких раніше не було.

**До коду лишається одне питання без відповіді — [Probe B](research/interview-script.md).** Уся ставка на velocity тримається на неперевіреному припущенні. Технічно ми готові починати M1; продуктово — ні.
