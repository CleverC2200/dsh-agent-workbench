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
```

首次 `open` 按页面预设创建原生 Session；同一页面、同一业务实例复用 Session。`instance` 省略时恢复该页面上次实例，初始值为 `default`。创建并发合并，后发导航获胜；离开页面、注销或卸载不会停止后台 Agent。调用方处理 Promise 错误，不能把失败当成已切换。

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
