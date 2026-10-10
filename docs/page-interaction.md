# 页面能力与受控桥

## 官方对话呈现

公司自有主壳通过公开 `conversation.content` 的 `embedded` 呈现消费原生会话。已有 Session 的首页欢迎和工作区/Agent控件位于 Factory 的 `views` 内容流，同时保留官方 `conversation.session` 与 resident composer；提示词与 Skill 资源清单位于工作台目录，不能作为首页宽度控件挤走输入区。无 Session 时的冷启动控件保留在独立可收缩滚动容器，官方惯有输入仍呈现。工作区切换沿 Factory 的 `selectWorkspace`，保留官方草稿转移行为，不复制私有主壳样式或扫描宿主 DOM。

## 资源选用与页面会话

资源关联业务页按 Manage 的 stable resource id 选原资源，新建并借用真实官方 SessionReference。只有身份已认证、原资源实际已安装并启用时，页面才自动准备一次会话；失败不随重渲染自动重试。“新建对话”沿同一个公开资源动作开始新的页面会话。资源选择器在真实借用引用仍存活时完成 Skill 草稿、取消检查与页面 UI 关联回调，再正常打开主 Session，最后释放借用引用。Document 通过 session-maybe 工厂继承真正主 scope，消费 conversation.content；不另建 embedded SessionProvider 或当前 Session 权威。历史入口等待实际 Session 并读取公开 agentPreset 投影，页面动作按原 Host 独立校验。未声明资源的静态原型无这项前置；用户可从其历史入口明确关联一个既有 Core Session，读取实际 preset 投影（包括明确的 null），不选用资源、不调用业务 grant，也不要求 GEA 登录。

重启、身份变化和历史关联按[恢复合同](presentation-recovery.md)办理。FC 只有取得页面端口提供的真实 Host Session 后才启动读取；未连接时只呈现等待状态。

## 页面树与工具栏

曾访问的 Document 正文在同一个主 Conversation 呈现内保留稳定页面树；切页时取消准备与页面桥，只有当前页面渲染 Conversation。三模式与宽度记忆沿正式规则，草稿由 Core 保存。外部 main panel 会卸载这一主呈现；登记 HTML 页面通过 `dsh-workbench-view-v1` 向同一个 WorkbenchController 传递版本 1 的明确 UI 字段。该页侧协议版本与[浏览器呈现记忆的版本 2](presentation-recovery.md)分别演进。表格样板按 page ID 分区，无认证或 Session 前置；登记业务页面按唯一 GEA scope 与实际 Core Session 分区。Frame 在离页、重载、换 scope 和注销时释放通道；旧代际与旧窗口不能回写。页面重新取得可见对象后再核展开 ID，不恢复服务结果、身份、grant 或 busy，也不重放业务保存。

既有 toolbar 使用 sidebarRightTabs.guide/get/subscribe 展示真实 Native tab 入口，经 sidebarRight.openTab 在 Core 唯一原生工具 seat 打开。自己开工具暂用原 center 模式，自己关闭恢复原模式；明确选择三模式优先并关闭工具。已有 Document ResizeObserver 仅在尺寸变化时刷新公开 isExpanded()，不以 DOM 猜状态，也不轮询。未造成尺寸变化的外部工具开合缺少公开展开订阅，仍待上游 interface 和 Native 证据；该入口不代替上游 Header utilities 或 bottom toggle。

## grant 与引用生命周期

GEA 的 `businessAccount` 提供唯一身份只读投影；GEA 业务 adapter 经 `workbenchPages.registerBusinessPage(page, authorize)` 提供实际业务 grant，凭据与权限仍由 GEA 管控。Workbench 的 PageRuntime 持有受控 open/call/close、HTML MessageChannel、owned lease 的使用/关闭、self-report/catalog/apply/cancel、主题及页面引用，提示词提交沿官方 Session API。端口、引用代际和请求都在页面释放/身份变化时撤旧，旧结果不恢复。Native 审批文档保留原呈现与规则，不强制使用 HTML lease。

公共页面选择与引用实现位于 [src/page-interaction](../src/page-interaction)，公开导出查 package.json。React Grab 仍仅用于用户明确的内容选择；没有 shell DOM 扫描或旧主会话接线。构建把 picker 内嵌脚本置于 lib/page-picker.js，实际 HTML 读取时才注入。FC/AQKC 初始化在无连接时显示明确等待/失败，不伪造数据；连接后执行原查询和计算。

## 载荷与取消

模型载荷的 focus 过滤只筛记录数组；标识/标量列表保留状态并遵守条目上限。省略计数是不同数组条目的合计，不是业务行数或未展开行数。FC 页面正文明确超龄、滞库和订单字段的名称，缺失订单量不以库存风险量替代。

页面请求取消消息携带该请求原先绑定的Session，abort和timeout都撤销对应Host请求。URL HTML frame保持不允许same-origin的sandbox；内容引用按该frame的opaque origin判定，同时保留window/channel、Host generation、owned lease和输入revision校验。页面会话准备的 busy 属于当前请求 controller；离页或身份变化立即释放它，旧请求完成不能清除新请求的busy。

## 草稿插入与引用预算

页面快捷问题和保留未发文字使用页侧 `quotePage({label,text}, signal)`。picker 提供 `window.dshPageInteraction.quote()/available()`，沿当前 quote 的 channel、pending、cancel 和 reference parser 接线。

插入仅使用当前 Main 公开 InputActions 的 captureInsertion/insertText/persistDraft。明确问题将捕获 selection 复制为插入点，保 draftRev 和原选中文字，不 setDraft、自动 prompt 或创建 Session。未关联、取消、切换或 CAS 冲突均保留页面文字；成功回执后只清仍相同的保留文本。

显式转入预算为 6000 个 UTF-16 代码单元，即 JS 字符串长度，不是字节或模型 token。仅用 trim 判断非空，预算检查完整 raw 字符串；正文不 trim 或 slice，保首行缩进与边界换行。超预算拒绝，普通选取 reference 仍沿用原截断语义。

页面桥 `draft` 方法只接收 `{text}`，通过当前已授权连接的真实Session追加未发送纯文字。Core公开 `slash/input-insert-text` 事件校验编辑revision并持久化语义草稿，已有文字与引用保留。忙态、取消或编辑变化拒绝插入。`conversation` 仍会发送模型Task，本批个人反馈按钮只调用 `draft`。

## 工具回执

`startPageBridgeClient` 在宿主请求成功后移除本批回执。请求未到 Host，或 Host 已接受但响应丢失时，下一轮重发相同回执。客户端按工具调用 ID 防止重复执行，Host 忽略已完成调用的重复回执。离页或换 Session 时释放旧客户端，取消在途应用并停止旧回执重试；新客户端只向新 Session 交付自己的回执。

已有测试入口为 [page-bridge-client.test.mjs](../tests/page-bridge-client.test.mjs)，覆盖传输失败、重复回执、取消与 Session 换绑。测试内容不代表本轮已运行或真实业务验收。

## 视图动作

可见目录中的 UI 视图控件明确声明 `effect: "view"`，例如区域页的模块、提报维度和模拟日期。`gea_plugin_page_apply` 仍核对当前 owner、可编辑性和 grant 的实际影响范围，并沿同一取消、限流和回执流程执行。未声明影响等级的字段继续按 `draft` 判断；只读 mock 不因此获得草稿、提交、审批、SQL或工作区写权限。
