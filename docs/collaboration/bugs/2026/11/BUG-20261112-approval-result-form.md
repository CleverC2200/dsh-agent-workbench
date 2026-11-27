<!-- collaboration-record
{"kind":"bug","id":"BUG-20261112-approval-result-form","date":"2026-11-12","title":"审批失败展开完整表单及结果恢复不一致","module":"销售计划","category":"界面","cause":"修复回退","severity":"P2","status":"已发布待验收"}
-->

# 审批结果展示与恢复

单笔直接审批失败后复用了完整审批表单，导致角色、调整明细和确认字段全部展开。该回显分支在 eaf2b15a 引入。批量退回和重提另有各自的结果状态，未知结果缺少一致恢复入口。

本轮将单笔失败改为简洁结果弹窗，直接显示业务原因并隐藏错误编号；批量逐笔区分成功、失败、待核对和跳过。明确失败后重新校验并创建新请求，未知结果收起后保留原操作，列表刷新不会丢掉它。

- 本地修复：988de838、f25b7c2b、bf172311；月初整数数量由51e7dd30保留。
- 133项页面与模型回归、72项Host回归及定向检查通过；独立审查发现的408分类遗漏已补修。
- 已发布Workbench [0.1.105](https://github.com/CleverC2200/dsh-agent-workbench/releases/tag/v0.1.105)、GEA [0.0.282](https://github.com/CleverC2200/dsh-gea-plugin/releases/tag/v0.0.282)，配套Manage [0.6.3-company.69](https://github.com/CleverC2200/dsh-agent-manage/releases/tag/v0.6.3-company.69)。
- 修复PR及固定合并提交的主线CI通过；三包预检、隔离官方安装及Host/client接收通过。
- 测试频道revision 116、正式频道revision 108均通过生产来源完整下载与SHA-256核验。
- 用户设备的真实提交、退回和DMS业务结果待验收；本轮没有生产业务写入。
