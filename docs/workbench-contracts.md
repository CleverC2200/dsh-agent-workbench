# Workbench 页面与桥合同

Workbench 在未修改的官方 DSH `5badb15009ae1756c3afe0ae0cef1faafc290ccc` 上提供公司品牌、账户投影、业务分组导航、欢迎区与公共工具栏，并承载原生页面、HTML 与包内资源桥。官方 `ui-layout`、工作区浏览器、设置、原生 Conversation、主题和字号保留各自归属。Workbench 不替换 root 或 layout，不创建业务登录状态；打开不关联资源的纯静态页面不会创建 Session、改写 preset 或发送模型请求。资源关联业务页在真实身份已认证且原资源确实可用时，会为页面自动准备一次真实官方 Session；这一步不发送模型请求，也不代表获得业务权限。

## 页面接入

原生页面注册官方 `main` keyed slot，再登记标题元数据。`main` 的注册事实决定目录是否显示；`register` 只补充标题，不建立第二份安装或授权清单。

```ts
const disposePage = ctx.slots.register({ name: 'main', key: panelId }, Page)
const disposeTitle = ctx.agentWorkbench.register({ id: panelId, label: () => title })
await ctx.agentWorkbench.open(panelId)
// 卸载时释放 disposePage 和 disposeTitle。
```

原生业务文档通过 `ctx.agentWorkbench.registerFrame({id, label, src, kind: 'native', resourceId})` 贡献，由 Workbench 持有页面选择、frame 与桥的呈现生命周期。Document 目录进入自己的 main.conversation 呈现，Core 的 activePanelId 保持 null；关联主 Session 只沿 uiWorkspace.openSession 选择，不另注册同 ID 的 main panel。Inbox 原 React 页面通过同一入口的 `{id, label, kind: 'local', body: InboxPage, resourceId: 'gea-readonly'}` 共享对话呈现；它不创建 iframe 或页面业务 grant，列表权限、通知回执和取消仍沿原协议。包内 HTML 由 Workbench Host 配置 `htmlRoots` 登记。该配置覆盖样板以外的全部包根，包括 `lib/static` 下三个计划原型与 `lib/business` 下库存、订单原型。省略时默认登记区域、品类、MPS、FC、AQKC、全链分布模拟页、客户库存、订单工作台和订单履约九个包，表格样板固定登记。显式配置只装载所列根；撤回一个来源时从这份清单排除该根，其它页面与用户 Session 保留。已存在的 profile 在普通安装前一次更新完整九根，不使用运行时旧配置回退。启动仅登记轻量声明，选页才读取原 HTML，不进入 GEA client bundle。它读取 `plugin.json` 的页面元数据、检查路径归属，并在被选用时读取 `index.html`；不读取提示词、Skill 或业务认证。`workbenchPages.packages()` 提供已登记的原声明供 GEA 检查 Consumer 等业务约定；GEA 不再控制 HTML 根配置或扫描 HTML 正文。

Host 公开认证 Fetch：

- `GET /api/agent-workbench/pages`：页面元数据，不返回正文或本地路径。
- `GET /api/agent-workbench/html?id=<pageId>&page=<view>`：安全 HTML 呈现；响应禁止缓存和外部网络。
- `GET /api/agent-workbench/theme.css`：插件共享视觉资源。
- `GET /api/agent-workbench/config`：绝对工作区路径，供明确资源／会话动作使用。

页面可见和资源存在均不授予 GEA Consumer 权限。受控业务桥及资源进入原生会话是独立动作，由 Manage/GEA 接线；静态呈现不等待它们。宿主持久会话和浏览器中的旧数据不清空、不迁移、不解析为新的运行时兼容层。

业务页面接入资源后，已有历史 Session 继续展示其原 Agent 组合与草稿。点击“新建对话”时，仍有效的页面解释者可以沿用；旧 Session 的 Core 预设不属于当前已安装启用的页面解释者时，新会话选用该页面声明的资源。旧 Core 预设不会被当作 Manage 资源 ID，也不会自动将新 Prompt 应用到旧会话。

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

[theme/tokens.css](../theme/tokens.css) 只由 Workbench 插件安装和释放。Manage、GEA 与 HTML 消费 `--workbench-*`，主题状态及字号来自官方 DSH；没有写 Core 源码、启动色或官方 token 的同步脚本。HTML 表格样板保留本地筛选、加载、空态、错误与恢复交互，独立显示不需要 GEA Session。

`business/inventory-fc` 与 `business/inventory-aqkc` 保留当前已迁移页面源码和包内资源。提示词／Skill 正文归 Manage，授权执行归 GEA，后续消费者迁移需接续原必要业务桥。静态页面通过不等于这些业务能力已验收。

## 显式页面能力与受控桥

公司自有主壳通过公开 `conversation.content` 的 `embedded` 呈现消费原生会话。已有 Session 的首页欢迎和工作区/Agent控件位于 Factory 的 `views` 内容流，同时保留官方 `conversation.session` 与 resident composer；提示词与 Skill 资源清单位于工作台目录，不能作为首页宽度控件挤走输入区。无 Session 时的冷启动控件保留在独立可收缩滚动容器，官方惯有输入仍呈现。工作区切换沿 Factory 的 `selectWorkspace`，保留官方草稿转移行为，不复制私有主壳样式或扫描宿主 DOM。

资源关联业务页按 Manage 的 stable resource id 选原资源，新建并借用真实官方 SessionReference。只有身份已认证、原资源实际已安装并启用时，页面才自动准备一次会话；失败不随重渲染自动重试。“新建对话”沿同一个公开资源动作开始新的页面会话。资源选择器在真实借用引用仍存活时完成 Skill 草稿、取消检查与页面 UI 关联回调，再正常打开主 Session，最后释放借用引用。Document 通过 session-maybe 工厂继承真正主 scope，消费 conversation.content；不另建 embedded SessionProvider 或当前 Session 权威。历史入口等待实际 Session 并读取公开 agentPreset 投影，页面动作按原 Host 独立校验。未声明资源的静态原型无这项前置；用户可从其历史入口明确关联一个既有 Core Session，读取实际 preset 投影（包括明确的 null），不选用资源、不调用业务 grant，也不要求 GEA 登录。

同一用户重启Host后，GEA运行范围会变化。重新打开已保存的资源页时，Workbench沿公开资源入口重新核实际Session的preset和工作区，再关联当前范围；保留原Session与草稿，不另建替代会话。用户、租户或环境不匹配时不复用旧关联。FC只有取得页面端口提供的真实Host Session后才启动读取，未连接时只呈现等待状态。

销售计划的原组织名称入口与表格展开共用同一展开状态；已加载SKU的数量、金额和描述按实际显示值上报到只读页面快照。新增金额/描述字段不可编辑，也不加入数量批量改写集合。上报与恢复不会执行保存或审批。

曾访问的 Document 正文在同一个主 Conversation 呈现内保留稳定页面树；切页时取消准备与页面桥，只有当前页面渲染 Conversation。三模式与宽度记忆沿正式规则，草稿由 Core 保存。外部 main panel 会卸载这一主呈现；登记 HTML 页面通过 `dsh-workbench-view-v1` 向同一个 WorkbenchController 保存版本1的明确 UI 字段。表格样板按 page ID 分区，无认证或 Session 前置；登记业务页面按唯一 GEA scope 与实际 Core Session 分区。区域原型保留日期、模块、提报维度与节奏草稿，恢复后重新派生上下文。Frame 在离页、重载、换 scope 和注销时释放通道；旧代际与旧窗口不能回写。页面重新取得可见对象后再核展开 ID，不恢复服务结果、身份、grant 或 busy，也不重放业务保存。

既有 toolbar 使用 sidebarRightTabs.guide/get/subscribe 展示真实 Native tab 入口，经 sidebarRight.openTab 在 Core 唯一原生工具 seat 打开。自己开工具暂用原 center 模式，自己关闭恢复原模式；明确选择三模式优先并关闭工具。已有 Document ResizeObserver 仅在尺寸变化时刷新公开 isExpanded()，不以 DOM 猜状态，也不轮询。未造成尺寸变化的外部工具开合缺少公开展开订阅，仍待上游 interface 和 Native 证据；该入口不代替上游 Header utilities 或 bottom toggle。

GEA 的 `businessAccount` 提供唯一身份只读投影；GEA 业务 adapter 经 `workbenchPages.registerBusinessPage(page, authorize)` 提供实际业务 grant，凭据与权限仍由 GEA 管控。Workbench 的 PageRuntime 持有受控 open/call/close、HTML MessageChannel、owned lease 的使用/关闭、self-report/catalog/apply/cancel、主题及页面引用，提示词提交沿官方 Session API。端口、引用代际和请求都在页面释放/身份变化时撤旧，旧结果不恢复。Native 审批文档保留原呈现与规则，不强制使用 HTML lease。

公共页面选择/引用实现从 GEA 退出，source 在 src/page-interaction，公开 client/picker/bridge/reference/protocol/payload-budget。React Grab 仍仅用于用户明确的内容选择；没有 shell DOM 扫描或旧主会话接线。构建把 picker 内嵌脚本置于 lib/page-picker.js，实际 HTML 读取时才注入。FC/AQKC 初始化在无连接时显示明确等待/失败，不伪造数据；连接后执行原查询和计算。

模型载荷的 focus 过滤只筛记录数组；标识/标量列表保留状态并遵守条目上限。省略计数是不同数组条目的合计，不是业务行数或未展开行数。FC 页面正文明确超龄、滞库和订单字段的名称，缺失订单量不以库存风险量替代。

页面请求取消消息携带该请求原先绑定的Session，abort和timeout都撤销对应Host请求。URL HTML frame保持不允许same-origin的sandbox；内容引用按该frame的opaque origin判定，同时保留window/channel、Host generation、owned lease和输入revision校验。页面会话准备的 busy 属于当前请求 controller；身份变化立即释放它，旧请求完成不能清除新请求的busy。

### 页面实现与执行归属（规格42）

Workbench 持有现有 Native 审批文档、Inbox/ApiLog/桌面导航呈现、HTML 静态资源、页面目录、动作与引用的完整生命周期。Native 构建产物为 `lib/native.js` / `lib/native.css`，认证 Fetch 为 `/api/agent-workbench/native`。

页面贡献者使用 `registerFrame`，选择 URL 文档的 `src` 或本地原 React 页面的 `body`；会话资源仍由 `resourceId` 指向原 Manage 资源。Host 的已安装业务页通过 `workbenchPages.registerBusinessPage(page, authorize)` 接入真实业务 grant；凭据、Consumer、身份变化与业务权限留在实际 GEA adapter。Workbench 自己持有 opaque owner、两种页面动作通道、工具注册、官方 Session 引用与释放。Host 运行使用固定官方 Tools `0.2.1-alpha.1`；开发依赖及类型映射按项目锁文件与 `typecheck:official` 核对。

`npm test` 是源码与离线行为检查；`test:browser` 另由同组运行所有者执行。离线通过不表示业务登录、真实数据或正式 UI 等价已验收。

当前唯一官方输入为 `dsh-v0.2.1-alpha.1` / `5badb15009ae1756c3afe0ae0cef1faafc290ccc`；开发 SDK 通过本隔离项目已构建的 `official-latest-standard` package 文件链接提供，不复制 SDK。此本地开发配置不是发行依赖或发行授权；普通类型检查与官方类型检查均使用当前 SDK，旧4878输入不再是支持路径。

## HTML 作者源与构建

样板作者源为 `samples/html-table.html`，区域原型为 `static/regional/source/index.html`。Category/MPS 的当前应用作者源是 `static/<page>/source/{data.js,app.js}`；`SOURCE.json` 记录原提交、应用边界和固定 vendor/data digest；样式按Arco最后规则边界一次拆为固定`vendor.css`及可编辑`layout.css`，固定资源摘要和拆分来源记录在 SOURCE.json。构建先校验固定资源，再编译作者模块生成 `static/<page>/index.html` 与 `lib/static`；运行时只消费生成页面，不提取或解码旧 bundle。包产物不包含作者源目录。Category/MPS作者只承载业务正文；原模拟聊天、回复/流式生成路径已退出，正式Core承载唯一Conversation。MPS Studio、avatar/voice/persona保留为原型人物/语音预览设置，不改Core的模型或身份。

FC继续使用原 BrowserRepository 的 filters、未发 draft、cycle 与 preferences；周期表单保存 level/object/days/from/to 和相对 fresh initial 的 set/remove 意图，恢复不会调用 onSave。AQKC仅保存 tab/path、已展开的真实基地/品类/SKU ID，恢复沿原读请求取得当前可见对象。`html-view-state.ts` 逐页验证 DTO，拒绝未声明字段。状态在 Workbench 插件实例中保留，注销清除；本接口不承诺桌面进程重启后的 UI 存储。

页面快捷问题与有值时的保留未发文字使用现page-interaction页侧`quotePage({label,text}, signal)`；原picker提供`window.dshPageInteraction.quote()/available()`，沿当前quote绑定的同channel/pending/cancel/reference parser。它只用当前Main的公开InputActions captureInsertion/insertText/persistDraft，明确问题把捕获selection复制为插入点，保draftRev并保留选中文字；不setDraft、自动prompt或创建Session。未关联、取消、切换、CAS冲突均不清页面文字；成功回执后只清仍相同的保留文本。原parser预算仍是6000个UTF-16代码单元（JS字符串长度），不是字节或模型token；显式转入只用trim判非空，按完整raw字符串长度核6000预算；正文不trim或slice，首行缩进与边界换行均保留，超过预算拒绝，不截断后宣称成功。普通选取reference保原截断语义。

Workbench restores saved page hints through the current Core snapshot, Session and workspace interfaces. Business recovery checks the actual Session, preset, canonical workspace and GEA subject before opening the page. It keeps user drafts in Core. Page references use the current owner and input consume token, so an identity change rejects delayed responses. Manage supplies validated Interpreter choices and GEA authorizes their execution. See [Presentation recovery](presentation-recovery.md).

## 已接收的模拟页面

客户库存、订单工作台与订单履约保留原页面标识，由Workbench打包原展示与模拟交互。Manage持有其原Prompt、Skill和零业务能力声明，GEA登记view范围的公开页面grant并拒绝SQL读取。资源选用关联官方Core Session，不发送模型请求。筛选、周期与分页等页面意图按当前身份和Session保存；订单工作台的本地演示任务仍按原说明在冷刷新后清空。区域计划复用当前静态作者页，并接回原 `plan-regional` 资源；模块、日期、维度和未保存节奏编辑按当前 Session 恢复。品类计划复用现有静态作者页，并接回原 `category-plan` Prompt、Skill 和空 MCP 声明。指标、事件、建议和任务由作者状态发布为模拟快照；UI 意图与未发文字按真实 Session 恢复，临时模拟任务不落库。

可见目录中的 UI 视图控件明确声明 `effect: "view"`，例如区域页的模块、提报维度和模拟日期。`gea_plugin_page_apply` 仍核对当前 owner、可编辑性和 grant 的实际影响范围，并沿同一取消、限流和回执流程执行。未声明影响等级的字段继续按 `draft` 判断；只读 mock 不因此获得草稿、提交、审批、SQL或工作区写权限。

MPS 原型 `plan-category-production` 在 `lib/static/mps` 接收原 `inventory-mps` 资源。当前挂载步骤的作者state通过公共业务channel发布模拟上下文和页签目录，切步移除旧数据。选用Prompt/Skill复用当前Core Session；界面意图、调整输入和未发送文字按Session恢复，模拟派生数据不存业务库。保存、导出、提交和结转仍只显示模拟提示。构建从相邻Manage的 `business-resources/inventory-mps` 装配原资源。

全链分布 `inventory-qll` 保持原14页面和当前Session接口，源查询选自原15固定Git对象。公司reader经GEA grant的access/SQL通道读取七表、验证完整分页，原字段和数量/速度映射由Manage唯一 `full-chain-source-rows` 维护。取消、身份/Session变化与刷新清事实；意图恢复不重放事实。当前渠道读取未启用，不恢复旧pool/channel或拒绝后的兜底读取。源码与fixture通过不代真实授权或普通包验收。

The same `inventory-qll` page, resource and Session support company inventory, order-gap and aging history through fixed governed queries. Captured scopes remain narrow, missing periods stay null, and range changes withdraw old facts and references. Source receipt is separate from reviewed ordinary-package, live identity and real-data acceptance.

个人库存接收包位于 `lib/business/inventory-personal`，使用统一 `mode: "mock"`、空MCP读取能力和 `page.visible=false`，默认不新增可见入口。页面保留原日监控、优先事项及年龄修复规则，只消费固定模拟输入。业务值不写入恢复状态，未提交反馈字段按当前身份与真实Session地址保存。

页面桥 `draft` 方法只接收 `{text}`，通过当前已授权连接的真实Session追加未发送纯文字。Core公开 `slash/input-insert-text` 事件校验编辑revision并持久化语义草稿，已有文字与引用保留。忙态、取消或编辑变化拒绝插入。`conversation` 仍会发送模型Task，本批个人反馈按钮只调用 `draft`。

## DMS模拟原型

DMS回写演示位于 `prototypes/dms`，通过原型演示菜单打开唯一页面 `inventory-dms`。运行 `node scripts/build-dms-prototype.mjs` 生成 `lib/prototypes/dms`；完整构建也包含此入口。Manage拥有 `inventory-dms` 解释资源和报文纯计算，页面内存模型可由公共 `./dms-mock` 导出供纠偏离线夹具消费。

页面上下文标记 `DMS_MOCK`、`simulated=true` 和 `realWriteback=false`。M一笔、Z的ADD/CUT两笔、UNKNOWN先对账和原键补齐沿原模型。页面实例持有模拟回执和完成状态；刷新清空模拟状态，仅类型和场景选择通过当前官方Session范围恢复。模拟按钮没有Agent写动作，MCP能力列表为空。实际Native、引用授权及PC视觉接收在47同组材料中另记。

### 页面回执与 History 撤销

`startPageBridgeClient` 在宿主请求成功后移除本批回执。请求未到 Host，或 Host 已接受但响应丢失时，下一轮重发相同回执。客户端按工具调用 ID 防止重复执行，Host 忽略已完成调用的重复回执。离页或换 Session 时释放旧客户端，取消在途应用并停止旧回执重试；新客户端只向新 Session 交付自己的回执。

WorkbenchController 持有 History intent 与对应页面登记的有效期。注销该页面会撤销已取走的恢复目标；即使同 ID 再登记，旧恢复也不能导航到新页面。显式取消、普通开页、新的 History intent 和 controller 释放同样撤销旧恢复。注销其他页面保留当前恢复。Core Session 的读取、确认与引用释放仍沿原公开接口。

离线验收入口为 `node --test tests/page-bridge-client.test.mjs tests/workbench-recovery.test.mjs`。前者通过真实客户端和 Host 接口覆盖传输失败、重复回执、取消与 Session 换绑；后者通过 Controller 接口覆盖注销再登记、异步迟到和取消。它们证明源码行为，实际 Native 窗口、模型和业务操作需另存对应验收证据。

历史对话侧栏补充显示当前页面可用的未发送会话。列表来自官方 `sessions.list`，只显示当前工作区、普通 blank 会话及 Manage 已启用的解读预设。缺少冷会话预设提示时，通过官方 `refreshProjections` 读取元数据，仍由同一个 Core 列表持有结果。选择仅调用 `uiWorkspace.openSession`，现有页面恢复在 `retain.ready` 后核对真实 preset/cwd。新对话、离开页面和取消会撤销旧恢复；不创建替代 Session，不改预设或草稿，不保存独立历史列表。

Manage 资源摘要中的 `description` 是资源目录的原说明。Workbench 在现有提示词与 Skill 列表显示它，不维护另一份说明目录。Skill 入口的 `agent-resource-skill` 由 Manage 复用当前官方标准组合；资源选择继续通过官方 Session、工作区与 InputHub 插入 Skill 草稿，已有草稿拒绝覆盖。

## 普通安装的工作区

普通 bundle 不把 App 的启动目录当作业务工作区。Host 的 `cwd` 配置可省略；显式配置仍须是绝对路径。资源动作优先复用 Core 传入的当前 Session 工作区，再使用显式配置。两者均缺失时，用户点击选择工作区或新建页面 Session 后调用官方 `uiWorkspace.pickDirectory()`；取消不会创建或切换 Session。资源列表初次加载不会自动弹出目录选择器。
