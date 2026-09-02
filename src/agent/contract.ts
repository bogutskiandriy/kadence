/** Документ, який агент читає як звичайний файл — без MCP, мережі й токена. */
export const AGENT_README = `# FlowIt — для AI-агента

Задачі цього проєкту лежать тут як звичайні файли. Читай їх напряму або
через CLI — сервер не потрібен.

## Команди

    flowit task list --json      перелік задач
    flowit task show FLOW-42     одна задача з історією
    flowit task add "назва"      нова задача
    flowit task move FLOW-42 in_progress

## Контракт JSON

Кожна відповідь із \`--json\` має поле \`schema: "flowit/v1"\`. У stdout —
тільки JSON; попередження йдуть у stderr.

## Якщо працюєш як агент

Виставляй \`FLOWIT_SOURCE=agent\`, щоб події записувалися з твоїм авторством.
Без цього подія позначається як людська — ми не вгадуємо.

## Що не робити

Не редагуй файли в \`.flowit/events/\` руками: журнал доповнюється, а не
змінюється. Щоб виправити стан, додай нову подію через CLI.
`;

export const AGENTS_BEGIN = '<!-- flowit:begin -->';
export const AGENTS_END = '<!-- flowit:end -->';

/** Секція для AGENTS.md — коротка, бо подробиці лежать у .flowit/README.md. */
export const AGENTS_SECTION = `${AGENTS_BEGIN}
## Задачі проєкту — FlowIt

Задачі лежать у \`.flowit/\` як звичайні файли. Читай їх напряму або через CLI:

    flowit task list --json      перелік задач
    flowit task move FLOW-1 done змінити стан

Відповіді \`--json\` мають поле \`schema: "flowit/v1"\`; у stdout тільки JSON.
Працюючи як агент, виставляй \`FLOWIT_SOURCE=agent\`.

Подробиці: \`.flowit/README.md\`
${AGENTS_END}`;

/**
 * Вставляє або оновлює секцію FlowIt, лишаючи решту файлу недоторканою.
 *
 * Межі позначені коментарями, а не заголовком: заголовок людина може
 * перейменувати, і тоді повторний init створив би дублікат.
 */
export function upsertAgentsSection(existing: string | null): string {
  if (existing === null || existing.trim().length === 0) {
    return `${AGENTS_SECTION}\n`;
  }

  const start = existing.indexOf(AGENTS_BEGIN);
  const end = existing.indexOf(AGENTS_END);

  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start);
    const after = existing.slice(end + AGENTS_END.length);
    return `${before}${AGENTS_SECTION}${after}`;
  }

  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${AGENTS_SECTION}\n`;
}
