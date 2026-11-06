<!-- collaboration-record
{"kind":"change","id":"CHANGE-20261106-inventory-metric-definitions","date":"2026-11-06","title":"库存指标说明与实际计算一致","module":"库存管理","status":"已发布待验收"}
-->
# 库存指标说明与实际计算一致

相对Workbench0.1.76修正三处旧说明：含渠道库存仅增加客户在仓；公司周转使用同范围库存与匹配动销合并重算；基地及公司满足率使用逐行限额发货量除以同一已发货订单池原订货量。此前主线已实现这些计算，本次只修正说明，避免误读为在仓加在途或基地单层口径。

目标Workbench0.1.77，配套GEA0.0.250，Manage0.6.3-company.56复用已发布不可变归档。Core和权限不变。不根据无法获得的外部报表反推或调整满足率，跨出口数值差异尚未对账。

受影响回归：11项指标及浏览器检查通过，包含两种视口的提示可读性；三处TSX解析和增量格式、lint通过。正式主线CI、固定源码三包预检、发布来源下载结果另留回执。

提交前核对库存缓存、同批次及有效记录汇总历史修复，最终差异仅说明、对应浏览器预期、版本和发布记录；未取消功能、删除测试或修改公式。已整合最新主线，保留其他模块已合入改动。本机发布Skill1.3.0为local_draft，未声称团队同步。

## 发布回执

已发布Workbench0.1.77、GEA0.0.250；Manage0.6.3-company.56复用归档。源码分别固定在178426a6f676dfcdf5a56a335b6dd31a49b76b42、273d5ccd932644022212a006029aa234e5f4a7ac。

- [Workbench发行与下载](https://github.com/CleverC2200/dsh-agent-workbench/releases/tag/v0.1.77)
- [GEA发行与下载](https://github.com/CleverC2200/dsh-gea-plugin/releases/tag/v0.0.250)
- [复用Manage发行](https://github.com/CleverC2200/dsh-agent-manage/releases/tag/v0.6.3-company.56)

两仓正式CI、固定源码构建、最终页面内容、完整三包发布预检及隔离Host安装接收通过。test revision96、stable revision88经生产更新器check/download回读，三包版本、完整摘要与兼容校验通过。未进行正式客户端Native升级、跨账号业务验收或外部报表对账；这些边界不影响本次指标提示修正的归档校验。
