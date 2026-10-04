import type { Context } from "@deepseek-ai/cordis";
import { type AgentWorkbench } from "./workbench.ts";
export declare const inject: string[];
declare const zh: {
    title: string;
    pages: string;
    conversation: string;
    failed: string;
    retry: string;
    empty: string;
};
declare module "@deepseek-ai/dsh-client-ui-slots" {
    interface LocaleNamespaceMap {
        agentWorkbench: keyof typeof zh;
    }
}
/** Keep the official frame, workspace browser and Conversation. Only contribute public seats. */
export declare function apply(ctx: Context): void;
declare module "@deepseek-ai/cordis" {
    interface Context {
        agentWorkbench: AgentWorkbench;
    }
}
export type { AgentWorkbench, WorkbenchPage } from "./workbench.ts";
