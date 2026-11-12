<!-- collaboration-record
{"kind":"change","id":"CHANGE-20261112-single-approval","date":"2026-11-12","title":"销售计划单笔失败提示与再次提交 0.1.100","module":"销售计划","status":"已发布待验收"}
-->

# 销售计划单笔失败提示与再次提交

对比 Workbench 0.1.98，单笔顶部通过失败后保留结果，直接显示 DMS 业务原因，不展示错误编号。明确失败后的人工提交创建新请求，避免继续返回缓存错误。未知结果保留同一幂等键核对，连续点击合并为一次调用。提交前草稿读取或版本校验失败时保留具体原因。

- 关联 [单笔审批缺陷](../../../../bugs/2026/11/BUG-20261112-single-approval-failure.md)。89 项回归、8 项提交场景复验、类型及 lint/格式检查通过。
- 本次整合当前主线。配套 GEA 0.0.277 扩展 Workbench 0.1.100 兼容声明，Manage 复用 company.67 不可变归档。
- 未删除文件或业务能力，未再次执行真实审批或 DMS 提交。原现场的顶部入口不发请求仍待修复版安装后由用户验收。
- 发布技能 dsh-plugin-release 1.3.1 为本机 local_draft。本次仅插件发布，用户正式客户端和业务主数据保持原状。

## 发行回填

- [0.1.100 Release](https://github.com/CleverC2200/dsh-agent-workbench/releases/tag/v0.1.100) 已发布，固定源码 71dcb04cb65082657c1a57c1bfe7c97d72541da2；[合并后主线 CI](https://github.com/CleverC2200/dsh-agent-workbench/actions/runs/43186735347) 通过。
- TGZ SHA-256：a983bbd0cbf1644df6ed544eb4cd18d63b7a577738aac7afe67483272906a605。完整组合为 Workbench 0.1.100、GEA 0.0.277、Manage 0.6.3-company.67 原归档。
- 测试频道 revision 114、正式频道 revision 106 已通过生产 reader 匿名 check/download。发布预检及官方隔离安装、Host/client 模块接收通过。
- 本轮明确冻结已验收的 100/277 组合，后续主线变更另行发行；归档和标签保持原字节与来源。
- 本轮未操作用户正式客户端或再次提交真实审批/DMS。现场重新勾选后点顶部通过，仍由用户更新后验收。
