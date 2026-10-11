/**
 * 把"页面自述的能力目录"变成模型可见的工具。
 *
 * 通用层：这里不认识任何具体页面/业务。它只做三件事：
 * 1) 按页面声明，为该会话注册/注销**agent 作用域**的工具（页面关掉，工具就消失）；
 * 2) 用目录生成工具说明与参数表（不再手写枚举和说明）；
 * 3) 把调用转成"前端工具调用"下发，并把页面的回填结果作为工具结果返回。
 *
 * 依赖 DSH 的能力：`agent.ctx.tools.register`（按 agent 作用域注册，返回 disposer）。
 */
import type { Context } from '@deepseek-ai/cordis';
import { type PageElementEffect } from './catalog.ts';
import type { PageBridge } from './host.ts';
import { type DraftLayer } from './draft.ts';
export type PageToolConsumer = {
    /** 业务侧语义校验/归一化：返回真正下发给页面的参数。 */
    validate?: (args: Record<string, unknown>, sessionId: string) => unknown;
    /** 业务侧的当前页面状态：桥用它判断"改动后的状态是否已经报回来"。 */
    stateSnapshot?: (sessionId: string) => {
        sequence: number;
        state: unknown;
    } | undefined;
    /** 单次调用等页面执行的时长。 */
    waitMs?: number;
    /** 应用成功后再等页面报回新状态的时长。 */
    refreshWaitMs?: number;
    /** 页面多久没再声明就认为已关闭。 */
    staleMs?: number;
    /**
     * 允许被对话改动的页面白名单（页面自述的 surface）。
     * 提供了白名单时，不在名单里的页面一律不注册工具（fail-closed）。
     */
    allowSurfaces?: readonly string[];
    /**
     * 哪些页面允许暴露"会改数据"的动作（页面自述的 surface）。
     * 默认空：只暴露改视图的动作；页面自己声明了 data 动作也不给模型。
     * 只对白名单页面逐页放开，避免"任何页面都能被改数据"。
     */
    dataActionSurfaces?: readonly string[];
    allowsDataAction?: (surface: string, sessionId: string) => boolean;
    /**
     * 工作台会话里要禁用的全局工具（例如浏览器/MCP 那批）。
     * 只作用于"页面声明过能力的那个 agent"，普通对话不受影响。
     */
    denyGlobalToolsInWorkbench?: readonly string[];
    /**
     * 这个页面允许被改到的最大影响等级（由能力契约决定）。
     * 契约只声明"改草稿"的页面，提交/审批类元素一律不下发。
     */
    allowsEffect?: (surface: string, effect: PageElementEffect, sessionId: string) => boolean;
    /** "改草稿"这一层的实现（限流/超时/回执/确认）；不传就按默认参数建一个。 */
    draftLayer?: DraftLayer;
};
/**
 * 建一个"页面工具注册表"。
 * 每个会话最多一个工具；目录变化时注销旧的、注册新的。
 */
export declare function createPageToolRegistry(ctx: Context, bridge: PageBridge, consumer?: PageToolConsumer): {
    /**
     * 应用一次页面声明。
     * - 不带声明（undefined）：保持现状（轮询不必每次都重复声明）；
     * - 显式声明为 null：页面已经没有可调用动作，注销该会话的工具。
     */
    declare(sessionId: string, rawCatalog: unknown): void;
    /** 会话结束或身份变化时清掉。 */
    dispose(sessionId: string): void;
    disposeAll(): void;
    /** End this owner, including its stale-entry timer. Identity resets use disposeAll instead. */
    shutdown(): void;
    /** 最近的"改草稿"回执，供诊断与验收复核。 */
    receipts: () => readonly import("./draft.ts").DraftReceipt[];
};
export type PageToolRegistry = ReturnType<typeof createPageToolRegistry>;
