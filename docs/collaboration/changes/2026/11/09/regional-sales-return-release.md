<!-- collaboration-record
{"kind":"change","id":"CHANGE-20261109-regional-sales-return-release","date":"2026-11-09","title":"区域大类SKU提报、退回数据及启动恢复修复","module":"销售计划与会话","status":"已发布"}
-->
# 区域销售计划与会话恢复

- 已发布 [Workbench 0.1.84](https://github.com/CleverC2200/dsh-agent-workbench/releases/tag/v0.1.84)，固定源码为 [454cc262](https://github.com/CleverC2200/dsh-agent-workbench/commit/454cc2626f380b2ae3189077fb5688f46a0d9f26)，功能合并为 #270、#273。
- 完整组合为 Workbench 0.1.84、[GEA 0.0.257](https://github.com/CleverC2200/dsh-gea-plugin/releases/tag/v0.0.257)、原包复用的 [Manage 0.6.3-company.59](https://github.com/CleverC2200/dsh-agent-manage/releases/tag/v0.6.3-company.59)。
- 本轮包含大类及SKU汇总、同期及近两月实际发货量、SKU实际明细金额汇总、确认量四舍五入、原合同单笔及批量退回，以及首次打开销售页面的就绪修复；没有新增后端接口或字段。
- MPS 页面 #272 及配套 Manage 计算 #141 已进入固定源码，实际下载归档包含 MPS 页面、排产、产能报表和工作流计算。
- 两仓合并后主线 CI、三包构建、发行预检、官方安装与 Host 接收均通过；test/stable 频道修订 99/91，生产来源读取器完整下载并校验三包。
- 开发客户端经原欢迎页进入后，首次打开销售计划正常，未手动刷新；末次文档自动打开和原会话自动关联未在末轮确认。
- 先前授权的单笔1笔、批量2笔已完成79条SKU真实回读；末轮验收只读。状态7/8/9继续退回通过回归，尚无新增正式样本验收。
- 发布前主线合入独立订单 KPI #275；用户明确选择按已验收固定版本发布，该项留待下一版。既有标签与归档没有改写，旧候选及失败证据保留。
- 本轮只发布插件，没有升级 Core 或发布桌面安装包。
