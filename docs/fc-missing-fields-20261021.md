# 分仓当前订单缺失字段

核对时间：2026-10-21。范围：ai_db 中 32 张 agents 开头的非宽表，不将用户导入、草稿或确认操作产生的数据列为同步缺失。

| 业务 Agent | 缺失字段/数据 | 来源表字段核对结果 |
| --- | --- | --- |
| 分仓库存 | 当前待发订单量 | `agents_order_execute_isontime_mi.need_qty_origin`、`qtyshipped` 是履约历史；当前分仓样本的 `complete_time` 均有值，不能由月累计需求减发货推断全部当前待发。 |
| 分仓库存 | 当前备单中订单量 | `agents_order_execute_isontime_mi.bdwctime` 是完成时间，`pack_unitqty` 是占单量，均不等于当前 PREPARING 阶段的订单量；`agents_scm_warehouse_transfer_plan_data_d.transfer_prepare_qty` 是调拨备单，不能替代销售订单备单。 |
| 分仓库存 | 当前订单剩余待发量 | 缺少订单行状态及同一时点剩余量快照；`agents_scm_cust_plan_order_analysis_d.unship_qty` 有客户×SKU未发量，但缺少可唯一分配到分仓的订单行归属。 |
| 分仓库存 | 当前订单缺货量 | 缺少上述当前订单剩余量；`agents_order_execute_isontime_mi.outqty` 是履约口径缺货，`agents_scm_inventory_sku_data_d.pack_unit_qty` 是库存备单占用，不能相加或替代。 |

页面按用户要求将缺失的“当前订单”显示为 0，并在卡片提示中说明“缺失按0，不代表实际没有待发订单”。网关拒绝、权限不足或查询失败仍保留失败状态，不转换为0。月累计缺货量与库存备单占用保留各自来源。

模板下载、Excel导入、补货实际数量、调整原因、草稿和提交导出属于交互功能，已恢复为本地试算及文件交付，不写入大数据底表。
