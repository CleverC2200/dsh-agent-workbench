# Agent 工作台

Workbench 在未修改的官方 DSH `5badb15009ae1756c3afe0ae0cef1faafc290ccc` 上提供公司品牌、账户投影、业务分组导航、欢迎区与公共工具栏，并承载原生页面、HTML 与包内资源桥。官方 `ui-layout`、工作区浏览器、设置、原生 Conversation、主题和字号保留各自归属。Workbench 不替换 root 或 layout，不创建业务登录状态；打开不关联资源的纯静态页面不会创建 Session、改写 preset 或发送模型请求。资源关联业务页在真实身份已认证且原资源确实可用时，会为页面自动准备一次真实官方 Session；这一步不发送模型请求，也不代表获得业务权限。

## 页面接入

原生页面注册官方 `main` keyed slot，再登记标题元数据。`main` 的注册事实决定目录是否显示；`register` 只补充标题，不建立第二份安装或授权清单。

```ts
const disposePage = ctx.slots.register({ name: 'main', key: panelId }, Page)
const disposeTitle = ctx.agentWorkbench.register({ id: panelId, label: () => title })
await ctx.agentWorkbench.open(panelId)
// 卸载时释放 disposePage 和 disposeTitle。
```

原生业务文档通过 `ctx.agentWorkbench.registerFrame({id, label, src, kind: 'native', resourceId})` 贡献，由 Workbench 持有页面选择、frame 与桥的呈现生命周期。Document 目录进入自己的 main.conversation 呈现，Core 的 activePanelId 保持 null；关联主 Session 只沿 uiWorkspace.openSession 选择，不另注册同 ID 的 main panel。Inbox 原 React 页面通过同一入口的 `{id, label, kind: 'local', body: InboxPage, resourceId: 'gea-readonly'}` 共享对话呈现；它不创建 iframe 或页面业务 grant，列表权限、通知回执和取消仍沿原协议。包内 HTML 由 Workbench Host 配置 `htmlRoots` 登记；同组 profile 使用本候选快照中的 FC/AQKC 根，不指向旧用户目录。三个静态计划原型独立放在 `lib/static`，启动仅登记轻量声明，选页才读取原 HTML，不进入 GEA client bundle。它读取 `plugin.json` 的页面元数据、检查路径归属，并在被选用时读取 `index.html`；不读取提示词、Skill 或业务认证。`workbenchPages.packages()` 提供已登记的原声明供 GEA 检查 Consumer 等业务约定；GEA 不再控制 HTML 根配置或扫描 HTML 正文。

Host 公开认证 Fetch：

- `GET /api/agent-workbench/pages`：页面元数据，不返回正文或本地路径。
- `GET /api/agent-workbench/html?id=<pageId>&page=<view>`：安全 HTML 呈现；响应禁止缓存和外部网络。
- `GET /api/agent-workbench/theme.css`：插件共享视觉资源。
- `GET /api/agent-workbench/config`：绝对工作区路径，供明确资源／会话动作使用。

页面可见和资源存在均不授予 GEA Consumer 权限。受控业务桥及资源进入原生会话是独立动作，由 Manage/GEA 接线；静态呈现不等待它们。宿主持久会话和浏览器中的旧数据不清空、不迁移、不解析为新的运行时兼容层。

## 官方输入与构建

`cordis.patch.yml` 插入本插件并公开禁用默认 `ui-sidebar`；Workbench 声明原公开侧栏席位，继续消费官方工作区浏览器与设置。官方 `ui-layout` 和 `ui-conversation` 服务/Factory保持启用。macOS 公司品牌行位于独立窗口控制行下方；两种侧栏状态使用官方公共图标，收起后整列退出布局。本隔离项目的 `tsconfig.official.json` 将声明精确指向同组成组工作树旁的 `official-latest-standard` 标准产物，包括官方 Cordis `4.0.5-alpha.1`。npm锁登记本项目当前官方SDK的文件链接，实际SDK与宿主来自同一个已构建官方输入；类型/离线通过仍不代表实际客户端验收。

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

公司自有主壳通过公开 `conversation.content` 的 `embedded` 呈现消费原生会话。已有 Session 的首页欢迎和工作区/Agent控件位于 Factory 的 `views` 内容流，同时保留官方 `conversation.session` 与 resident composer；提示词与 Skill 资源清单位于工作台目录，不能作为首页宽度控件挤走输入区。无 Session 时的冷启动控件保留在独立可收缩滚动容器，官方惯有输入仍呈现。工作区切换沿 Factory 的 `selectWorkspace`，保留官方草稿转移行为，不复制私有主壳样式或扫描宿主 DOM。

资源关联业务页按 Manage 的 stable resource id 选原资源，新建并借用真实官方 SessionReference。只有身份已认证、原资源实际已安装并启用时，页面才自动准备一次会话；失败不随重渲染自动重试。“新建对话”沿同一个公开资源动作开始新的页面会话。资源选择器在真实借用引用仍存活时完成 Skill 草稿、取消检查与页面 UI 关联回调，再正常打开主 Session，最后释放借用引用。Document 通过 session-maybe 工厂继承真正主 scope，消费 conversation.content；不另建 embedded SessionProvider 或当前 Session 权威。历史入口等待实际 Session 并读取公开 agentPreset 投影，页面动作按原 Host 独立校验。静态原型无这项前置；用户可从其历史入口明确关联一个既有 Core Session，读取实际 preset 投影（包括明确的 null），不选用资源、不调用业务 grant，也不要求 GEA 登录。

曾访问的 Document 正文在同一个主 Conversation 呈现内保留稳定页面树；切页时取消准备与页面桥，只有当前页面渲染 Conversation。三模式与宽度记忆沿正式规则，草稿由 Core 保存。外部 main panel 会卸载这一主呈现；六个登记 HTML 页面通过 `dsh-workbench-view-v1` 向同一个 WorkbenchController 保存版本1的明确 UI 字段。静态页面按 page ID 分区，无认证或 Session 前置；FC/AQKC按唯一 GEA scope 与实际 Core Session 分区。Frame 在离页、重载、换 scope 和注销时释放通道；旧代际与旧窗口不能回写。页面重新取得可见对象后再核展开 ID，不恢复服务结果、身份、grant 或 busy，也不重放业务保存。

既有 toolbar 使用 sidebarRightTabs.guide/get/subscribe 展示真实 Native tab 入口，经 sidebarRight.openTab 在 Core 唯一原生工具 seat 打开。自己开工具暂用原 center 模式，自己关闭恢复原模式；明确选择三模式优先并关闭工具。已有 Document ResizeObserver 仅在尺寸变化时刷新公开 isExpanded()，不以 DOM 猜状态，也不轮询。未造成尺寸变化的外部工具开合缺少公开展开订阅，仍待上游 interface 和 Native 证据；该入口不代替上游 Header utilities 或 bottom toggle。

GEA 的 `businessAccount` 提供唯一身份只读投影；GEA 业务 adapter 经 `workbenchPages.registerBusinessPage(page, authorize)` 提供实际业务 grant，凭据与权限仍由 GEA 管控。Workbench 的 PageRuntime 持有受控 open/call/close、HTML MessageChannel、owned lease 的使用/关闭、self-report/catalog/apply/cancel、主题及页面引用，提示词提交沿官方 Session API。端口、引用代际和请求都在页面释放/身份变化时撤旧，旧结果不恢复。Native 审批文档保留原呈现与规则，不强制使用 HTML lease。

公共页面选择/引用实现从 GEA 退出，source 在 src/page-interaction，公开 client/picker/bridge/reference/protocol/payload-budget。React Grab 仍仅用于用户明确的内容选择；没有 shell DOM 扫描或旧主会话接线。构建把 picker 内嵌脚本置于 lib/page-picker.js，实际 HTML 读取时才注入。FC/AQKC 初始化在无连接时显示明确等待/失败，不伪造数据；连接后执行原查询和计算。

页面请求取消消息携带该请求原先绑定的Session，abort和timeout都撤销对应Host请求。URL HTML frame保持不允许same-origin的sandbox；内容引用按该frame的opaque origin判定，同时保留window/channel、Host generation、owned lease和输入revision校验。页面会话准备的 busy 属于当前请求 controller；身份变化立即释放它，旧请求完成不能清除新请求的busy。

### 页面实现与执行归属（规格42）

Workbench 持有现有 Native 审批文档、Inbox/ApiLog/桌面导航呈现、HTML 静态资源、页面目录、动作与引用的完整生命周期。Native 构建产物为 `lib/native.js` / `lib/native.css`，认证 Fetch 为 `/api/agent-workbench/native`。

页面贡献者使用 `registerFrame`，选择 URL 文档的 `src` 或本地原 React 页面的 `body`；会话资源仍由 `resourceId` 指向原 Manage 资源。Host 的已安装业务页通过 `workbenchPages.registerBusinessPage(page, authorize)` 接入真实业务 grant；凭据、Consumer、身份变化与业务权限留在实际 GEA adapter。Workbench 自己持有 opaque owner、两种页面动作通道、工具注册、官方 Session 引用与释放。Host 运行使用固定官方 Tools `0.2.1-alpha.1`；开发依赖及类型映射按项目锁文件与 `typecheck:official` 核对。

`npm test` 是源码与离线行为检查；`test:browser` 另由同组运行所有者执行。离线通过不表示业务登录、真实数据或正式 UI 等价已验收。

当前唯一官方输入为 `dsh-v0.2.1-alpha.1` / `5badb15009ae1756c3afe0ae0cef1faafc290ccc`；开发 SDK 通过本隔离项目已构建的 `official-latest-standard` package 文件链接提供，不复制 SDK。此本地开发配置不是发行依赖或发行授权；普通类型检查与官方类型检查均使用当前 SDK，旧4878输入不再是支持路径。

## HTML 作者源与构建

样板作者源为 `samples/html-table.html`，区域原型为 `static/regional/source/index.html`。Category/MPS 的当前正式应用作者段已一次恢复为 `static/<page>/source/{data.js,app.js}`；`SOURCE.json` 记录原提交、应用边界和固定 vendor/data digest；样式按Arco最后规则边界一次拆为固定`vendor.css`及可编辑`layout.css`，原/新摘要均记录。构建先校验固定资源，再编译作者模块生成 `static/<page>/index.html` 与 `lib/static`；运行时只消费生成页面，不提取或解码旧 bundle。发布产物不包含作者源目录。Category/MPS作者只承载业务正文；原模拟聊天、回复/流式生成路径已退出，正式Core承载唯一Conversation。MPS Studio、avatar/voice/persona保留为原型人物/语音预览设置，不改Core的模型或身份。

FC继续使用原 BrowserRepository 的 filters、未发 draft、cycle 与 preferences；周期表单保存 level/object/days/from/to 和相对 fresh initial 的 set/remove 意图，恢复不会调用 onSave。AQKC仅保存 tab/path、已展开的真实基地/品类/SKU ID，恢复沿原读请求取得当前可见对象。`html-view-state.ts` 逐页验证 DTO，拒绝未声明字段。状态在 Workbench 插件实例中保留，注销清除；本接口不承诺桌面进程重启后的 UI 存储。

页面快捷问题与有值时的保留未发文字使用现page-interaction页侧`quotePage({label,text}, signal)`；原picker提供`window.dshPageInteraction.quote()/available()`，沿当前quote绑定的同channel/pending/cancel/reference parser。它只用当前Main的公开InputActions captureInsertion/insertText/persistDraft，明确问题把捕获selection复制为插入点，保draftRev并保留选中文字；不setDraft、自动prompt或创建Session。未关联、取消、切换、CAS冲突均不清页面文字；成功回执后只清仍相同的保留文本。原parser预算仍是6000个UTF-16代码单元（JS字符串长度），不是字节或模型token；显式转入只用trim判非空，按完整raw字符串长度核6000预算；正文不trim或slice，首行缩进与边界换行均保留，超过预算拒绝，不截断后宣称成功。普通选取reference保原截断语义。

Workbench restores saved page hints through the current Core snapshot, Session and workspace interfaces. Business recovery checks the actual Session, preset, canonical workspace and GEA subject before opening the page. It keeps user drafts in Core. Page references use the current owner and input consume token, so an identity change rejects delayed responses. Manage supplies validated Interpreter choices and GEA authorizes their execution. See [Presentation recovery](docs/presentation-recovery.md).
