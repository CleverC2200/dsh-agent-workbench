import type { Context } from "@deepseek-ai/cordis";
export declare const inject: string[];
/** The workspace directory used for new business Sessions. */
export interface Config {
    cwd: string;
}
/** Publish configuration through the normal authenticated DSH connection. */
export declare function apply(ctx: Context, config: Config): void;
