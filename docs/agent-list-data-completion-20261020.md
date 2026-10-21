# 其余 Agent 插件列表数据核对与补充

核对日期：2026-10-20。范围：新版基地库存、全链库存、经销商库存、产销协同工作台的HTML列表。沿用原页面布局和GEA身份通道，SQL仍各Agent一份配置，默认10行、翻页重新查询。保留此前分仓修复，不修改底层表结构。

## 已修复的列表问题

| 业务Agent | 修复内容 | 已核对来源 |
| --- | --- | --- |
| 基地库存 | 主SKU分页查询补接实际近30日正向发货合计，去掉适配器中强制置空；真实0保留0，不用日均销量反推发货总数。 | `agents_scm_cust_deliv_daily_di.belong_base/material_code/act_ship_date/act_dl_qty`，限定 `plant_flag=工厂`，按同基地SKU精确关联。 |
| 基地库存、全链库存、产销协同 | 基地产销日记录补出16个已经存在的源字段，默认显示列同步更新，避免查询已返回但页面仍隐藏。 | `agents_scm_stock_detail_d` 的 `avg_30d_send`、`pre_order_qty`、`begin_stock`、`base_transfer_in`、`wx_transfer_in`、`direct_transfer_qty`、`bp_sales_plan_v1`、`bp_sales_plan_adj`、`local_sales_main`、`local_sales_bp`、`other_base_direct_main`、`other_base_direct_bp`、`roll_total_plan`、`live_qty_sub_qty_order`、`turnover_days_stock`、`turnover_days_avail`。 |
| 全链库存 | 组织结构新增分仓库存与补货列表，复用本轮已验证的分仓查询，合并库存独有行；共2,574个仓库SKU。 | 分仓计划、分仓健康快照、仓库实际发货及唯一商品名称映射；明细见[分仓复核](fc-missing-cards-recheck-20261020.md)。 |
| 经销商库存、全链库存、产销协同 | 启用此前因空表而停用的客户计划库存分析列表；最新来源创建日10月20日，10月有218,399个客户SKU，涉及2,820个客户。按月选择截止日前最新来源日，原子返回10行及总数。 | `agents_scm_cust_plan_order_analysis_d` 当前总计32,420,946行；只查询所选月、所选来源日，不下载历史全表。 |
| 经销商库存、全链库存 | SKU日库存列表补充严格匹配的分析参考目标、平均货龄及标签周转标准，来源日单列。旧占位字段与默认列配置同步替换。 | 同客户SKU、同日同月、分析源键唯一且分析库存数量等于日库存时才关联。61,006行日库存中，5,576行满足条件，可补2,938行目标、2,264行平均货龄、1,996行标签周转标准。 |

客户分析与日库存是两套事实。10月18日有44,417个客户SKU可以按编码匹配，但只有5,576行库存数量相同。其余分析数据通过独立列表展示，未拿来覆盖日库存，也未据此自动生成订单。分析源的数量、金额和达成原值沿源显示，不擅自按财务预算、百分比或其他数量单位解释。

源记录重复时不重复汇总，也不任意挑一个目标或货龄。日库存没有对应分析记录时仍保留日库存行；已知数量0保持为0。平均货龄与最大库龄分列，未用周转天数代替货龄。

## 仍缺少或尚不能使用的同步字段

每个字段一行。已存在但部分记录为空、发布缺口、缺等价来源分别说明。人工填写、导入、审批、实际补货确认、任务派发等交互产物不列为大数据缺失指标。

| 业务Agent | 缺失或受限字段 | 来源表字段与本次核对结论 |
| --- | --- | --- |
| 经销商库存、全链库存 | 源大日期库存数量的GEA发布 | `agents_scm_cust_jxc_ai_daliy_d.big_final_qty` 在数据库中存在，但两个Consumer查询返回 `FIELD_NOT_PUBLISHED`。需发布到当前受控来源目录；不是整表无权限。主库存查询已撤去对该列的依赖，未用现库存减正常库存猜测。 |
| 经销商库存、全链库存、产销协同 | 分析目标库存的部分源记录 | `agents_scm_cust_plan_order_analysis_d.target_inventory`，最新10月20日的218,399行中140,495行有值；其余为空。字段已接入，不再记为整列缺失。 |
| 经销商库存、全链库存、产销协同 | 分析平均货龄的部分源记录 | `agents_scm_cust_plan_order_analysis_d.avg_stock_age`，最新来源日85,196行有值；其余为空。可用记录已独立展示，不能补给库存口径不一致的日表记录。 |
| 经销商库存、全链库存、产销协同 | 分析标签周转标准的部分源记录 | `agents_scm_cust_plan_order_analysis_d.label_turnover_days`，最新来源日89,208行有值；其余为空。 |
| 经销商库存、全链库存、产销协同 | 源货龄周转状态 | `agents_scm_cust_plan_order_analysis_d.stock_age_turnover_status`，最新来源日218,399行均为空；不擅自补一套阈值生成业务状态。 |
| 经销商库存、全链库存 | 临期批次生产日期 | 原插件临期计算需要客户SKU批次事实；现有客户日库存和分析平均货龄没有等价批次日期。尚无可核实的当前同步源表字段映射，不猜表名。 |
| 经销商库存、全链库存 | 临期批次剩余数量 | 需要与批次日期、客户SKU及同一库存时点对应的剩余量；`normal_stock_qty`、`avg_stock_age` 不能代替。大日期数量也不直接等同按保质期判定的临期批次量。 |
| 经销商库存、全链库存 | 批次保质期或到期日期 | 当前已核对的客户库存、分析表未提供同批次保质期事实，无法确定临期数量；不从平均货龄反推。 |
| 全链库存、基地库存、产销协同 | 基地现存批次货龄 | 老版 `agents_scm_inventory_age.productage` 所需的同快照批次分布仍缺；`agents_scm_inventory_sku_data_d.age_days` 为最大库龄。 |
| 全链库存、产销协同 | 分仓现存批次生产日期 | 老版 `agents_scm_branch_inventory_snapshot.prod_date`，仍缺与当前剩余库存一一对应的批次生产日期。 |
| 全链库存、基地库存、产销协同 | 现存批次剩余库存数量 | 老版 `agents_scm_inventory_age.qty` 或 `agents_scm_branch_inventory_snapshot.live_qty`；累计出入库结余不能完整还原当前批次。 |
| 全链库存、基地库存、产销协同 | 现存批次快照日期 | 老版 `agents_scm_inventory_age.snapshot_date` 或 `agents_scm_branch_inventory_snapshot.snapshot_date`，需与生产日、剩余量同粒度。 |
| 全链库存、基地库存、产销协同 | 当前待发状态快照时间 | 老版 `agents_scm_branch_pending_order.source_snapshot_time`；新增执行表 `header_addtime` 是创建时间，不能代替状态快照。 |
| 全链库存、基地库存、产销协同 | 当前待发订单阶段 | 老版 `agents_scm_branch_pending_order.order_stage`；新增执行表虽有状态，仍缺可核对的当前仓库归属与状态时点组合。月累计履约不替代实时待发。 |
| 全链库存、基地库存、产销协同 | 当前阶段订单箱数量 | 老版 `agents_scm_branch_pending_order.order_qty`；新增执行表数量仍需对应当前仓库、阶段及箱换算。 |
| 全链库存、基地库存、产销协同 | 当前阶段占用箱数量 | 老版 `agents_scm_branch_pending_order.allocated_qty`；缺同一状态时点的订单阶段占用明细及箱换算，不能用库存占用合计代替。 |
| 全链库存、产销协同 | 有效同步分仓计划月份 | `agents_scm_warehouse_transfer_plan_data_d.plan_month` 仍空，源月计划不能按所选月正式生效；历史发货补货测算单独标明。 |
| 全链库存、产销协同 | 有效同步分仓计划快照日期 | `agents_scm_warehouse_transfer_plan_data_d.snapshot_date` 仍空，不冒充历史时点计划。 |
| 全链库存、产销协同 | 有效同步分仓计划版本 | `agents_scm_warehouse_transfer_plan_data_d.plan_version` 仍空。 |
| 全链库存、产销协同 | 同步分仓月调拨计划 | `agents_scm_warehouse_transfer_plan_data_d.warehouse_month_transfer_plan` 仍空；调拨中量不是自然月调拨计划。 |

## 验证和交付状态

- 42项Python SQL回归、72项配置与读取回归通过，覆盖跨日/跨月选择、客户隔离、源重复、真实0、库存不一致时禁止拼接、默认显示列及10行新页查询。
- 11项新增/变更取数以及2项分析参考查询已通过当前正式GEA身份，允许列全部返回，结果与直连逐列一致。诊断入口的集合参数使用等价的命名标量IN成员绑定；页面继续通过统一配置执行通道。
- 大日期字段的两次拒绝已记录；该未发布字段没有进入最终主查询，不进行授权错误重试。
- 四个页面分别验证桌面和390像素窄屏；新增列表默认10行，下一页重新查询且行数据变化，宽表在列表内部横向滚动。预览页面使用本地只读直连，GEA验证为独立的真实通道查询，不把预览当作客户端新包安装验收。
- 保留原布局和本地修复预览，本轮没有重新发版或替换已安装GEA发行包。
