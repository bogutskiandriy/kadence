# Скіли проєкту

## Як Claude Code знаходить скіли

Тільки за шляхом `.claude/skills/<skill-name>/SKILL.md`. **Один рівень вкладеності.**
Папка `.claude/skills/research/market-sizing/SKILL.md` — **не** буде підхоплена.

Тому категоризація йде через префікс імені папки.

## Конвенція іменування

| Префікс | Фаза | Приклади |
|---|---|---|
| `research-` | 01 — ресьорч | `research-market-sizing`, `research-competitor-teardown`, `research-user-interview` |
| `product-` | 02 — продукт | `product-prd`, `product-jtbd`, `product-roadmap` |
| `design-` | 03 — дизайн | `design-ux-flow`, `design-system` |
| `eng-` | 04 — інженерія | `eng-adr`, `eng-api-design`, `eng-review` |
| `gtm-` | 05 — go-to-market | `gtm-positioning`, `gtm-pricing` |
| `ops-` | наскрізне | `ops-skill-creator` |

Імена — `kebab-case`, латиницею.

## Анатомія скіла

```
.claude/skills/research-market-sizing/
├── SKILL.md          # обов'язковий; frontmatter + інструкції
├── references/       # довідкові матеріали, які читаються за потреби
├── scripts/          # виконувані утиліти скіла
└── assets/           # шаблони, приклади вихідних артефактів
```

`SKILL.md` має починатися з frontmatter:

```yaml
---
name: research-market-sizing
description: Коли викликати цей скіл — конкретно, з тригерними формулюваннями.
---
```

Поле `description` — єдине, за чим модель вирішує, чи брати скіл. Пиши його як «коли застосовувати», а не «що це таке».

Шаблон: `.claude/templates/SKILL.template.md`.

## Додавання скіла із зовнішнього репозиторію

1. Клонувати репо-джерело в тимчасову теку поза `.claude/`.
2. Переглянути його і відібрати потрібні скіли — весь репозиторій цілком не копіюємо.
3. Скопіювати в `.claude/skills/` з перейменуванням за конвенцією префіксів.
4. Синхронізувати поле `name:` у frontmatter з іменем папки — інакше Claude Code
   візьме ім'я папки, а тіло скіла посилатиметься на старе.
5. Полагодити крос-посилання: згадки старих імен скілів у тексті замінити на нові.
6. Дописати у frontmatter блок `source:` — звідки скіл і з якого коміту.
7. Оновити `INDEX.md`.
