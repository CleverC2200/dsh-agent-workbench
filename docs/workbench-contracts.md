# Workbench 页面与桥合同

Workbench 在本仓固定的官方 DSH 输入上提供公司品牌、账户投影、业务分组导航、欢迎区与公共工具栏，并承载原生页面、HTML 与包内资源桥。官方 `ui-layout`、工作区浏览器、设置、原生 Conversation、主题和字号保留各自归属。Workbench 不替换 root 或 layout，不创建业务登录状态；打开不关联资源的纯静态页面不会创建 Session、改写 preset 或发送模型请求。资源关联业务页在真实身份已认证且原资源确实可用时，会为页面自动准备一次真实官方 Session；这一步不发送模型请求，也不代表获得业务权限。

## 页面接入

原生页面注册官方 `main` keyed slot，再登记标题元数据。`main` 的注册事实决定目录是否显示；`register` 只补充标题，不建立第二份安装或授权清单。

`agentWorkbench.openAgentSession({sessionId,preset,cwd,draft})` 打开由资源 owner 已创建的原生 Session。Workbench 核实际预设与工作目录，再通过官方草稿入口插入目标说明并导航；已有草稿冲突时拒绝替换。Manage 的 Skill 编辑使用此入口。Session 创建、文件权限和应用目标由 Manage/官方 Host 负责，设置 modal 由其 section 的官方 close 动作关闭。

```ts
const disposePage = ctx.slots.register({ name: 'main', key: panelId }, Page);
const disposeTitle = ctx.agentWorkbench.register({ id: panelId, label: () => title });
await ctx.agentWorkbench.open(panelId);
// 卸载时释放 disposePage 和 disposeTitle。
```

原生业务文档通过 `ctx.agentWorkbench.registerFrame({id, label, src, kind: 'native', resourceId})` 贡献，由 Workbench 持有页面选择、frame 与桥的呈现生命周期。普通聊天沿用官方首页与标题栏，公司品牌通过公开 `conversation.hero.brand.mark` 贡献。Document 在公开 `shell.overlay` 的自有 `agent-workbench.documents` Session-optional 席位常驻，业务选择时通过自己的 `main.conversation` 占位与 CSS anchor 定位；Core 的 activePanelId 保持 null；关联主 Session 只沿 uiWorkspace.openSession 选择，不另注册同 ID 的 main panel。Inbox 原 React 页面通过同一入口的 `{id, label, kind: 'local', body: InboxPage, resourceId: 'gea-readonly'}` 共享对话呈现；它不创建 iframe 或页面业务 grant，列表权限、通知回执和取消仍沿原协议。包内 HTML 由 Workbench Host 配置 `htmlRoots` 登记。表格样板固定登记；省略 `htmlRoots` 时使用 [Host 中的默认根](../src/host.ts)。显式配置只装载所列根；撤回来源时从配置排除该根，其它页面与用户 Session 保留。已有 profile 的配置调整是安装前的独立操作，不使用运行时旧配置回退。启动仅登记轻量声明，选页才读取原 HTML，不进入 GEA client bundle。它读取 `plugin.json` 的页面元数据、检查路径归属，并在被选用时读取 `index.html`；不读取提示词、Skill 或业务认证。`workbenchPages.packages()` 提供已登记的原声明供 GEA 检查 Consumer 等业务约定；GEA 不再控制 HTML 根配置或扫描 HTML 正文。

Host 公开认证 Fetch：

- `GET /api/agent-workbench/pages`：页面元数据，不返回正文或本地路径。
- `GET /api/agent-workbench/html?id=<pageId>&page=<view>`：安全 HTML 呈现；响应禁止缓存和外部网络。
- `GET /api/agent-workbench/theme.css`：插件共享视觉资源。
- `GET /api/agent-workbench/config`：可选的绝对工作区路径，供明确资源与会话动作使用。

页面可见和资源存在均不授予 GEA Consumer 权限。受控业务桥及资源进入原生会话是独立动作，由 Manage/GEA 接线；静态呈现不等待它们。宿主持久会话和浏览器中的旧数据不清空、不迁移、不解析为新的运行时兼容层。

业务页面接入资源后，已有历史 Session 继续展示其原 Agent 组合与草稿。点击“新建对话”时，仍有效的页面解释者可以沿用；旧 Session 的 Core 预设不属于当前已安装启用的页面解释者时，新会话选用该页面声明的资源。旧 Core 预设不会被当作 Manage 资源 ID，也不会自动将新 Prompt 应用到旧会话。

## 按行为读取

| 修改范围                                         | 权威入口                                |
| ------------------------------------------------ | --------------------------------------- |
| 页面通道、动作、取消、回执、草稿插入与引用预算   | [页面能力与受控桥](page-interaction.md) |
| 呈现记忆、历史恢复、解释者地址与 Session sidecar | [恢复合同](presentation-recovery.md)    |
| 作者模块、固定资源摘要与生成页边界               | [HTML 作者源](html-authoring.md)        |
| 资源来源、真实读取或模拟范围、未完成业务验收     | [业务页面导航](business-pages.md)       |
| 共享主题、字号和样式归属                         | [共享视觉资源](../theme/README.md)      |
| 工具链、固定官方输入、构建与定向检查             | [本地开发](local-development.md)        |

## 官方呈现与 Native 文档

同一真实 Session 中切回首页只隐藏已访问 Document，保留其 Native DOM 与 iframe；隐藏时 `active=false`，停止当前业务能力与页面捕获。页面恢复协调位于常驻 Documents 席位，冷启动不依赖已选中的页面。真实 Session 切换继续遵守 Core `session-maybe` 的重挂语义，状态恢复沿既有持久存储与身份核对，不以 DOM 保留代替恢复。CSS anchor 只引用 Workbench 自己的占位，窗口控制区使用 Core 公开的 `--dsh-frame-leading-clearance` 保留点击空间，不读取壳层私有 DOM 或复制栏宽状态。

[cordis.patch.yml](../cordis.patch.yml) 插入本插件并禁用默认 `ui-sidebar`；Workbench 贡献公开侧栏席位，继续消费官方工作区浏览器与设置。官方 `ui-layout` 和 `ui-conversation` 服务与 Factory 保持启用。macOS 品牌行位于独立窗口控制行下方；两种侧栏状态使用官方公共图标，收起后整列退出布局。

Workbench 持有 Native 审批文档、Inbox、ApiLog、桌面导航、HTML 页与页面引用的呈现生命周期。Native 构建输出为 `lib/native.js` 与 `lib/native.css`；认证 Fetch 入口为 `/api/agent-workbench/native`。`registerFrame` 的 `src` 贡献 URL 文档，`body` 贡献本地 React 页面，`resourceId` 指向 Manage 的原资源。业务 grant 的使用和释放见页面桥合同。

## 账户环境与登录

账户登录页从同一 Host 投影读取当前环境与已配置环境列表。正式/测试控件只保存本次扫码的目标选择，`startLogin(signal, environment)` 由 GEA Host 切换环境、撤销旧身份与二维码并生成新挑战。切换、刷新和关闭取消原请求，迟到二维码不得覆盖新选择；登录成功仍等待无错误的 confirmed Host 身份，Workbench 不保存凭据或独立登录标志。

## 普通安装的工作区

普通 bundle 不把 App 的启动目录当作业务工作区。Host 的 `cwd` 配置可省略；显式配置仍须是绝对路径。资源动作优先复用 Core 传入的当前 Session 工作区，再使用显式配置。资源面板有当前 Session 工作区时，显示该目录并禁用“选择工作区”，资源清单和新聊天沿用该目录。没有当前工作区时，用户可选择目录，资源清单和新聊天使用所选目录。当前工作区和显式配置均缺失时，用户点击选择工作区或新建页面 Session 后调用官方 `uiWorkspace.pickDirectory()`；取消不会创建或切换 Session。资源列表初次加载不会自动弹出目录选择器。

接口日志、重放与批量调试的样本、取消及测试入口见[接口调试](api-log-debugging.md)。

## 设置中的接口日志

`settings.section/gea-api-log` 复用 `LogPage` 与 `ApiLogCenter`，导航标签为 GEA 接口日志，位于插件管理之前。设置关闭动作由容器传入；原业务页的关闭仍返回业务工作台。同一身份投影控制是否挂载日志中心，切换账号或环境沿原 scope 重新挂载。进入页面不执行重发或清空，日志后端和业务授权继续归 GEA。

配置化 HTML 在注入大体积 SQL JSON 前声明 UTF-8，确保无显式响应字符集的加载方式也能完整保留中文 SQL 文本、筛选值及枚举。配置仍在作者脚本前装载，保留 JSON 的 HTML 转义与原权限校验。
