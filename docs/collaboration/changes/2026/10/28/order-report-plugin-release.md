<!-- collaboration-record
{
  "kind": "change",
  "id": "CHANGE-20261028-order-report-plugin-release",
  "date": "2026-10-28",
  "title": "订单报告与列表对齐插件发行准备",
  "module": "插件发行",
  "status": "准备中"
}
-->
# 订单报告与列表对齐插件发行准备

Workbench 递增到 0.1.36，避免覆盖已发布 0.1.35 的归档。纳入 #161 的订单工作台保存动作和三模块列表居中对齐，与 GEA #238 的 order 报告新增、修改、回读配套交付；不调整卡片布局或业务指标。

本提交仅同步 manifest、锁和编译版本标识，无接口删除或历史修复回退。原功能的定向测试和实际保存回显沿用对应 PR 证据；发行另核固定源码、构建回执、三包预检与频道下载。

用户明确授权按提供的 dsh-plugin-release 1.1.0 ZIP 发布既有 OSS 插件频道。技能来源记为 distributed_bundle，不声称已同步团队权威源。仅发布插件，不构建客户端或升级 Core，凭据不进入仓库及发行物。
