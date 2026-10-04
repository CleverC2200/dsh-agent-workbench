# Agent 工作台

Workbench 在未修改的官方 DSH `4878cdabd87d4041bdaff61d04c966883b9fd07a` 上提供统一页面目录、原生页面入口、HTML 呈现与包内资源桥。官方 `ui-layout`、侧栏工作区、原生 Conversation、主题和字号保留各自归属。Workbench 不替换 root 或 layout，不创建业务登录状态；打开静态页面不会创建 Session、改写 preset 或发送模型请求。

## 页面接入

原生页面注册官方 `main` keyed slot，再登记标题元数据。`main` 的注册事实决定目录是否显示；`register` 只补充标题，不建立第二份安装或授权清单。

```ts
const disposePage = ctx.slots.register({ name: 'main', key: panelId }, Page)
const disposeTitle = ctx.agentWorkbench.register({ id: panelId, label: () => title })
await ctx.agentWorkbench.open(panelId)
// 卸载时释放 disposePage 和 disposeTitle。
```

现有 HTML 文档通过 `ctx.agentWorkbench.registerHtml({id, label, html})` 贡献。Workbench 负责 iframe、sandbox、主题投影与释放，不改变原 HTML 的交互和业务内容。包内 HTML 则由 Host `ctx.workbenchPages.registerHtml(roots)` 登记显式安装目录。它读取 `plugin.json` 的页面元数据、检查路径归属，并在被选用时读取 `index.html`；不读取提示词、Skill 或业务认证。返回原声明供能力拥有者检查 Consumer 等业务约定。

Host 公开认证 Fetch：

- `GET /api/agent-workbench/pages`：页面元数据，不返回正文或本地路径。
- `GET /api/agent-workbench/html?id=<pageId>&page=<view>`：安全 HTML 呈现；响应禁止缓存和外部网络。
- `GET /api/agent-workbench/theme.css`：插件共享视觉资源。
- `GET /api/agent-workbench/config`：绝对工作区路径，供明确资源／会话动作使用。

页面可见和资源存在均不授予 GEA Consumer 权限。受控业务桥及资源进入原生会话是独立动作，由 Manage/GEA 接线；静态呈现不等待它们。宿主持久会话和浏览器中的旧数据不清空、不迁移、不解析为新的运行时兼容层。

## 官方输入与构建

`cordis.patch.yml` 只插入本插件，保持官方 `ui-layout` 启用。本隔离项目的 `tsconfig.official.json` 将声明精确指向同组成组工作树旁的 `official-core` 标准产物，包括官方 Cordis `4.0.4`。旧 npm 锁仅用于准备开发工具，不能作为官方适配或运行的证据；最终外部 SDK 与宿主必须来自同一个官方输入。

```sh
npm ci --ignore-scripts --prefer-offline
npm run typecheck:official
DSH_TYPECHECK_PROJECT=tsconfig.official.json npm run build:core
node --test tests/official-entry.test.mjs tests/html-pages.test.mjs tests/html-sample-resource.test.mjs
```

`build:core` 构建 Host、Client、声明和现有 HTML 表格样板；默认 `build` 还构建仓库内库存资源，需要相应业务源码包的固定依赖。构建输出随本仓提交。测试和构建通过只是候选证明，同一官方 Web 上的实际显示与切换由集中联调记录。

## 视觉与已有资源

[theme/tokens.css](theme/tokens.css) 只由 Workbench 插件安装和释放。Manage、GEA 与 HTML 消费 `--workbench-*`，主题状态及字号来自官方 DSH；没有写 Core 源码、启动色或官方 token 的同步脚本。HTML 表格样板保留本地筛选、加载、空态、错误与恢复交互，独立显示不需要 GEA Session。

`business/inventory-fc` 与 `business/inventory-aqkc` 保留当前已迁移页面源码和包内资源。提示词／Skill 正文归 Manage，授权执行归 GEA，后续消费者迁移需接续原必要业务桥。静态页面通过不等于这些业务能力已验收。
