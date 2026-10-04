# Agent 工作台

Workbench 在未修改的官方 DSH `4878cdabd87d4041bdaff61d04c966883b9fd07a` 上提供公司品牌、账户投影、业务分组导航、欢迎区与公共工具栏，并承载原生页面、HTML 与包内资源桥。官方 `ui-layout`、工作区浏览器、设置、原生 Conversation、主题和字号保留各自归属。Workbench 不替换 root 或 layout，不创建业务登录状态；打开静态页面不会创建 Session、改写 preset 或发送模型请求。

## 页面接入

原生页面注册官方 `main` keyed slot，再登记标题元数据。`main` 的注册事实决定目录是否显示；`register` 只补充标题，不建立第二份安装或授权清单。

```ts
const disposePage = ctx.slots.register({ name: 'main', key: panelId }, Page)
const disposeTitle = ctx.agentWorkbench.register({ id: panelId, label: () => title })
await ctx.agentWorkbench.open(panelId)
// 卸载时释放 disposePage 和 disposeTitle。
```

原生业务文档通过 `ctx.agentWorkbench.registerFrame({id, label, src, kind: 'native', resourceId})` 贡献，由 Workbench 持有 frame、显式会话引用与呈现生命周期。包内 HTML 由 Workbench Host 配置 `htmlRoots` 登记；同组 profile 使用本候选快照中的 FC/AQKC 根，不指向旧用户目录。三个静态计划原型独立放在 `lib/static`，启动仅登记轻量声明，选页才读取原 HTML，不进入 GEA client bundle。它读取 `plugin.json` 的页面元数据、检查路径归属，并在被选用时读取 `index.html`；不读取提示词、Skill 或业务认证。`workbenchPages.packages()` 提供已登记的原声明供 GEA 检查 Consumer 等业务约定；GEA 不再控制 HTML 根配置或扫描 HTML 正文。

Host 公开认证 Fetch：

- `GET /api/agent-workbench/pages`：页面元数据，不返回正文或本地路径。
- `GET /api/agent-workbench/html?id=<pageId>&page=<view>`：安全 HTML 呈现；响应禁止缓存和外部网络。
- `GET /api/agent-workbench/theme.css`：插件共享视觉资源。
- `GET /api/agent-workbench/config`：绝对工作区路径，供明确资源／会话动作使用。

页面可见和资源存在均不授予 GEA Consumer 权限。受控业务桥及资源进入原生会话是独立动作，由 Manage/GEA 接线；静态呈现不等待它们。宿主持久会话和浏览器中的旧数据不清空、不迁移、不解析为新的运行时兼容层。

## 官方输入与构建

`cordis.patch.yml` 插入本插件并公开禁用默认 `ui-sidebar`；Workbench 声明原公开侧栏席位，继续消费官方工作区浏览器与设置。官方 `ui-layout` 和 `ui-conversation` 服务/Factory保持启用。本隔离项目的 `tsconfig.official.json` 将声明精确指向同组成组工作树旁的 `official-core` 标准产物，包括官方 Cordis `4.0.4`。旧 npm 锁仅用于准备开发工具，不能作为官方适配或运行的证据；最终外部 SDK 与宿主必须来自同一个官方输入。

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

## 显式页面能力与受控桥

公司自有主壳通过公开 `conversation.content` 的 `embedded` 呈现消费原生会话。已有 Session 的欢迎、资源和工作区/Agent控件位于 Factory 的 `views` 内容流，同时保留官方 `conversation.session` 与 resident composer；长资源使用同一官方滚动区域，不能作为不可收缩的宽度控件挤走输入区。无 Session 时的冷启动控件保留在独立可收缩滚动容器，官方惯有输入仍呈现。工作区切换沿 Factory 的 `selectWorkspace`，保留官方草稿转移行为，不复制私有主壳样式或扫描宿主 DOM。

页面的“连接页面与原生对话”动作按 Manage 的 stable resource id 选原资源，新建并借用真实官方 SessionReference。Workbench 经公开 SessionProvider 与 conversation.content factory呈现原生对话，不保存第二套全局当前会话、认证或 preset。静态原型无这项前置。

GEA 的窄 geaPageExecution 只提供唯一身份投影与既有受控 open/call/close/prompt；Workbench 持有 HTML MessageChannel、owned lease 的使用/关闭、self-report/catalog/apply/cancel、主题及页面引用。端口、引用代际和请求都在页面释放/身份变化时撤旧，旧结果不恢复。Native 审批文档保留原呈现与规则，不强制使用 HTML lease。

公共页面选择/引用实现从 GEA 退出，source 在 src/page-interaction，公开 client/picker/bridge/reference/protocol/payload-budget。React Grab 仍仅用于用户明确的内容选择；没有 shell DOM 扫描或旧主会话接线。构建把 picker 内嵌脚本置于 lib/page-picker.js，实际 HTML 读取时才注入。FC/AQKC 初始化在无连接时显示明确等待/失败，不伪造数据；连接后执行原查询和计算。

页面请求取消消息携带该请求原先绑定的Session，abort和timeout都撤销对应Host请求。URL HTML frame保持不允许same-origin的sandbox；内容引用按该frame的opaque origin判定，同时保留window/channel、Host generation、owned lease和输入revision校验。连接按钮的busy属于当前请求controller；身份变化立即释放它，旧请求完成不能清除新请求的busy。
