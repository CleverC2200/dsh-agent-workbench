import type { Context } from '@deepseek-ai/cordis';
import { type WorkbenchPages } from './html-pages.ts';
export { pluginPackageVersion } from './plugin-package-version.ts';
export declare const inject: string[];
/** The workspace directory used for new business Sessions. */
/** 新业务 Session 使用的工作区目录；必须是绝对路径，避免部署环境中的相对路径歧义。 */
export interface Config {
    cwd?: string;
    /** All installed HTML package roots except the built-in table sample. Omit to use bundled roots. */
    htmlRoots?: readonly string[];
}
/** Publish configuration through the normal authenticated DSH connection. */
/** 通过 DSH 的标准认证连接发布配置；请求只返回配置，不写入业务数据，响应禁止缓存以避免跨用户复用。 */
export declare function apply(ctx: Context, config?: Config): Promise<void>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        workbenchPages: WorkbenchPages;
    }
}
export type { HtmlPackage, WorkbenchPages } from './html-pages.ts';
export type { PageBusinessGrant, BusinessPage, AuthorizeBusinessPage } from './page-runtime.ts';
