import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { defineTool } from '@deepseek-ai/dsh-tools';
import {
  compilePageCatalog,
  elementDirectory,
  pageActionEffect,
  resolvePageAction,
  validatePageCatalog,
  type PageActionParam,
  type PageActionScalar,
  type PageCatalog,
  type PageElementEffect,
} from './catalog.ts';
import type { PageBridge } from './host.ts';
import { createDraftLayer, type DraftLayer } from './draft.ts';

export type PageToolConsumer = {
  validate?: (args: Record<string, unknown>, sessionId: string) => unknown;

  stateSnapshot?: (sessionId: string) => { sequence: number; state: unknown } | undefined;

  waitMs?: number;

  refreshWaitMs?: number;

  staleMs?: number;

  allowSurfaces?: readonly string[];

  dataActionSurfaces?: readonly string[];
  allowsDataAction?: (surface: string, sessionId: string) => boolean;

  denyGlobalToolsInWorkbench?: readonly string[];

  allowsEffect?: (surface: string, effect: PageElementEffect, sessionId: string) => boolean;

  draftLayer?: DraftLayer;
};

function parsePageContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return { applied: false, error: 'INVALID_PAGE_RECEIPT' };
  }
}

function scalarSchema(value: PageActionScalar) {
  const description = value.description === undefined ? {} : { description: value.description };
  switch (value.type) {
    case 'string':
      return {
        type: 'string' as const,
        ...description,
        ...(value.enum === undefined ? {} : { enum: [...value.enum] }),
      };
    case 'integer':
      return { type: 'integer' as const, ...description };
    case 'number':
      return { type: 'number' as const, ...description };
    case 'boolean':
      return { type: 'boolean' as const, ...description };
  }
}

function parameterSchema(parameter: { name: string } & PageActionParam) {
  const shared = {
    ...(parameter.required ? { required: true as const } : {}),
    ...(parameter.description === undefined ? {} : { description: parameter.description }),
  };
  if (parameter.type === 'array')
    return {
      type: 'array' as const,
      ...shared,
      items: scalarSchema({
        type: parameter.items.type,
        ...(parameter.items.description === undefined
          ? {}
          : { description: parameter.items.description }),
      }),
    };
  if (parameter.type === 'object')
    return {
      type: 'object' as const,
      additionalProperties: false,
      ...shared,
      properties: Object.fromEntries(
        Object.entries(parameter.properties).map(([name, value]) => [name, scalarSchema(value)]),
      ),
    };
  return { ...scalarSchema(parameter), ...shared };
}

export function createPageToolRegistry(
  ctx: Context,
  bridge: PageBridge,
  consumer: PageToolConsumer = {},
) {
  const waitMs = consumer.waitMs ?? 4000;
  const refreshWaitMs = consumer.refreshWaitMs ?? 2000;
  const drafts = consumer.draftLayer ?? createDraftLayer();
  const registered = new Map<
    string,
    {
      key: string;
      at: number;
      dispose: () => void;
      restraint?: () => void;
      controller: AbortController;
      agent: Agent;
      surface: string;
      tool: string;
    }
  >();
  const restrictionFailed = new Set<string>();
  let closed = false;

  const restrictWorkbenchTools = (
    agent: { ctx: { tools: { restrict: (f: { deny: string[] }) => () => void } } },
    candidates: readonly string[],
  ): (() => void) | undefined => {
    const known = ctx.tools
      .schemas()
      .map((tool) => tool.name)
      .filter((name) => name !== 'run_code');
    const target = new Set<string>();
    for (const name of candidates) if (known.includes(name)) target.add(name);

    for (const name of known) if (/^mcp__browser/i.test(name)) target.add(name);
    if (target.size === 0) return undefined;
    try {
      return agent.ctx.tools.restrict({ deny: [...target] });
    } catch (error) {
      console.log(
        `[page-bridge] restrict failed: ${
          error instanceof Error ? error.message : String(error)
        }`.slice(0, 200),
      );
      return undefined;
    }
  };

  const skipped = new Set<string>();

  const staleMs = consumer.staleMs ?? 30_000;
  const sweep = setInterval(
    () => {
      const now = Date.now();
      for (const [sessionId, entry] of Array.from(registered))
        if (now - entry.at > staleMs) {
          dispose(sessionId);
        }
    },
    Math.min(staleMs, 10_000),
  );
  sweep.unref?.();

  const invoke = async (
    sessionId: string,
    catalog: PageCatalog,
    args: Record<string, unknown>,
    options: { dataAllowed: boolean; signal: AbortSignal },
  ): Promise<string> => {
    options.signal.throwIfAborted();
    const kind = typeof args.kind === 'string' ? args.kind : null;

    if (args.directory === true || kind === 'directory')
      return JSON.stringify({
        source: 'PAGE_BRIDGE',
        protocol: 'ag-ui-frontend-tool',
        authority: 'view-only',
        tool: { toolCallName: catalog.tool, toolCallId: null },
        directory: elementDirectory(catalog, {
          ...(typeof args.focus === 'string' ? { focus: args.focus } : {}),
          ...(args.values === true ? { values: true } : {}),
        }),
        note: '这是只读目录：没有下发任何操作，也不会改动这一屏。',
      });

    const refuse = (error: string, note: string) =>
      JSON.stringify({
        source: 'PAGE_BRIDGE',
        protocol: 'ag-ui-frontend-tool',
        authority: 'view-only',
        tool: { toolCallName: catalog.tool, toolCallId: null },
        kind,
        applied: false,
        error,
        note,
      });

    if (kind === null)
      return refuse(
        'PAGE_KIND_REQUIRED',
        '要改这一屏请传 kind=invoke/setValue/select/clear（并给 target/action/value）；只要元素目录就传 directory=true。',
      );

    const violation = resolvePageAction(catalog, args);
    if (violation) return refuse(violation, '页面没有开放这个元素/动作，命令没有下发。');
    const effect = pageActionEffect(catalog, args);
    if (kind === 'setValue' && effect !== 'view' && !options.dataAllowed)
      return refuse('DATA_ACTION_NOT_ALLOWED', '这个页面只允许改视图，不允许写字段。');

    const allowsEffect = consumer.allowsEffect ?? (() => effect === 'view' || effect === 'draft');
    if (!allowsEffect(catalog.surface, effect, sessionId))
      return refuse(
        'EFFECT_NOT_ALLOWED',
        effect === 'approve'
          ? '这个页面没有开放审批动作，命令没有下发。'
          : '这个页面没有开放提交动作，命令没有下发。',
      );

    const begun = drafts.begin({
      sessionId,
      surface: catalog.surface,
      kind: kind ?? '',
      targets: [
        ...(typeof args.target === 'string' ? [args.target] : []),
        ...(Array.isArray(args.targets)
          ? (args.targets as unknown[]).filter(
              (value): value is string => typeof value === 'string',
            )
          : []),
      ],
      effect,
      ...(typeof args[catalog.reasonField ?? 'reason'] === 'string'
        ? { reason: String(args[catalog.reasonField ?? 'reason']) }
        : {}),
    });
    if (!begun.ok) return refuse(begun.code, begun.reason);

    const validated =
      consumer.validate && catalog.elements === undefined
        ? consumer.validate(args, sessionId)
        : args;
    const before = consumer.stateSnapshot?.(sessionId)?.sequence ?? 0;
    options.signal.throwIfAborted();
    const toolCallId = bridge.enqueue(sessionId, {
      toolCallName: catalog.tool,
      args: validated,
    });
    let message;
    try {
      message = await bridge.wait(sessionId, toolCallId, waitMs, 100, options.signal);
      options.signal.throwIfAborted();
    } catch (error) {
      bridge.cancel(sessionId, toolCallId);
      drafts.finish(begun.receiptId, { applied: false, error: 'PAGE_TOOL_CANCELLED' });
      throw error;
    }
    if (message === undefined) bridge.cancel(sessionId, toolCallId);
    let pageApplied = false;
    if (message && message.error === undefined) {
      try {
        const content = JSON.parse(message.content);
        pageApplied = content?.toolCallId === toolCallId && content?.applied === true;
      } catch {}
    }
    const applied = pageApplied;
    const pageError =
      message === undefined
        ? 'PAGE_TOOL_PENDING'
        : (message.error ?? (pageApplied ? undefined : 'PAGE_TOOL_NOT_APPLIED'));
    drafts.finish(begun.receiptId, {
      applied,
      ...(message === undefined
        ? { error: 'PAGE_TOOL_PENDING', timedOut: true }
        : pageError === undefined
          ? {}
          : { error: pageError }),
    });
    const receipt = drafts.receipts().find((entry) => entry.id === begun.receiptId);
    let snapshot = consumer.stateSnapshot?.(sessionId);
    if (applied && consumer.stateSnapshot) {
      const deadline = Date.now() + refreshWaitMs;
      while ((snapshot?.sequence ?? 0) <= before && Date.now() < deadline) {
        options.signal.throwIfAborted();
        await new Promise((resolve) => setTimeout(resolve, 100));
        options.signal.throwIfAborted();
        snapshot = consumer.stateSnapshot(sessionId);
      }
    }
    options.signal.throwIfAborted();
    const snapshotAfterApply = (snapshot?.sequence ?? 0) > before;
    return JSON.stringify({
      source: 'PAGE_BRIDGE',
      protocol: 'ag-ui-frontend-tool',
      authority: 'view-only',
      tool: { toolCallName: catalog.tool, toolCallId },
      kind,
      applied,
      pageSource: 'self-report',
      draft:
        receipt === undefined
          ? null
          : {
              id: receipt.id,
              outcome: receipt.outcome,
              ...(receipt.error === undefined ? {} : { error: receipt.error }),
            },
      snapshotAfterApply,
      ...(message === undefined
        ? {
            availability: 'pending',
            code: 'PAGE_TOOL_PENDING',
            reason:
              '页面还没执行这次改动（可能刚切走工作台或页面正在加载）。现在不能说页面已经改好了。',
          }
        : {}),
      ...(pageError ? { error: pageError } : {}),
      ...(applied && !snapshotAfterApply
        ? {
            availability: 'refreshing',
            code: 'PAGE_STATE_REFRESHING',
            reason:
              '页面已经应用了这次改动，但还没报回改动后的状态；下面附的是改动前的状态，不要用它判断改动结果。',
          }
        : {}),
      page: message === undefined ? null : parsePageContent(message.content),
      state: snapshot?.state ?? null,
      note: '只改了当前页面的显示范围，没有读取或改动任何业务数据，也不代表审批意见。',
    });
  };

  const dispose = (sessionId: string): void => {
    const existing = registered.get(sessionId);
    if (!existing) return;
    registered.delete(sessionId);
    existing.controller.abort(new Error('PAGE_TOOL_OWNER_RELEASED'));
    bridge.reset(sessionId);
    existing.dispose();
    existing.restraint?.();
  };

  return {
    declare(sessionId: string, rawCatalog: unknown): void {
      if (closed) throw Error('PAGE_TOOL_REGISTRY_CLOSED');
      if (rawCatalog === undefined) return;
      if (rawCatalog === null) {
        dispose(sessionId);
        return;
      }
      const catalog = validatePageCatalog(rawCatalog);

      if (consumer.allowSurfaces && !consumer.allowSurfaces.includes(catalog.surface)) {
        dispose(sessionId);
        return;
      }

      const dataAllowed =
        consumer.allowsDataAction?.(catalog.surface, sessionId) ??
        consumer.dataActionSurfaces?.includes(catalog.surface) === true;
      const actions = (catalog.actions ?? []).filter(
        (action) => action.scope !== 'data' || dataAllowed,
      );

      if (actions.length === 0 && (catalog.elements?.length ?? 0) === 0) {
        dispose(sessionId);
        return;
      }
      const effective: PageCatalog = {
        ...catalog,
        ...(actions.length === 0 ? {} : { actions }),
      };
      const key = JSON.stringify(effective);
      const existing = registered.get(sessionId);
      const agent = ctx.agents.get(sessionId as SessionId);

      if (!agent) {
        if (!skipped.has(sessionId)) {
          skipped.add(sessionId);
          console.log(`[page-bridge] declare skipped (no live agent) session=${sessionId}`);
        }
        return;
      }

      const sameOwner =
        existing?.agent === agent &&
        existing.surface === effective.surface &&
        existing.tool === effective.tool;
      if (sameOwner && existing.key === key) {
        existing.at = Date.now();
        return;
      }
      if (sameOwner) {
        existing.dispose();
        existing.restraint?.();
      } else dispose(sessionId);
      const controller = sameOwner ? existing.controller : new AbortController();
      const { description, parameters } = compilePageCatalog(effective);
      const disposeTool = agent.ctx.tools.register(
        defineTool({
          name: effective.tool,
          description,
          parameters: Object.fromEntries(
            parameters.map((parameter) => [parameter.name, parameterSchema(parameter)]),
          ),
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
            presentationMeta: () => ({
              source: 'PAGE_BRIDGE',
              authority: 'view-only',
            }),
          },
          timeoutMs: waitMs + 4000,
          isConcurrencySafe: () => false,
          presentCall: (args) => ({
            card: 'generic',
            title: `${effective.tool} · ${String(args.kind ?? '')}`,
            rawInput: args,
          }),
          execute: async (args, exec) => {
            if (exec.agent?.id !== sessionId) throw Error('PAGE_TOOL_SESSION_MISMATCH');
            return invoke(sessionId, effective, args, {
              dataAllowed,
              signal: AbortSignal.any([exec.signal, controller.signal]),
            });
          },
        }),
      );
      const restraint = consumer.denyGlobalToolsInWorkbench
        ? restrictWorkbenchTools(agent as never, consumer.denyGlobalToolsInWorkbench)
        : undefined;
      if (consumer.denyGlobalToolsInWorkbench && !restraint && !restrictionFailed.has(sessionId)) {
        restrictionFailed.add(sessionId);
        console.log(`[page-bridge] workbench tool restriction not applied session=${sessionId}`);
      }
      registered.set(sessionId, {
        key,
        at: Date.now(),
        dispose: disposeTool,
        controller,
        agent,
        surface: effective.surface,
        tool: effective.tool,
        ...(restraint === undefined ? {} : { restraint }),
      });
      skipped.delete(sessionId);
      console.log(
        `[page-bridge] registered tool=${effective.tool} session=${sessionId} source=self-report elements=${effective.elements?.length ?? 0} actions=${effective.actions?.length ?? 0} descLen=${description.length}`,
      );
    },

    dispose(sessionId: string): void {
      dispose(sessionId);
    },
    disposeAll(): void {
      for (const sessionId of Array.from(registered.keys())) dispose(sessionId);
    },

    shutdown(): void {
      closed = true;
      clearInterval(sweep);
      for (const sessionId of Array.from(registered.keys())) dispose(sessionId);
    },

    receipts: () => drafts.receipts(),
  };
}

export type PageToolRegistry = ReturnType<typeof createPageToolRegistry>;
