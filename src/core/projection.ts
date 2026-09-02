import type { FlowEvent } from './event.js';

/**
 * Згортання журналу в стан.
 *
 * Стан не зберігається — він обчислюється щоразу з журналу. Тому функція
 * чиста: той самий набір подій завжди дає той самий результат, незалежно від
 * порядку, у якому файли трапилися на диску (інваріант I1).
 */

export type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'done'
  | 'cancelled';

export interface HistoryEntry {
  id: string;
  type: string;
  actor: string;
  ts: string;
  data: Record<string, unknown>;
}

export interface Task {
  /** ULID — стабільний ідентифікатор. */
  id: string;
  /** FLOW-N — похідний ярлик, присвоєний під час цього згортання. */
  label: string;
  title: string;
  status: TaskStatus;
  estimate: number | null;
  assignee: string | null;
  sprint: string | null;
  createdAt: string;
  updatedAt: string;
  /** Усі події про задачу, включно з тими, що програли при конфлікті. */
  history: HistoryEntry[];
}

export interface Sprint {
  id: string;
  name: string;
  status: 'planned' | 'active' | 'closed' | 'cancelled';
  /** Подія, що закрила спринт. Перша за ULID — first-write-wins. */
  closedBy: string | null;
  taskIds: string[];
}

export interface ProjectState {
  tasks: Task[];
  sprints: Sprint[];
  /** Події про сутності, яких ще немає — гілку могли не змерджити. */
  pending: FlowEvent[];
  /** Події, відхилені правилами: напр. дописування в закритий спринт. */
  rejected: FlowEvent[];
}

const TASK_STATUSES = new Set<string>([
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'cancelled',
]);

export function project(input: readonly FlowEvent[]): ProjectState {
  // Копія: функція не має права змінювати вхід.
  const events = [...input].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const tasks = new Map<string, Task>();
  const sprints = new Map<string, Sprint>();
  const rejected: FlowEvent[] = [];
  const deferred: FlowEvent[] = [];

  for (const e of events) {
    apply(e, tasks, sprints, rejected, deferred);
  }

  // Подія могла прибути раніше за сутність, якої стосується: гілку зі
  // створенням просто ще не змерджили. Повторюємо, доки хоч одна знаходить
  // адресата — кожен прохід або зменшує чергу, або зупиняє цикл.
  const hadDeferred = deferred.length > 0;
  let pending = deferred;
  while (pending.length > 0) {
    const stillPending: FlowEvent[] = [];
    for (const e of pending) {
      apply(e, tasks, sprints, rejected, stillPending);
    }
    if (stillPending.length === pending.length) {
      pending = stillPending;
      break; // жодна не застосувалася — далі не зрушить
    }
    pending = stillPending;
  }

  // Відкладені події лягли в історію поза чергою — відновлюємо порядок.
  if (hadDeferred) {
    for (const task of tasks.values()) {
      task.history.sort((a, b) => (a.id < b.id ? -1 : 1));
    }
  }

  // Номери присвоюються за порядком ULID створення — детерміновано, і тому
  // дві гілки, що незалежно створили задачі, після злиття отримають різні
  // номери без втручання людини (інваріант I7).
  const ordered = [...tasks.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  ordered.forEach((task, i) => {
    task.label = `FLOW-${i + 1}`;
  });

  return {
    tasks: ordered,
    sprints: [...sprints.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    pending,
    rejected,
  };
}

function apply(
  e: FlowEvent,
  tasks: Map<string, Task>,
  sprints: Map<string, Sprint>,
  rejected: FlowEvent[],
  deferred: FlowEvent[],
): boolean {
  const data = e.data ?? {};

  if (e.type === 'task.created') {
    if (!tasks.has(e.entity)) {
      tasks.set(e.entity, {
        id: e.entity,
        label: '',
        title: typeof data['title'] === 'string' ? data['title'] : '(без назви)',
        status: 'backlog',
        estimate: typeof data['estimate'] === 'number' ? data['estimate'] : null,
        assignee: null,
        sprint: null,
        createdAt: e.ts,
        updatedAt: e.ts,
        history: [],
      });
    }
    record(tasks.get(e.entity)!, e);
    return true;
  }

  if (e.type === 'sprint.created') {
    if (!sprints.has(e.entity)) {
      sprints.set(e.entity, {
        id: e.entity,
        name: typeof data['name'] === 'string' ? data['name'] : '(без назви)',
        status: 'planned',
        closedBy: null,
        taskIds: [],
      });
    }
    return true;
  }

  if (e.type.startsWith('sprint.')) {
    const sprint = sprints.get(e.entity);
    if (sprint === undefined) {
      deferred.push(e);
      return false;
    }

    if (e.type === 'sprint.started') {
      if (sprint.status === 'planned') sprint.status = 'active';
      return true;
    }

    if (e.type === 'sprint.closed') {
      // Єдиний перехід із first-write-wins: закриття фіксує факт, який міг
      // бути вже опублікований, тому пізніше закриття його не переписує (I5).
      if (sprint.closedBy === null) {
        sprint.status = 'closed';
        sprint.closedBy = e.id;
      } else {
        rejected.push(e);
      }
      return true;
    }

    if (e.type === 'sprint.cancelled') {
      if (sprint.status === 'planned') sprint.status = 'cancelled';
      else rejected.push(e);
      return true;
    }

    if (e.type === 'sprint.task_added') {
      // Дописування в закритий спринт відхиляється — інакше velocity
      // минулих спринтів «пливло» б заднім числом.
      if (sprint.status === 'closed') {
        rejected.push(e);
        return true;
      }
      const taskId = typeof data['task'] === 'string' ? data['task'] : null;
      if (taskId === null) return true;
      const task = tasks.get(taskId);
      if (task === undefined) {
        deferred.push(e);
        return false;
      }
      task.sprint = sprint.id;
      if (!sprint.taskIds.includes(taskId)) sprint.taskIds.push(taskId);
      record(task, e);
      return true;
    }
    return true;
  }

  // Решта — події про задачу.
  const task = tasks.get(e.entity);
  if (task === undefined) {
    deferred.push(e);
    return false;
  }

  switch (e.type) {
    case 'task.moved': {
      const to = data['to'];
      if (typeof to === 'string' && TASK_STATUSES.has(to)) task.status = to as TaskStatus;
      break;
    }
    case 'task.cancelled':
      task.status = 'cancelled';
      break;
    case 'task.reopened':
      task.status = 'in_progress';
      break;
    case 'task.assigned':
      task.assignee = typeof data['assignee'] === 'string' ? data['assignee'] : null;
      break;
    case 'task.updated':
      if (typeof data['title'] === 'string') task.title = data['title'];
      if (typeof data['estimate'] === 'number') task.estimate = data['estimate'];
      break;
    default:
      break; // task.commented та інші лишають слід лише в історії
  }

  record(task, e);
  return true;
}

/**
 * Події надходять уже впорядкованими за ULID, тому історія накопичується в
 * правильному порядку сама. Сортувати тут не можна: виклик на кожну подію
 * дає квадратичну складність — на 10 000 подій це коштувало ~80 мс з
 * бюджету у 200.
 *
 * Єдиний виняток — відкладені події, які застосовуються пізніше; для них
 * порядок відновлюється один раз наприкінці згортання.
 */
function record(task: Task, e: FlowEvent): void {
  task.history.push({ id: e.id, type: e.type, actor: e.actor, ts: e.ts, data: e.data ?? {} });
  if (e.ts > task.updatedAt) task.updatedAt = e.ts;
}
