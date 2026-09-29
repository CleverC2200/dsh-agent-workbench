# Agent 工作台

替换 DSH 的布局插件，为多个业务 Agent 提供独立页面和原生会话并排显示。本隔离分支以同级 DSH `0.2.0-rc.1` 源码及本项目会话导航扩展为基线；不复制聊天或输入框。原 `0.1.5-rc.2` 锁保留作历史开发环境记录，新组合通过下方的源码构建入口验证。

## 组合

通过 profile 补丁禁用 `ui-layout`，插入本包 Host entry，并配置绝对路径 `cwd`。DSH 的 `name` 补丁字段是名称检查，不能用来替换插件：必须采用“禁用旧行＋插入新行”。本包提供原有 `layout` 服务及 `sidebar`、`main`、`rightbar`、`shell.overlay` 插槽，保留原生导航、主题、设置、对话和右侧工具栏。工作台页面与原生会话并排时，原生右侧工具栏暂停显示。

## 业务插件接入

客户端声明注入 `slots`、`agentWorkbench`；先注册标准 `main` 页面，再注册工作台身份。页面卸载撤销并排显示，插件卸载撤销注册。

```ts
const unregister = ctx.agentWorkbench.register({ id: panelId, preset: 'my-agent' })
const hideConversation = ctx.agentWorkbench.showConversation(panelId)
await ctx.agentWorkbench.open(panelId, businessInstanceId)
// 已由业务 Host 创建会话时，可明确关联；不会修改该会话的预设：
await ctx.agentWorkbench.open(panelId, businessInstanceId, sessionId)
// 同一页面允许多个已登记预设时，为每个预设保留不同实例：
await ctx.agentWorkbench.open(panelId, 'my-other-agent', undefined, 'my-other-agent')
```

首次 `open` 按页面预设创建原生 Session；同一页面、同一业务实例复用 Session。`instance` 省略时恢复该页面上次实例，初始值为 `default`。创建并发合并，后发导航获胜；离开页面、注销或卸载不会停止后台 Agent。调用方处理 Promise 错误，不能把失败当成已切换。
页面可在 `register` 中声明 `allowedPresets`。第四个 `open` 参数只能选默认或已声明的预设；即使调用方显式传入 Session 而省略第四参数，刷新会话目录后仍会核对该 Session 的实际预设。恢复页面关联时也拒绝不允许的预设，不会因切换页面修改旧会话。

会话关联保存在当前浏览器标签页的 `sessionStorage`，刷新可恢复，不支持跨设备恢复。只保存页面、业务实例与 Session 标识，不保存业务数据。登录身份失效时业务插件调用 `forget(panelId)` 并清除当前 Session。恢复前通过 DSH 刷新会话列表，缺失会话报错，不自动换成其他会话。`forget` 不删除 DSH 会话；后续 `open` 可创建新会话。

业务插件仍负责自身权限、页面内业务状态和需要发送给模型的上下文。界面展示本身不会向模型发送数据。原生输入框、草稿和消息全部由 DSH 管理。

## 维护

布局适配代码来自原有布局实现，来源见 UPSTREAM.md。升级 DSH 需要验证原生插槽、服务和客户端加载协议。此包与 GEA 无业务依赖；示例包使用同一接口验证第二个 Agent。本包在独立 Git 仓库维护，构建产物随 Git 提交，可按固定提交安装；尚未发布 npm registry 版本。GEA 是本包的消费者，构建不需要 GEA checkout。

## 独立开发与安装

运行 `npm ci`、`npm test`、`npm run build`。通过 `dsh plugin --profile <profile> add git+http://100.100.6.191:20656/chenyonghao/dsh-agent-workbench.git#<commit>` 安装固定提交；私有仓库需要 GitLab 读取权限。bundle 禁用默认 ui-layout 并挂载本包，默认工作区为启动目录，可在 profile 补丁的 agent-workbench 配置中指定绝对路径 cwd。

## 插件拆分源码基线

隔离开发使用同级 DSH 0.2.0-rc.1 源码及其 `uiWorkspace.selectSession` 扩展，业务页切换会话时保留面板；主会话按 `mainView` 引用识别，布局服务公开同一份 `panelInfo`。在本隔离项目从 GEA 仓执行 `corepack pnpm run source:build`，按各仓现有工具链构建并对同一份已构建核心声明做类型检查。旧 0.1.x 锁文件下的普通类型检查不代表这套源码组合。

## 共享主题

[共享主题资源](theme/README.md) 在本仓库维护，在开发期同步并编入受控 DSH 的 ui-theme。工作台不再创建主题 presenter；宿主主题适配必须与本插件一起整合。只升级此工作台插件到旧宿主不受支持。主题资源候选版本为 1.0.0，插件包版本保持 0.1.1，未发布。

浏览器标题通过核心 `uiSession.mainSessionId` 的只读观察源选择会话，再从会话列表读取标题；观察不会增加引用，组件卸载时释放订阅。源码适配需要配套核心与 GEA。

主题同步按 `html body` 和 `html body[data-ds-dark-theme]` 选择器读取各自唯一的六位十六进制 `--workbench-page`，规则顺序不影响启动色；重复、缺失、嵌套规则或不兼容值会在写入前报错。资源版本、摘要和漂移检查仍由 `scripts/sync-theme.mjs` 维护。

## HTML 表格样板（隔离验证）

`samples/html-table.html` 是项目交付清单样板，只含本地演示数据。`npm run build` 将唯一的 `theme/tokens.css` 内嵌到 `lib/samples/html-table.html`，校验资源 1.0.0 的 SHA-256；不新增运行时插件，不加载网络 CSS。资源缺失或摘要变化会拒绝构建。源码模板直接打开会显示资源缺失提示。

在隔离源码组合运行 GEA 的 `tests/html-shared-theme-web.test.mjs`，测试临时生成 loader 所需的 mock 描述文件，以现有 HTML 承载器打开样板。临时描述不随插件发布，退出时先停止 profile 再删除。样板覆盖筛选、表格、加载、空结果、错误重试、明暗、字号、键盘焦点和窄屏表格滚动；不查询库存或其他业务数据。

主题通过现有 `gea-html-v1` MessageChannel 同步，iframe 不读取父页 DOM。连接校验父窗口和来源，主题消息校验页面及当前会话；切换会话暂停操作，卸载释放计时器和端口。父页主题状态、持久化与 DOM 投影仍由 ui-theme 管理，样板只消费投影后的变量。sandbox 与 CSP 沿用承载器，外部请求仍被禁止。资源不兼容或连接失败时显示诊断并禁用查询。

## 分仓库存试点

`business/inventory-fc` 保存从 `dsh-agent-fc-plugin@906b3b0` 迁入的页面与计算源码。`scripts/build-inventory-fc.mjs` 生成 `lib/business/inventory-fc`，通过原有 `plugin.json` 与 `declarations.page/capability` 关联 Agent Manage 的 Skill/提示词/能力资源；没有新增注册表。GEA 负责登录、Consumer 和只读校验。旧资源入口保留。

构建前在 `business/inventory-fc/source/inventory-light-plugins` 按其 pnpm 固定锁安装独立依赖；再运行工作台构建。Agent Manage 同级资源必须存在，缺失会失败。使用现有 `GEA_HTML_PLUGIN_ROOTS` 指向构建目录即可装载。原共享主题 1.0.0 经既有 MessagePort 投影，不增加 iframe 权限或网络连接。数量口径、页面预览及导出行为沿用原模块；缺少 SKU/库存数量时明确报错，不能解释为零。

分仓页面的库存解读与草稿上下文只使用当前查询条件和刷新批次对应的就绪快照；加载、空结果和错误只发布状态与可用筛选，不把占位快照或上一仓结果当成业务事实。页面直接用现有 `BrowserRepository(memoryStorage)` 保存本页状态，构建不再按源码文本替换 localStorage；关闭页面或身份变化仍清除内存状态。

`visibleText` 也遵守当前查询状态：只有 ready 才提取页面文字；非就绪时使用该状态的具体说明，避免页面暂留的旧 KPI 再次进入 Agent 上下文。页面展示及筛选控件保留。

FC 的 `data` 与库存解读、草稿一起由当前 ready 页面发布。fetch 完成只触发当前上下文重读，不再把导出或明细响应直接写入事实；旧 CSV 可以正常完成下载，但不能覆盖切页后的查询状态或新查询事实。
行引用带当前仓、页签、筛选、分页和快照标识，不带未显示行的草稿。给 Agent 的补货行只包含当前页可见列，最多 30 行并标明截断。页面加载、空结果、错误或范围变化时引用入口拒绝旧行；换会话时取消旧页面请求，用现有消息桥重新读取并发布当前筛选结果。

分仓引用范围包含当前渲染列的顺序。使用已有列目录的序号表示，避免完整列名使 scope 超过现有1000字符边界；引用正文仍使用当前可见的列名和值。
