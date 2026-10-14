import type { Context } from '@deepseek-ai/cordis';
import { type AgentWorkbench } from './workbench.ts';
export declare const inject: string[];
declare const zh: {
    title: string;
    pages: string;
    conversation: string;
    failed: string;
    retry: string;
    empty: string;
    resources: string;
    start: string;
    useSkill: string;
    unavailable: string;
    workspaceSelect: string;
    workspaceCurrent: string;
    workspaceChosen: string;
    workspaceRequired: string;
    missing: string;
    resourcesFailed: string;
    selectionFailed: string;
    resourceWorking: string;
    resourcesRefresh: string;
    inventoryEntry: string;
    inventoryEntryHint: string;
    inventoryEntryFailed: string;
    pageConnect: string;
    pageNewChat: string;
    pageWorking: string;
    pageChanged: string;
    pageHint: string;
    pageWait: string;
    pageLogin: string;
    pageSessionUnavailable: string;
    pageStaticHint: string;
    pageCreating: string;
    pageInterpreter: string;
    pageIdentityFailed: string;
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        agentWorkbench: keyof typeof zh;
    }
}
/** Keep the official frame, workspace browser and Conversation. Only contribute public seats. */
export declare function apply(ctx: Context): void;
declare module '@deepseek-ai/cordis' {
    interface Context {
        agentWorkbench: AgentWorkbench;
    }
}
export type { AgentWorkbench, WorkbenchPage } from './workbench.ts';
declare module '@deepseek-ai/dsh-api-session-controller/client' {
    interface SessionReferenceSourceMap {
        agentResourceSelection: unknown;
    }
}
export type { WorkbenchFramePage } from './frame.ts';
export type { BusinessAccount } from './company/account.ts';
export type { NavigationView } from './client/desktop-navigation.tsx';
export { pluginPackageVersion } from './plugin-package-version.ts';
