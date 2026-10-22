# 分仓卡片与列表复核

核对日期：2026-10-20。范围：新版 Workbench 分仓 HTML 插件。已检查当前32张 `agents` 非宽表结构，深入核对库存、分仓计划、发货、出入库、订单执行和缺货追踪。只改取数与显示，不修改底层表。

## 已接入与修复

| 内容 | 当前结果与来源 |
| --- | --- |
| 列表完整性 | 计划表2,366个仓库SKU与分仓快照1,761个仓库SKU按编码合并、去重，共2,574行；补回208个只有库存的仓库SKU及8,096.167箱库存。 |
| 库存核对 | `agents_scm_inventory_sku_data_d` 的2026-10-19分仓快照：17个仓库、274,128.806箱现库存、207,831箱可用、66,350箱备单占用、0箱冻结；合并计划后库存总数不变。 |
| 调拨数量 | `agents_scm_warehouse_transfer_plan_data_d.transfer_prepare_qty` 42,311箱、`transfer_onway_qty` 1,088,915箱、`warehouse_transfer_qty` 1,131,226箱。用户已确认三项均为箱，1件=1箱；全部2,366行的调拨中量均等于备单加在途，只扣减一次。 |
| 补货测算 | 沿用原固化规则：7天补货周期＋3天备货。有效月出货计划优先，否则用近30日正向发货日均；目标库存=日均×10，按原规则四舍五入。建议=max(目标－可用库存－调拨中量,0)。源计划重复的行不作补货判定。 |
| 补货结果 | 当前111箱、15个仓库SKU，其中9个紧急。1,812行使用历史发货测算，762行无日均需求按0，0行有可核对的有效月计划。紧急条件为需补货且可用＋调拨中量不足3日日均需求。该结果是建议测算，没有产生业务下单。 |
| 列表字段 | 补接30日日均、可用库存回顾周转、测算日均、目标库存、建议补货量、紧急标志、测算可供天数、目标库存差异量、补货周期7天、安全库存天数10天、调拨备单和在途，以及逐行计算依据。产品名、物料组优先现有唯一值，按同仓库SKU补关联发货和出入库信息。 |
| 回顾周转 | 按老版定义使用可用库存，汇总为有正向发货日均的同一范围可用库存÷对应日均，当前12.23天；零分母保留未知。 |
| 订单主值 | 展示本月截至10月20日的2,770单，明确月累计范围；当前待发量单独保留，避免把历史履约算成实时待发。 |
| 翻页 | 默认10行；翻页重新执行SQL，原子返回页数据与总行数。卡片汇总在SQL计算，不由当前页外推。 |

正式计划的真实0仍优先于历史测算；缺失数量参与合计时按0，保留来源行与计算依据。权限错误、重复来源及零分母不会伪装成成功的0。

## 仍需补充的大数据源字段

每个字段一行。老版名称来自保留的 SQL 模板和字段合同；尚未获得更上游物理业务表映射，不编造表名。新增执行表已有部分字段，缺的是可核对的分仓归属、时间和单位组合。

| 业务Agent | 缺失字段 | 老版来源表字段与当前同步源情况 |
| --- | --- | --- |
| 分仓库存 | 现存批次生产日期 | 老版 `agents_scm_branch_inventory_snapshot.prod_date`；当前 `agents_scm_material_in_out_summary_d.prod_date` 只有生产日期维度，未提供同一库存快照的现存批次分布。 |
| 分仓库存 | 现存批次数量 | 老版 `agents_scm_branch_inventory_snapshot.live_qty`；当前累计出入库结余与库存快照仅1,256/1,761个仓库SKU一致，其余505个不一致，不能据此计算全部平均货龄。 |
| 分仓库存 | 现存批次可用数量 | 老版 `agents_scm_branch_inventory_snapshot.available_qty`；当前 `agents_scm_inventory_sku_data_d.available_qty` 是仓库SKU合计，缺批次可用量。 |
| 分仓库存 | 现存批次快照日期 | 老版 `agents_scm_branch_inventory_snapshot.snapshot_date`；当前出入库表没有相应快照日期，不能直接关联日库存还原批次。 |
| 分仓库存 | 当前待发订单分仓归属 | 老版 `agents_scm_branch_pending_order.pickup_point`；新增 `agents_scm_execute_detail_d` 无分仓编码，`belong_base` 是基地，不能替代分仓。 |
| 分仓库存 | 当前待发状态快照时间 | 老版 `agents_scm_branch_pending_order.source_snapshot_time`；新增执行表 `header_addtime` 是创建时间，不能确定状态快照。 |
| 分仓库存 | 当前待发订单阶段 | 老版 `agents_scm_branch_pending_order.order_stage`；新增执行表 `bizflowstatus` 需与当前分仓归属、状态时点一起核对后才能分PREPARING与PREPARED_UNSHIPPED。 |
| 分仓库存 | 当前待发订单箱数量 | 老版 `agents_scm_branch_pending_order.order_qty`；新增执行表有 `order_qty`、`adjust_order_qty`，但缺与当前分仓订单对应的箱单位换算；与月履约直接匹配的原始数量也不等于箱数量。 |
| 分仓库存 | 当前阶段订单已分配箱数量 | 老版 `agents_scm_branch_pending_order.allocated_qty`；新增执行表 `qtyallocated` 有值，但缺同分仓、同状态时点的箱换算，不能用库存占用合计替代订单阶段占用。 |
| 分仓库存 | 当前待发执行订单关联 | 老版 `agents_scm_branch_pending_order.executeorderno`；当前执行表虽然有单号，但与分仓月履约精确匹配范围有限，不能据此穷举实时待发订单。 |
| 分仓库存 | 当前待发要求交付时间 | 老版 `agents_scm_branch_pending_order.required_delivery_at`；仍需与当前待发分仓订单逐单关联。 |
| 分仓库存 | 本月调拨入库日期 | 老版 `agents_scm_branch_operation_fact.period_month`、`business_date`，配合 `metric_group=branch_activity`、`metric_name=month_received_qty`、`metric_value`；当前出入库表只有生产日期，不能限定调拨在本月入库。 |
| 分仓库存 | 本月调拨业务类型及阶段数量 | 老版 `agents_scm_branch_operation_fact.metric_name` 的 `month_received_qty`、`month_pending_qty`、`month_shipped_qty` 及 `metric_value` 分阶段取数；当前累计出入库与跨月调拨中量不能代替本月已调拨，需同一调拨单行、业务类型及日期明细。 |
| 分仓库存 | 同步计划月份 | `agents_scm_warehouse_transfer_plan_data_d.plan_month`，2,366行全空；老版 `agents_scm_branch_plan.target_month`。 |
| 分仓库存 | 同步计划快照日期 | `agents_scm_warehouse_transfer_plan_data_d.snapshot_date`，2,366行全空；老版 `agents_scm_branch_plan.plan_snapshot_date`。 |
| 分仓库存 | 同步计划版本 | `agents_scm_warehouse_transfer_plan_data_d.plan_version`，2,366行全空；老版 `agents_scm_branch_plan.plan_version`。 |
| 分仓库存 | 同步计划来源 | `agents_scm_warehouse_transfer_plan_data_d.plan_source`，2,366行全空；老版 `agents_scm_branch_plan.plan_source`。 |
| 分仓库存 | 同步计划单位元数据 | `agents_scm_warehouse_transfer_plan_data_d.plan_qty_unit`，2,366行全空；用户已确认的三项调拨数量按箱使用，不再等待此列补齐。 |
| 分仓库存 | 同步月调拨计划量 | `agents_scm_warehouse_transfer_plan_data_d.warehouse_month_transfer_plan` 全空；当前 `warehouse_month_out_plan`、`future30_avg_plan`、`warehouse_future30_qty` 均为0且缺计划日期，不能将其认作有效本月或次月计划。 |

实际补货量、人工月计划、导入、备注、审批、个别仓库/SKU周期覆盖等由业务交互或配置产生，不列为大数据同步缺失。待补货量、平均货龄等派生指标也不重复作为缺列。

## 验证

- 36项Python SQL回归通过；39项配置、日期、概览回归通过，覆盖库存独有行、缺值按0、重复计划、正式0计划优先、闰年月份和原子分页。
- 四条新查询通过当前登录用户的正式GEA通道，每条请求列均获返回，无拒绝列；与直连结果逐列比较一致。单条GEA往返本次约1.9—2.4秒，直连约0.6—0.9秒；此为四条查询的单次观察，不是整页生产性能结论。
- 本地只读预览首屏卡片约2.15秒、列表约2.16秒、翻页约0.94秒；1440和390像素布局通过，无整页横向溢出，列表保留内部横向滚动。以上页面速度使用直连预览，不能替代本地GEA整页计时。
- 本次为源码修复和预览验证，尚未制作新发行包，也未覆盖已安装的0.1.19发行产物。
