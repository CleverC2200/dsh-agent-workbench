<!-- collaboration-record
{
  "kind": "change",
  "id": "CHANGE-20261112-sales-plan-feedback-release",
  "date": "2026-11-12",
  "title": "销售计划反馈修复发行 0.1.95",
  "module": "销售计划",
  "status": "已发布待验收"
}
-->

# 销售计划反馈修复发行

月初“月提报达成”按实际提报金额除以月度目标金额计算；纠偏继续使用原发货达成口径。窄工作区批量退回按钮保持同行。最终提交直接展示 DMS 拒绝原文，页面不再展示错误编号，日志仍保留排查信息。未接入重提回调时单独说明入口不可用。

- 按用户确认调整月初计算口径并移除页面错误编号，保留纠偏口径、现有审批校验和日志。未删除文件或业务能力。
- 源码窗口使用真实接口完成三笔退回、重提和最终 DMS 提交。三笔重提成功，DMS 分别以产品停用或产品主数据缺失拒绝；页面显示具体原因，失败后未误标成功。
- 去除错误编号后，7项错误文案检查与2项提交浏览器回归通过。真实业务失败仍需补齐DMS主数据，本轮不修改主数据。
- 发布技能为本机 dsh-plugin-release 1.3.1 local_draft；正式构建、预检、下载和安装接收已完成。

## 发行回填

- 修复版本 `0.1.95`，固定来源 `5b225594b7388cea546c578dc2ecab606c01a632`。
- [GitHub Release](https://github.com/CleverC2200/dsh-agent-workbench/releases/tag/v0.1.95)，包含固定TGZ、release JSON及摘要。
- [主线检查](https://github.com/CleverC2200/dsh-agent-workbench/actions/runs/43148681600)通过，84项销售计划相关回归通过；修复合并为[PR #301](https://github.com/CleverC2200/dsh-agent-workbench/pull/301)。
- 最终组合为Workbench 0.1.95、Manage 0.6.3-company.65原归档、GEA 0.0.273。测试频道revision 109→110，正式频道101→102，均通过生产来源的匿名check/download。
- 固定三包构建、发布预检、required Core `0accab310546c1bc8d3ad46b8803dcbcfaa02477` 的官方隔离安装与Host/client模块图观察通过。旧Core6156856b的接收曾因服务未就绪超时，本轮接收以当前required Core为准。
- 归档SHA-256：`9859913014b0f2362af5269a910ef39a6a704fb7ce263e1c36c74f63c914c1d2`。
- 本轮未升级用户正式设备或构建桌面安装包。DMS主数据拒绝仍需业务处理；本轮没有修改主数据或重复执行真实审批。
