# Agent 缺失字段清单

核对日期：2026-10-20。范围：全链库存、基地库存、分仓库存、产销协同工作台。依据本轮已核对的 26 张 `agents` 非宽表；每个字段一行。

“缺等价来源”表示当前同步表未提供老版所需的同粒度字段组合，不表示整张业务表都没有。下列老版表名是插件 SQL 中实际引用的资源表；未取得这些资源更上游的物理业务表映射，不推测上游表名。

## 缺少等价同步来源的字段

| 业务 Agent                                   | 缺失字段                 | 老版来源表字段与当前情况                                                                                                                                     |
| -------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 全链库存、基地库存、产销协同工作台           | 基地批次货龄             | `agents_scm_inventory_age.productage`；当前 `agents_scm_inventory_sku_data_d.age_days` 为最大库龄，不能代替批次货龄计算库存加权平均。                        |
| 全链库存、基地库存、产销协同工作台           | 基地批次剩余库存数量     | `agents_scm_inventory_age.qty`；需要与批次货龄属于同一库存快照，当前 SKU 汇总量不能替代。                                                                    |
| 全链库存、基地库存、产销协同工作台           | 基地批次库存快照日期     | `agents_scm_inventory_age.snapshot_date`；缺与上述批次数量关联的日期，现有 SKU 快照日期不能补出批次分布。                                                    |
| 全链库存、基地库存、产销协同工作台           | 基地批次库存快照时间     | `agents_scm_inventory_age.snapshot_time`；老版用来选择同日最新批次快照，避免重复汇总。                                                                       |
| 全链库存、分仓库存、产销协同工作台           | 分仓现存批次生产日期     | `agents_scm_branch_inventory_snapshot.prod_date`；新增出入库表 `agents_scm_material_in_out_summary_d.prod_date` 是流水维度，尚不能与同快照剩余库存一一对应。 |
| 全链库存、分仓库存、产销协同工作台           | 分仓现存批次数量         | `agents_scm_branch_inventory_snapshot.live_qty`；当前出入库数量不足以还原同快照剩余库存，不能代算平均货龄和 FIFO。                                           |
| 全链库存、分仓库存、产销协同工作台           | 分仓现存批次可用数量     | `agents_scm_branch_inventory_snapshot.available_qty`；缺批次粒度的可用量，已有仓库 SKU 可用总量保留使用。                                                    |
| 全链库存、分仓库存、产销协同工作台           | 分仓批次库存快照日期     | `agents_scm_branch_inventory_snapshot.snapshot_date`；需要与生产日期、剩余量、可用量属于同一批次快照。                                                       |
| 全链库存、基地库存、分仓库存、产销协同工作台 | 当前待发订单快照时间     | `agents_scm_branch_pending_order.source_snapshot_time`；月累计履约和日库存快照均不能替代当前订单阶段快照。                                                   |
| 全链库存、基地库存、分仓库存、产销协同工作台 | 当前待发订单阶段         | `agents_scm_branch_pending_order.order_stage`；老版区分 `PREPARING`、`PREPARED_UNSHIPPED`，当前同步来源缺等价阶段明细。                                      |
| 全链库存、基地库存、分仓库存、产销协同工作台 | 当前阶段订单数量         | `agents_scm_branch_pending_order.order_qty`；现有 `agents_scm_stock_detail_d.ordered_qty` 已用于基地未备单量，但不能还原当前订单逐单、分阶段数量。           |
| 全链库存、基地库存、分仓库存、产销协同工作台 | 当前阶段订单占用数量     | `agents_scm_branch_pending_order.allocated_qty`；库存汇总中的占用量已展示，仍缺与当前订单阶段对应的占用明细。                                                |
| 全链库存、基地库存、分仓库存、产销协同工作台 | 当前待发执行订单号       | `agents_scm_branch_pending_order.executeorderno`；缺当前待发快照内的订单关联，历史履约单号不能作为当前待发订单数。                                           |
| 基地库存                                     | 当前待发订单业务状态     | `agents_scm_branch_pending_order.bizflowstatus`；老版基地查询据此筛选已下发订单，当前库存汇总没有同等订单状态。                                              |
| 分仓库存                                     | 当前待发订单要求交付时间 | `agents_scm_branch_pending_order.required_delivery_at`；需与当前待发订单逐单关联，用于交付紧急程度，不能用历史发货日替代。                                   |

产销协同已按用户确认采用缺失数值补 0 的汇总规则；下列来源缺口仍保留用于后续同步，不再因为个别数值缺失阻断整个指标计算。分母合计为 0 的比例及查询权限错误不按 0 展示。

## 已有同步字段但数据仍为空

| 业务 Agent                         | 缺失字段数据         | 来源表字段及核对结果                                                                                                                                |
| ---------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全链库存、分仓库存、产销协同工作台 | 同步分仓计划月份     | `agents_scm_warehouse_transfer_plan_data_d.plan_month`，2353 条记录全部为空；老版对应 `agents_scm_branch_plan.target_month`。                       |
| 全链库存、分仓库存、产销协同工作台 | 同步分仓计划快照日期 | `agents_scm_warehouse_transfer_plan_data_d.snapshot_date`，2353 条记录全部为空；老版对应 `agents_scm_branch_plan.plan_snapshot_date`。              |
| 全链库存、分仓库存、产销协同工作台 | 同步分仓计划版本     | `agents_scm_warehouse_transfer_plan_data_d.plan_version`，2353 条记录全部为空；老版对应 `agents_scm_branch_plan.plan_version`。                     |
| 全链库存、分仓库存、产销协同工作台 | 同步分仓计划来源     | `agents_scm_warehouse_transfer_plan_data_d.plan_source`，2353 条记录全部为空；老版对应 `agents_scm_branch_plan.plan_source`，仍需识别有效同步计划。 |
| 全链库存、分仓库存、产销协同工作台 | 同步分仓计划数量单位 | `agents_scm_warehouse_transfer_plan_data_d.plan_qty_unit`，2353 条记录全部为空；源计划、在途量不能仅凭“件等于箱”推定原始计量单位。                  |
| 产销协同工作台                     | 销售原始提报数量     | `agents_scm_demand_sales_f.order_qty_origin`，10 月 32 条记录为空；字段已存在，需补相应记录。                                                       |
| 产销协同工作台                     | 销售／需求基地归属   | `agents_scm_demand_sales_f.belong_name`，10 月 312 条记录为空；基地字段已接入，需补未归属记录。                                                     |
| 全链库存、基地库存、产销协同工作台 | 基地仓可用库存数量   | `agents_scm_inventory_sku_data_d.available_qty`；2026-10-19 基地仓快照 3948 个仓库 SKU 组中 1 组缺值，其余有值部分已展示。                          |
| 全链库存、基地库存、产销协同工作台 | 基地仓备单占用数量   | `agents_scm_inventory_sku_data_d.pack_unit_qty`；2026-10-19 基地仓快照 3948 个仓库 SKU 组中 1 组缺值，其余有值部分已展示。                          |
| 全链库存、基地库存、产销协同工作台 | 基地仓冻结库存数量   | `agents_scm_inventory_sku_data_d.freeze_qty`；2026-10-19 基地仓快照 3948 个仓库 SKU 组中 1 组缺值，其余有值部分已展示。                             |

补货周期、人工补货计划、导入、审批等配置和业务交互数据不列为大数据缺失指标。上表计划项仅指现有同步表的元数据，不要求把人工填写或导入的计划改成大数据来源。平均货龄、待补货量等派生指标不重复当作缺失字段列出。

真实的 0、异常值属于数据质量问题；GEA 未授权属于权限问题，均不算缺列。此表是上述核对时点的结果，不代表源数据永久缺失。

核对依据：[本轮数据核对记录](four-agents-data-refresh-20261020.md)、[分仓及准确率来源核对](fc-accuracy-source-recheck-20261020.md)，以及各插件保留的老版 SQL 模板。

## 需求预测补充核对（2026-10-20）

需求预测达成率已补接公司／基地月度纠偏计划；需求预测准确率剩余的是字段内容和物料关联问题，不是缺权限或缺列。逐字段见[需求预测两项指标核对](aps-demand-plan-recheck-20261020.md)。

分仓红框卡片已按当前31张非宽表再次核对，字段和不可计算原因见[分仓红框指标缺值复核](fc-missing-cards-recheck-20261020.md)。新增执行表已有订单状态，但分仓归属、数量单位与状态快照仍需明确，不再笼统描述为“完全没有订单状态”。
