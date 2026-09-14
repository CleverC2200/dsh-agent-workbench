/** Layout replacement for unmodified DSH, with native conversation composition. */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import { type AgentWorkbench } from "./workbench.ts";
/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export declare const inject: string[];
/**
 * Client plugin body: provide ctx.layout, then one register() call — AppFrame
 * into 'root' with the four child-slot declarations, the layout store seat,
 * and the shared root instance supplying commands and the panel-info source.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
declare module "@deepseek-ai/cordis" {
    interface Context {
        agentWorkbench: AgentWorkbench;
    }
}
