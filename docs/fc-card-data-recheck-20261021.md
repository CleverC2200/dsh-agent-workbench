# 分仓卡片取数复核（2026-10-21）

正式 GEA Consumer `branch-inventory` 的库存、补货、订单三条汇总均成功，返回字段未被裁剪，与直连核对一致。最新 ai_db 仍为 32 张 agents 表，相比同日已核目录无新增字段或表。本轮不改底层表结构，也不增加页面查询。

## 已接入卡片

| 显示项       | 来源表字段                                      | 核对结果                                                                                             |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 本月缺货量   | `agents_order_execute_isontime_mi.outqty`       | 分仓、本月截至读取日、沿用订单排除规则；16,163 箱。不能作为当前待发缺货量。                          |
| 库存备单占用 | `agents_scm_inventory_sku_data_d.pack_unit_qty` | 2026-10-20 库存快照、17 个分仓、1,701 个仓库 SKU；86,814.2 箱。不是调拨备单或 PREPARING 阶段订单量。 |

页面此前将两个辅助项固定为 `null`。本轮绑定已有汇总并明确名称；当前订单主值仍待当前待发源，避免用月累计或库存占用替代。权限失败保留错误及 `-`，不当作 0；既有业务缺值按 0 参与补货汇总的规则不变。

## 仍缺字段（一个字段一行）

下列 `agents_scm_branch_*` 为原版读取的业务表，当前 ai_db 未承接；不能通过猜测源列构造等价结果。

| 业务 Agent | 缺失字段/数据        | 原版来源表字段/现有来源问题                                                                                                                    |
| ---------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 分仓库存   | 当前待发订单需求量   | `agents_scm_branch_pending_order.order_qty`；当前 ai_db 无该表。                                                                               |
| 分仓库存   | 当前待发订单阶段     | `agents_scm_branch_pending_order.order_stage`；需区分 PREPARING、PREPARED_UNSHIPPED，现有 `agents_scm_execute_detail_d.bizflowstatus` 不等价。 |
| 分仓库存   | 当前待发订单已分配量 | `agents_scm_branch_pending_order.allocated_qty`；不能用调拨备单、库存占用或月累计占单量替代。                                                  |
| 分仓库存   | 当前订单所属提货点   | `agents_scm_branch_pending_order.pickup_point`；现有执行明细无此列，与分仓履约关联仅匹配到 OCP已下发记录，不能认定为当前待发。                 |
| 分仓库存   | 当前待发数据快照时间 | `agents_scm_branch_pending_order.source_snapshot_time`；现有明细只有订单创建时间，不等于当前状态快照。                                         |
| 分仓库存   | 批次现存量           | `agents_scm_branch_inventory_snapshot.live_qty`；当前 ai_db 无该表。                                                                           |
| 分仓库存   | 批次生产日期         | `agents_scm_branch_inventory_snapshot.prod_date`；最大库龄不能反推批次分布。                                                                   |
| 分仓库存   | 批次库存快照日期     | `agents_scm_branch_inventory_snapshot.snapshot_date`；需与批次现存量为同一快照。                                                               |
| 分仓库存   | 有效计划月份         | `agents_scm_warehouse_transfer_plan_data_d.plan_month`；2,375 条均空。                                                                         |
| 分仓库存   | 有效计划快照日期     | `agents_scm_warehouse_transfer_plan_data_d.snapshot_date`；2,375 条均空。                                                                      |
| 分仓库存   | 有效计划版本         | `agents_scm_warehouse_transfer_plan_data_d.plan_version`；2,375 条均空。                                                                       |

## 暂不能计算的原因

- 展望周转：原版为现库存 ÷ 展望日均出货。当前 `future30_avg_plan`、`warehouse_future30_qty` 的 2,375 条记录均为 0，且缺有效期间；分母为 0 不显示虚构的 0 天。补货建议仍可沿用近 30 日实际发货测算。
- 滞库风险量：原版为达到 90 天的批次库存合计。尝试按 `agents_scm_material_in_out_summary_d.in_qty-out_qty` 重建结余，1,701 个库存仓库 SKU 中仅 1,524 个与快照数量一致，177 个不一致；该表也无库存快照日期，不能把累计进出库结余冒充完整同日批次库存。
- 当前待发：现有 `agents_scm_execute_detail_d` 同时包含历史已发货、作废及组波状态，缺分仓提货点与同一状态快照。可关联到分仓履约的订单仍是“OCP已下发”，且原始数量、实占、发货量并非可直接互减的同一数量口径；不据此推算当前待发缺口。

验证证据保存在本地 `fc-missing/gateway-validation.json`、`profile.json`、`order-association.json`、`batch-balance.json`。文件不包含登录凭据。
