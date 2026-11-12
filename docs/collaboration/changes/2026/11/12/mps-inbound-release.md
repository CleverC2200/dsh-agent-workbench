<!-- collaboration-record
{"kind":"change","id":"CHANGE-20261112-mps-inbound-release","date":"2026-11-12","title":"MPS月生产入库累计修复 0.1.101","module":"主生产计划(MPS)","status":"已发布待验收"}
-->

# MPS月生产入库累计修复

生产入库改为统计月月初至截止日的日入库合计，保留负数冲销。已备、未备、近30天日均与月初库存继续读取唯一截止日快照。缺值、重复日和人工调整的保护保持。

- 历史修复审查：保留截止日快照、NULL与真实零区分、重复日拒收及原回归保护。没有删除文件或取消业务能力。生产入库由截止日单值改为日流量月累计，属于用户明确要求的修复。
- 本轮仅发布插件组合，不构建桌面安装器，不修改源数据；安装更新、实际加载和页面数据核对单独验收。
- 使用本机dsh-plugin-release 1.3.1 local_draft，未声明团队技能已同步。

## 发布与更新验收

- 正式组合：Workbench 0.1.101 / Manage 0.6.3-company.68 / GEA 0.0.278。三仓修复 PR #313 / #156 / #393 已合并；固定发布标签保持不动。
- 测试频道 revision 115、正式频道 revision 107 已发布，完整三包经生产来源实际下载及 SHA-256 校验。逐版 GitHub Release 已发布并读回核对。
- 固定 Workbench 发布提交的合并后 CI 被后续文档提交取消；PR CI 通过，后续主线 f6b1283ce7705daefcec586dc32e1cd7b6456087 的 CI 通过，与固定发布提交仅协作记录不同。没有将取消记录计为通过。
- 同一正式包组合在当前桌面 Core 0accab310546c1bc8d3ad46b8803dcbcfaa02477 的官方接收流程通过；旧开发 Core 6156856b3a33ad2d408c2cf8162df1b32371c3d7 的空 profile Host 观察超时保留为独立失败证据。
- 已使用正式频道下载包更新用户授权的原开发 profile，在当前已安装桌面运行时代码中加载。实际业务 HTML 与正式包逐字对应，Host 注入的页面桥接另行核验。隔离启动器资源定位问题已修复。
- 实际页面导出 3,602 条基地与 SKU 记录，25,214 个源字段与受控查询返回一致；全国与五基地 66 个汇总值、6 个单品样本共 66 格全部一致。缺值继续保留待定，不改源表。
- 更新前后逐字段比较原有视图与评估草稿，已有字段无变化；原版本和人工数据均保留。完整业务 CSV、截图和机器运行日志仅留在本轮授权的本地证据目录，不上传源码仓库。
- 本机 Native 更新和页面数据核对完成。用户截图中的员工 Windows 设备尚待其更新后确认；完整排产的其他业务缺口仍独立保留，本记录不宣称完整排产验收通过。

发行记录：[Workbench](https://github.com/CleverC2200/dsh-agent-workbench/releases/tag/v0.1.101)、[Manage](https://github.com/CleverC2200/dsh-agent-manage/releases/tag/v0.6.3-company.68)、[GEA](https://github.com/CleverC2200/dsh-gea-plugin/releases/tag/v0.0.278)。
