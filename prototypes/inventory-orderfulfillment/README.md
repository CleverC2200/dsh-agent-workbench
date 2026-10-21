# 订单履约来源与运行 / Fulfillment source and runtime

当前入口为 live-entry.js，使用相邻 [SQL配置](../../business/inventory-orderfulfillment/sql.config.json) 和 order01 当前用户 GEA 受控只读通道。指标、权限、数据缺口和验收范围见 [接入合同](../../docs/order-fulfillment-data.md)。默认本日按源创建时间筛选。无权限、缺字段和失败不回退模拟数或数据库直连。

source.html / SOURCE.json 是固定原基线输入，保留原17行算法和来源摘要。presentation.html / PRESENTATION.json 是用户附件衍生的可维护演示参考；构建保留其原有布局、卡片、图表区域、筛选位置、明细列与弹窗结构，只清除样例值和模拟脚本。数据通过 live-entry.js 绑定到原位置，不重排界面；销售确认写入仍未接入。source 与旧 entry/state 文件保留为原型参考，不参与当前数据发布。

The current live entry preserves the authored layout and binds granted data in place. Sample values and mock calculations are removed; no replacement dashboard is created. Manage owns the complete prompt, seven domain Skills, semantic reference and original-prompt provenance. Workbench manifest ordering matches the profile. Current facts are queried through the existing Host channel; model questions use the public quotePage draft contract without creating another conversation.

构建：`node scripts/build-order-fulfillment.mjs`。原型引用和说明中的演示值不是当前事实。飞书回调、每小时提醒和 OMS/WMS/TMS 写入不属于本只读面板。

Build and source SQL replay do not prove Gateway publication, real-user permissions, official Loader reception or installed-client acceptance. Identity, Session and filters invalidate old results and references.
