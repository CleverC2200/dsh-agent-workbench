/**
 * Global theme DOM applier: projects the resolved ThemeSnapshot onto the
 * document — `html { color-scheme }` for native UA chrome (scrollbars, form
 * controls), `body[data-ds-dark-theme]` for the token palette, the active
 * theme's alias-token overrides as inline CSS variables on body, the content
 * font-size axis (`--dsh-content-font-size`), and one presenter-owned
 * `meta[name="theme-color"]` for surrounding browser UI. Pure DOM writes, no
 * React involvement; the presenter only ever retracts what it wrote itself,
 * so foreign attributes, metadata, and inline styles survive.
 *
 * 中文：本文件把上游已经解析好的主题快照投影到全局 DOM：设置浏览器原生控件的
 * 明暗模式、body 的暗色标记、主题 token、正文字号和浏览器外框颜色。它不经过
 * React，并且销毁时只撤回自己写入的内容，避免破坏其他插件的样式和 meta 标签。
 */
import type { ThemeSnapshot } from "@deepseek-ai/dsh-client-ui-theme/client";

/** Body attribute selecting the dark base palette in the token stylesheets. 中文：token 样式表用这个 body 属性选择暗色基础色板。 */
export const DARK_ATTRIBUTE = "data-ds-dark-theme";

/** Body variable carrying the user's content font size in px. 中文：承载用户正文像素字号的 CSS 变量。 */
export const CONTENT_FONT_SIZE_VARIABLE = "--dsh-content-font-size";

/** Applies theme snapshots to the document; one instance per plugin fiber. 中文：把主题快照应用到 document；每个插件 fiber 只创建一个实例。 */
export class ThemePresenter {
  /** Token names this presenter wrote in the last apply (its retraction set). 中文：记录上次写入的 token 名，下一次应用或销毁时只撤回这些属性。 */
  private appliedTokens: string[] = [];
  /** The single metadata node this presenter inserts and removes. 中文：本实例独占创建并负责移除的 theme-color 元数据节点。 */
  private readonly themeColorMeta: HTMLMetaElement;

  /** Create the presenter-owned metadata node before the first snapshot arrives. 中文：在首个主题快照到来前创建归本实例所有的 meta 节点，但此时还不插入页面。 */
  constructor() {
    this.themeColorMeta = document.createElement("meta");
    this.themeColorMeta.name = "theme-color";
  }

  /**
   * Project a snapshot onto the document: set root `color-scheme` and the body
   * palette attribute from `active.colorScheme` (never the id — `system` is
   * resolved upstream), publish the content font-size axis, then replace the
   * previously applied token variables with `active.tokens`. Browser
   * theme-color metadata follows the computed body background after those
   * writes, so the rendered palette remains the color authority.
   * @param snapshot - resolved theme snapshot from ctx.theme.
   * 中文：将已解析的主题完整写入 DOM。先依据 active.colorScheme 设置原生控件和暗色标记，
   * 再发布字号并用本次 token 替换上次 token，最后读取实际 body 背景色更新浏览器外框颜色。
   * system 模式已在上游解析，因此这里永远以 colorScheme 而不是主题 id 为准。
   */
  apply(snapshot: ThemeSnapshot): void {
    const scheme = snapshot.active.colorScheme;
    document.documentElement.style.colorScheme = scheme;
    const body = document.body;
    if (scheme === "dark") body.setAttribute(DARK_ATTRIBUTE, "");
    else body.removeAttribute(DARK_ATTRIBUTE);
    body.style.setProperty(
      CONTENT_FONT_SIZE_VARIABLE,
      `${snapshot.fontSize}px`,
    );
    for (const name of this.appliedTokens) body.style.removeProperty(name);
    this.appliedTokens = [];
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      body.style.setProperty(name, value);
      this.appliedTokens.push(name);
    }
    this.themeColorMeta.content = getComputedStyle(body).backgroundColor;
    if (!this.themeColorMeta.isConnected)
      document.head.append(this.themeColorMeta);
  }

  /** Retract root color-scheme, the palette attribute, token variables, the font-size axis, and the owned metadata node. 中文：撤回本实例设置的根明暗模式、暗色标记、主题变量、字号和 meta 节点，恢复由其他层接管。 */
  dispose(): void {
    document.documentElement.style.removeProperty("color-scheme");
    const body = document.body;
    body.removeAttribute(DARK_ATTRIBUTE);
    body.style.removeProperty(CONTENT_FONT_SIZE_VARIABLE);
    for (const name of this.appliedTokens) body.style.removeProperty(name);
    this.appliedTokens = [];
    this.themeColorMeta.remove();
  }
}
