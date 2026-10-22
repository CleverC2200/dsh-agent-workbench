# 当前未备单订单缺货接入

基地、分仓、全链及产销协同继续走现有统一 GEA SQL。本文只复用“设计系统 MCP 权限控制方案”对话核实的三层业务计算，不调用 Cube，也不新增数据库表。

## 计算与范围

1. 库存池 + 订单 + SKU：`remaining = max(sum(adjust_order_qty) - sum(qtyallocated), 0)`。
2. 库存池 + SKU：`shortage = max(sum(remaining) - sum(available_qty), 0)`；同一池的库存只扣一次。
3. 基地、分仓及全国：直接累加 SKU 缺口，不再次截零、不跨 SKU 抵消。

未备单状态共 11 种：等待组波、组波中、组波完成、组波失败、提交成功、提交中、提交失败、上传验证、人工释放占用、撤回待改单、创建。备单完成并下发 WMS 的订单不计需求。短拨、调账已由同步层排除，不根据 timeout_name 再筛一次。数量空值按 0；源读取或权限失败不按 0。

订单需求与占用均来自同一状态、同订单的执行明细，按已确认箱口径。保留创建较早但仍有效的订单，不截断到本月或近 60 天。本查询表示当前状态，不能按历史页面日期重建过去的当前缺口。

基地缺货库存池仅将分类 01/02 按 belong_base 名称合并；分仓分类 20 按 warehouseid 独立。这个范围只用于缺货计算，不改变页面其他现库存、周转或历史履约指标的既有统计范围。订单 pickup_point 经出入库表唯一仓库—提货点映射关联，不能直接与 warehouseid 相等连接。

无订单的已知库存池保留 0。库存池存在但某需求 SKU 没库存行按 0 库存；缺库存快照、缺地点映射、非零库存批次重复时保留异常，不编造缺口。执行源整表为空时按来源不可用处理，避免同步期间清空导致卡片显示假 0。

## 源表字段

| 表                                   | 字段                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agents_scm_execute_detail_d          | cust_order_no、material_code、material_name、pickup_point、pickup_point_name、belong_base、bizflowstatus、adjust_order_qty、qtyallocated                                              |
| agents_scm_inventory_sku_data_d      | month_date、warehouseid、warehouse_name、belong_base、material_code、material_name、prod_date、sap_warehouseid、plant、quality_batch、is_good_prod、warehouse_classify、available_qty |
| agents_scm_material_in_out_summary_d | warehouseid、pickup_point、material_code、product_categ_name、material_group_name                                                                                                     |

字段已发布不等于人员及 Agent 拥有有效行范围；中间分组字段仍须发布。授权拒绝保留服务端错误，不换身份、不切换通道重试。

## 页面与配置

[源 SQL](../business/shared/current-shortage-source.sql)保留已验证三层计算的语义，使用受控 SQL 支持的 CASE、CAST 和具名来源。通过[生成器](../scripts/update_current_shortage_sql.py)写入各 Agent 独立的 sql.config.json；页面仍只向 Host 提交配置查询 ID 和业务参数。

- 基地：当前订单卡片、基地列表和当前页 SKU 字段。
- 分仓：当前订单卡片、当前缺货列表。共享库存缺口只能展示到分仓 + SKU，不能分摊至订单。
- 全链：当前未备单需求、基地与分仓各自当前缺货、订单缺口列表。
- 产销协同：原“备单与占用”来源接入当前未备单需求、自身占用及缺货；月累计订单满足率与累计缺货保持原期间口径。

卡片由 SQL 直接按完整范围汇总；列表默认 10 行，翻页重新查询。列表计数与当前页在同一条 SQL 内读取，空页仍返回总数。SKU 列表仅查询当前库存页涉及的 SKU，不下载全部明细后在页面计算。

## 验证

[源 SQL 边界测试](../scripts/test_current_shortage_source.py)在隔离 SQLite 中直接执行交付 SQL，覆盖 13 个场景；既有 51 项 SQL 回归通过。四个 Agent 的本地直连汇总与上游发布核验值一致：2026-10-21 基地缺货 206,794 箱、分仓缺货 10,888.8 箱。这些是核验时快照，不是固定常量。

正式 GEA 初次 FIELD_NOT_PUBLISHED 已在字段发布后解除。之后新委托中，库存、出入库映射简单查询成功，订单执行表简单查询仍返回 AUTHORIZE/ROW_SCOPE_DENIED；此时尚不能宣布正式取数、客户端效果或发版完成。最终交付以本次运行回执为准。

## 2026-10-22 正式复验

用户修复授权后，四个 Consumer 的正式 GEA SQL 汇总、地点、前两页明细及基地品类/SKU共 18 项读取成功，返回字段无拒绝，逐项与同期直连结果一致。基地缺口 192,238 箱、分仓缺口 15,039.8 箱。此前 ROW_SCOPE_DENIED 保留为历史观察，不再是当前阻塞项。

当前缺货列表复用原业务列表组件，保留统一筛选、列设置和服务端分页，默认10行。缺字段的模型结果仍拒绝作为完整范围，已知零值保留0。CI 按受影响测试准备 uv，不跳过 Python 业务回归。
