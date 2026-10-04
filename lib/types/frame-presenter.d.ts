import type { Context } from "@deepseek-ai/cordis";
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import { type NativeResourceSelection } from "./resource-selection.ts";
import type { WorkbenchFramePage } from "./frame.ts";
declare module "@deepseek-ai/dsh-client-ui-slots" {
    interface SlotFactoryMap {
        "agent-workbench.document": {
            scope: "root";
            props: {
                page: WorkbenchFramePage;
            };
            children: {
                "agent-workbench.conversation": {
                    kind: "single";
                    scope: "session";
                };
            };
        };
    }
    interface SlotMap {
        "agent-workbench.conversation": {
            kind: "single";
            scope: "session";
            owner: {
                page: string;
            };
        };
    }
}
/** The single native/HTML presentation module. Host Session references are explicitly borrowed. */
export type FrameCopyKey = "pageConnect" | "pageNewChat" | "pageWorking" | "pageChanged" | "pageHint" | "pageWait" | "pageLogin" | "pageSessionUnavailable";
export declare function mountFramePresentation(ctx: Context, resources: () => NativeResourceSelection | undefined, t: (key: FrameCopyKey) => string, showHistory?: (page?: MainPanelId) => void): (page: MainPanelId, sessionId: SessionId, signal: AbortSignal) => Promise<void>;
