# 页面呈现与 Session 恢复

本合同维护页面记忆、历史关联和显式引用的恢复规则。页面动作与传输取消见[页面桥](page-interaction.md)；Core 持有实际 Session、预设、历史、草稿与保留生命周期。

## 浏览器呈现记忆

`WorkbenchController` 接收提供 `getSnapshot` 与 `set` 的呈现记忆。Client 使用 Core 公开的 `createSnapshotStore`，键为 `agent-workbench.presentation.v2`，运行时只接受版本 2。它记录所选页面、解释者与 Session 地址、preset/workspace/subject 提示，以及 `validHtmlViewState` 允许的窄 UI 投影。它不保存 Core binding、Session 日志、凭据、登录标志、grant、模型回复或派生查询结果，也不提供跨设备同步。

页侧 DTO 的 `version: 1` 是通道格式，与浏览器呈现记忆版本分别演进。FC 沿用 BrowserRepository 的 filters、未发 draft、cycle 与 preferences；周期表单保存 level/object/days/from/to 和相对 fresh initial 的 set/remove 意图，恢复不调用 onSave。AQKC 保存 tab/path 和真实基地、品类、SKU 展开 ID，恢复后沿原读请求重新确认当前可见对象。[html-view-state.ts](../src/html-view-state.ts) 逐页验证 DTO，拒绝未声明字段。UI 恢复不恢复业务结果或重放保存。

旧版本 1 呈现记忆不在运行时解码。Core 持久 Session 与用户历史保留；部署若需转换旧呈现数据，应作为独立一次性升级处理。

## 实际 Session 与身份确认

重建 Controller 不打开或创建 Session。恢复等待 Core 目录就绪，核对保存的具体成员与工作区，再用 `retain`/`ready` 借用实际 Session。当前 preset 从 Core 投影读取。地址缺失或不匹配显示失败，不静默新建替代会话。确认后沿 `uiWorkspace.openSession` 导航，并释放所有借用引用。

业务恢复等待 GEA 只读身份投影无错误确认，stable subject 由 GEA 提供，不从标签或缓存登录标志推导。新的 Host generation 取得新的 page owner 与 grant，旧 owner/grant 不随重启恢复。不同用户、租户或环境不复用旧关联；UI 意图按 subject 与 Session 分区。静态页面不新增 GEA 登录前置。

每个已声明解释者保存自己的 Session 地址。换解释者使用正常资源动作，新建会话或复用已核真实 preset/workspace 的地址；不会改变已完成对话的 preset 绕过 Core 锁。解释者提示、实际安装可用和 GEA 授权分别检查。

## 显式引用 sidecar

显式页面引用使用 Workbench 持有、位于 Core 公开 `storageDomain` 的 Session sidecar `workbench_page_references`。它只保存用户有限选取内容与当前 GEA grant 提供的环境、租户和用户归属。composer 仍保存原小回执；快照不是恢复的页面业务结果或授权。

`page_reference_read` 与认证只读 `/api/page-interaction/reference/read` 需要同一 Session、当前 page owner、有效 view 权限、原 GEA subject 及已声明 surface/tool。普通离页或 Host 释放撤销当前能力，保留用户选取快照。在 sidecar 引入前已丢失正文的旧引用仍 unavailable，原回执保留，不回查数据库重建内容。身份变化后的迟到结果按当前 owner 与输入 consume token 拒绝。

## History 导航与撤销

WorkbenchController 持有 History intent 与对应页面登记的有效期。注销目标页会撤销已取走的恢复目标；同 ID 再登记也不能接收旧恢复。显式取消、普通开页、新的 History intent 和 controller 释放同样撤旧恢复；注销其它页保留当前恢复。实际 Session 的读取、确认和释放仍沿 Core 公开接口。

历史侧栏显示当前页可用的未发送会话。列表来自官方 `sessions.list`，限定当前工作区、普通 blank 会话及 Manage 已启用的解释预设。缺少冷会话 preset 提示时，通过 `refreshProjections` 读取元数据，仍由同一 Core 列表持有结果。选择只调用 `uiWorkspace.openSession`；恢复在 `retain.ready` 后核真实 preset/cwd。新对话、离页和取消撤旧恢复，不建立独立历史列表、不改 preset 或草稿。

## 实现与证据入口

固定 Core 输入由 [verify-official-input.mjs](../scripts/verify-official-input.mjs) 维护。使用的公开能力为 Core `packages/client/store` 的浏览器快照、`packages/api/session-controller` 的目录/retain/projection 和 `packages/client/ui-workspace` 的导航。

[workbench-recovery.test.mjs](../tests/workbench-recovery.test.mjs) 覆盖无 Session 副作用重建、解释者与范围隔离、UI 意图、格式拒绝、注销再登记、异步迟到和取消。测试文件是验证入口，不表示本轮已运行；真实浏览器 reload、普通 Host restart 和业务授权仍需对应窗口与环境回执。
