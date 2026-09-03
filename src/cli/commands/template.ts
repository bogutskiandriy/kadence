import { append } from '../../core/store.js';
import { ulid } from '../../core/ulid.js';
import { resolveContext, isContext, loadState, type CommandResult } from './task.js';

/**
 * Task templates.
 *
 * Stored as events like everything else, so a template written on a branch
 * merges the same way tasks do — and a team shares them by pushing, not by
 * copying a config file around.
 */

/** Fields a template may carry. Anything else is a typo, not a custom field. */
const ALLOWED = ['description', 'type', 'priority', 'estimate', 'labels', 'assignee'] as const;

export function runTemplateSave(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string,
  fields: Record<string, unknown>,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, exitCode: 2, message: 'A template needs a name.' };
  }

  const kept: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (fields[key] !== undefined) kept[key] = fields[key];
  }
  if (Object.keys(kept).length === 0) {
    return {
      ok: false,
      exitCode: 2,
      message:
        'A template needs at least one field.\n' +
        '  sprintit template save bug --type bug --priority high --label triage',
    };
  }

  append(ctx.root, {
    id: ulid(),
    type: 'template.saved',
    // Templates are configuration, so they hang off the repository itself
    // rather than a task; the id doubles as the entity.
    entity: ulid(),
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { name: trimmed, fields: kept },
  });

  return {
    ok: true,
    exitCode: 0,
    message: `Template "${trimmed}" saved: ${Object.keys(kept).join(', ')}.\n  sprintit task add "title" --template ${trimmed}`,
    data: { schema: 'sprintit/v1', ok: true, template: { name: trimmed, fields: kept } },
  };
}

export function runTemplateList(cwd: string, env: NodeJS.ProcessEnv): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  if (state.templates.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      warnings,
      message: 'No templates yet.\n  sprintit template save bug --type bug --priority high',
      data: { schema: 'sprintit/v1', ok: true, templates: [] },
    };
  }

  return {
    ok: true,
    exitCode: 0,
    warnings,
    message: state.templates
      .map((t) => {
        const fields = Object.entries(t.fields)
          .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : String(v)}`)
          .join(' ');
        return `  ${t.name.padEnd(14)} ${fields}`;
      })
      .join('\n'),
    data: { schema: 'sprintit/v1', ok: true, templates: state.templates },
  };
}

export function runTemplateDelete(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string,
): CommandResult {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return ctx;

  const { state, warnings } = loadState(ctx.root, ctx.actor);
  if (!state.templates.some((t) => t.name === name)) {
    return { ok: false, exitCode: 1, message: `No template "${name}".\n  sprintit template list` };
  }

  append(ctx.root, {
    id: ulid(),
    type: 'template.deleted',
    entity: ulid(),
    actor: ctx.actor,
    ts: new Date().toISOString(),
    source: ctx.source,
    data: { name },
  });

  return { ok: true, exitCode: 0, warnings, message: `Template "${name}" deleted.` };
}

/** Looks up a template so `task add --template` can pre-fill its fields. */
export function findTemplate(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string,
): { fields: Record<string, unknown> } | { error: CommandResult } {
  const ctx = resolveContext(cwd, env);
  if (!isContext(ctx)) return { error: ctx };

  const { state } = loadState(ctx.root, ctx.actor);
  const template = state.templates.find((t) => t.name === name);
  if (template === undefined) {
    const known = state.templates.map((t) => t.name).join(', ');
    return {
      error: {
        ok: false,
        exitCode: 1,
        message:
          `No template "${name}".` +
          (known.length > 0 ? `\nAvailable: ${known}` : '\n  sprintit template save ...'),
      },
    };
  }
  return { fields: template.fields };
}
