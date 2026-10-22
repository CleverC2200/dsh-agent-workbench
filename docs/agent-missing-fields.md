# Agent 缺失字段清单

核对日期：2026-10-21。范围：全链库存、基地库存、分仓库存、产销协同工作台、经销商库存。已复查当前 ai_db 可见的32张 `agents` 非宽表及字段回灌；每个字段一行。新增来源与实际补充数量见[本轮核对](agent-new-source-tables-20261021.md)。

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
| 全链库存、分仓库存、产销协同工作台 | 同步分仓计划月份     | `agents_scm_warehouse_transfer_plan_data_d.plan_month`，2375 条记录全部为空；老版对应 `agents_scm_branch_plan.target_month`。                       |
| 全链库存、分仓库存、产销协同工作台 | 同步分仓计划快照日期 | `agents_scm_warehouse_transfer_plan_data_d.snapshot_date`，2375 条记录全部为空；老版对应 `agents_scm_branch_plan.plan_snapshot_date`。              |
| 全链库存、分仓库存、产销协同工作台 | 同步分仓计划版本     | `agents_scm_warehouse_transfer_plan_data_d.plan_version`，2375 条记录全部为空；老版对应 `agents_scm_branch_plan.plan_version`。                     |
| 全链库存、分仓库存、产销协同工作台 | 同步分仓计划来源     | `agents_scm_warehouse_transfer_plan_data_d.plan_source`，2375 条记录全部为空；老版对应 `agents_scm_branch_plan.plan_source`，仍需识别有效同步计划。 |
| 全链库存、分仓库存、产销协同工作台 | 同步分仓计划数量单位 | `agents_scm_warehouse_transfer_plan_data_d.plan_qty_unit`，2375 条记录全部为空；此列仍空；用户已确认调拨备单、在途和调拨中量均为箱，三项已接入补货测算；该空列不再阻断这三项数量。                  |
| 产销协同工作台                     | 销售原始提报数量     | `agents_scm_demand_sales_f.order_qty_origin`，10 月销售口径 32 条记录为空；基地口径已全部有值。字段已存在，需补相应记录。                                                       |
| 产销协同工作台                     | 销售／需求基地归属   | `agents_scm_demand_sales_f.belong_name`，10 月销售口径 312 条记录为空；基地口径 5645 条全部有值。字段已接入，需补未归属记录。                                                     |

补货周期、人工补货计划、导入、审批等配置和业务交互数据不列为大数据缺失指标。上表计划项仅指现有同步表的元数据，不要求把人工填写或导入的计划改成大数据来源。平均货龄、待补货量等派生指标不重复当作缺失字段列出。

真实的 0、异常值属于数据质量问题；GEA 未授权属于权限问题，均不算缺列。此表是上述核对时点的结果，不代表源数据永久缺失。

核对依据：[本轮数据核对记录](four-agents-data-refresh-20261020.md)、[分仓及准确率来源核对](fc-accuracy-source-recheck-20261020.md)，以及各插件保留的老版 SQL 模板。

## 需求预测补充核对（2026-10-20）

需求预测达成率已补接公司／基地月度纠偏计划；需求预测准确率剩余的是字段内容和物料关联问题，不是缺权限或缺列。逐字段见[需求预测两项指标核对](aps-demand-plan-recheck-20261020.md)。

分仓已按当前32张非宽表复查并补充卡片、列表及补货测算，剩余来源条件见[分仓红框指标缺值复核](fc-missing-cards-recheck-20261020.md)。新增执行表已有订单状态，但分仓归属、数量单位与状态快照仍需明确，不再笼统描述为“完全没有订单状态”。

## 其余插件列表补充（2026-10-20）

客户计划库存分析表现已回灌，已启用经销商、全链和产销协同列表，并补充严格匹配的客户SKU参考目标与平均货龄。基地SKU近30日实际发货、三页库存流转的16个源字段和默认显示列同步补接。当前仍需发布的字段、部分空值与来源缺口见[其余Agent列表补充与剩余字段](agent-list-data-completion-20261020.md)；该记录取代“客户分析表为空、未开放”的旧结论，其它历史条目仍以各自核对时点为准。


## 最新回灌与发布缺口（2026-10-21）

10月20日基地仓3925条库存记录的 `available_qty`、`pack_unit_qty`、`freeze_qty` 均已有值，已移出缺失清单。客户分析最新来源日为10月21日，219264条记录；下列为空的数量不代表整列未接入。

| 业务 Agent | 缺失或受限字段 | 来源表字段与本次核对结论 |
| --- | --- | --- |
| 产销协同工作台 | 基地逐SKU纠偏计划有效内容 | `agents_scm_demand_sales_f.plan_qty_adjusted`，10月基地口径5645条全部为0；已存在、已授权，不能用非空率认定已补齐有效计划。 |
| 产销协同工作台 | 准确率跨表物料替代关联 | `agents_dim_product_list_mi.replacement_material_code` 全空；不同物料承接同一计划时，不能逐SKU任意拼接计算绝对偏差。 |
| 经销商库存、全链库存、产销协同 | 分析目标库存的部分记录 | `agents_scm_cust_plan_order_analysis_d.target_inventory`，最新219264条中85380条为空。 |
| 经销商库存、全链库存、产销协同 | 分析平均货龄的部分记录 | `agents_scm_cust_plan_order_analysis_d.avg_stock_age`，最新219264条中133486条为空。 |
| 经销商库存、全链库存、产销协同 | 分析标签周转标准的部分记录 | `agents_scm_cust_plan_order_analysis_d.label_turnover_days`，最新219264条中132328条为空。 |
| 经销商库存、全链库存、产销协同 | 源货龄周转状态 | `agents_scm_cust_plan_order_analysis_d.stock_age_turnover_status`，最新219264条全部为空。 |
| 五个HTML Agent | 新增商品名称的GEA发布 | `agents_dim_material_prod_sales_info_d.goods_name`，物理表7379个SKU有名称；五个Consumer均返回 `FIELD_NOT_PUBLISHED`。这是发布缺口，不是缺列；未加入主查询。 |
| 经销商库存、全链库存 | 源大日期库存数量的GEA发布 | `agents_scm_cust_jxc_ai_daliy_d.big_final_qty`，仍返回 `FIELD_NOT_PUBLISHED`，保留已有主库存取数，不绕过网关。 |

本轮已接入产品清单的唯一SKU名称及分仓空白物料组；没有用营销分类替换生产分类，没有把年度需求、产能标准、调拨方向当作当前实物库存或实时订单。
