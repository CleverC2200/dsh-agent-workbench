import { type AgUiEvent, type AgUiToolMessage } from "../page-interaction/page-bridge/protocol.ts";
export type PageBridgeOptions = {
    /** 命令在页面取走前的最长存活时间。 */
    ttlMs?: number;
    /** 单会话最多挂起多少条调用。 */
    maxQueued?: number;
    /** 便于测试注入时钟。 */
    now?: () => number;
    /** 便于测试注入 id 生成。 */
    id?: () => string;
};
export type PageBridge = {
    enqueue(sessionId: string, input: {
        toolCallName: string;
        args: unknown;
    }): string;
    pull(sessionId: string, toolMessages: unknown): AgUiEvent[];
    take(sessionId: string, toolCallId: string): AgUiToolMessage | undefined;
    /** 取消尚未完成的调用；迟到的页面回执不会再进入宿主结果队列。 */
    cancel(sessionId: string, toolCallId: string): void;
    wait(sessionId: string, toolCallId: string, waitMs: number, pollMs?: number, signal?: AbortSignal): Promise<AgUiToolMessage | undefined>;
    reset(sessionId: string): void;
    /** 身份或部署整体变化时清空所有会话。 */
    resetAll(): void;
};
/** 建一个页面桥；每个宿主进程一个实例即可。 */
export declare function createPageBridge(options?: PageBridgeOptions): PageBridge;
