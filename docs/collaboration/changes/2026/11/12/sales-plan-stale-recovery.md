<!-- collaboration-record
{"kind":"change","id":"CHANGE-20261112-sales-plan-stale-recovery","date":"2026-11-12","title":"销售计划旧版本与过期草稿恢复 0.1.98","module":"销售计划","status":"已发布待验收"}
-->

# 销售计划旧版本与过期草稿恢复

提交预检按实际冲突显示计划版本、状态、周期、SKU 编码和字段前后值，不再使用“样例数据”提示。旧版本可刷新列表并重新选择，取消旧勾选并清除本批未提交调整。过期草稿保留，可明确选择不套用，重新核对当前计划。提交前再次发生变化时，停止该笔写入并说明具体原因。

- 对比已发布 Workbench 0.1.97；保留月提报达成、退回数量继承、DMS 原文报错和隐藏错误编号的行为。
- 38 项页面与提交弹窗浏览器测试、16 项退回和恢复回归、三笔真实接口读取数据的只读回放通过。类型、lint、格式和知识引用检查通过。
- 旧列表刷新联动覆盖队列重新读取、勾选取消、旧数量调整清除和已存草稿保留。未知提交结果仍保留同一意图的回读流程。
- 未删除文件或业务能力。原通用冲突提示按本次用户要求拆分为具体提示，原有幂等和权限边界保留。
- 发布技能为本机 dsh-plugin-release 1.3.1 local_draft。配套 GEA 仅扩展当前 Workbench 版本，Manage 复用已发布归档。
- 本次没有再次审批或提交 DMS，没有修改 DMS 主数据，没有更新用户正式客户端。

发布前 CI 发现 API 日志批量测试未向真实 GEA Host 提供必需的隔离运行目录，八项用例在初始化时失败。已补齐 fixture 的 runtimeDir，保留全部原断言和失败日志，不改变产品逻辑。

## 发行回填

- 固定来源 `9c2f56b9aeb93128bc97f36bf810d23569647fac`；[PR #306](https://github.com/CleverC2200/dsh-agent-workbench/pull/306) 和[合并后主线检查](https://github.com/CleverC2200/dsh-agent-workbench/actions/runs/43173713415)通过。
- [Workbench 0.1.98 Release](https://github.com/CleverC2200/dsh-agent-workbench/releases/tag/v0.1.98)已发布。TGZ SHA-256 为 `4b16e3b131c6ed8b3a5a81cad42b8c65d28fd995b3af1236be1cd2bedd285937`。
- 最终组合为 Workbench 0.1.98、GEA 0.0.275、Manage 0.6.3-company.66 原归档。测试频道 revision 112、正式频道 revision 104，均通过生产 reader 匿名 check/download。
- 62项页面、退回恢复和API日志回归、43项发行合同检查通过。三笔真实详情和独立SKU接口共178条明细只读回放通过。
- 发布预检及 required Core `0accab310546c1bc8d3ad46b8803dcbcfaa02477` 的官方隔离安装、Host/client 模块接收通过；归档集合绑定为 `0fbaa4e085fe2521943d7994b9ef53025ae1d4f258513d39788f0b25135398a0`。
- 本轮没有再次提交审批或DMS，没有更改DMS主数据，没有构建桌面安装器或升级员工设备。首次CI的API日志夹具初始化失败已修正，原失败证据保留。
