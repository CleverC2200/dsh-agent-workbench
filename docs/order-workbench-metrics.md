# 订单工作台指标口径 / Order workbench metric basis

本页面采用[订单工作台及订单履约语义](https://klvcodtump.feishu.cn/docx/S7zwdltIaoKfZ0x8oqHcStqQnGg)及其引用的[术语库](https://klvcodtump.feishu.cn/wiki/DfoBw71VNivaOLkHU2mc2OB2nyd)。本次核对主文档 revision 3131；不修改订单履约模块、公共 APS 计算或 GEA 权限。 / This page follows the linked business definitions; fulfillment, shared APS calculations and GEA authorization remain unchanged.

## 公式与周期 / Formulas and periods

| 指标 / Metric                    | 计算及来源 / Calculation and source                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 作废率 / Cancellation            | 小时执行表按客户＋原订单号去重；接单12小时后且进入锁定期的整单作废数，除以O接收订单数（排除12小时内作废）。按OMS新增日期选择订单。不能以作废数量÷下单数量替代。 / Distinct source-order counts, not product quantities; select by OMS creation date.                                                                                                                                                                                      |
| 改单率 / Amendment               | 小时执行表按客户＋原订单号去重；锁定期内客户改单订单数÷全部有效订单数（排除整单作废）。交期距接单不超过7日时，接单12小时后锁定；否则在确认交期前7日锁定。 / Count customer amendments after the documented lock time; exclude cancelled orders from the denominator.                                                                                                                                                                      |
| 订单满足率 / Shipped fulfillment | 使用 `agents_order_execute_isontime_mi` 的上游排除标志及归集产品，按来源单＋客户＋产品去重，需求不可重复累加，发货量按需求封顶；最后拆单实际发货日期通过小时明细的执行单＋客户关联穿透表获得。原始指标表有冲突粒度或缺最后发货日期时，不把接单月份、备单完成时间或加载时间当作发货时间。 / Use cleaned source-order/product demand and capped shipped quantities; select by the last split shipment, never ingestion/creation timestamps. |
| 准交率 / On-time delivery        | 通过小时明细关联穿透表最新抬头，GPS到目的地围栏优先、人工到货确认备用；截止日为客户期望、确认交期、系统交期最大值＋12小时。整单所有执行单均准交才计准交；按整单最后到货日期选周期。SKU/品项/基地切片先确定订单集合，再按客户＋原订单号去重。 / Select whole orders by final arrival, then count distinct orders; do not average SKU verdicts.                                                                                             |
| 周转天数 / Shippable days        | 文档“可用库存是用的全部库存”对应库存明细的 `current_stock`，不使用扣占用后的 `available_stock`，也不混用另一批次表来拟合截图。销售和调拨计划分别优先正数纠偏，否则取初版。基地日均需求=(月度需求＋0.5×调拨出库计划)÷当月天数；品项不含调拨。 / Total stock from the same snapshot and dataset divided by planned daily demand.                                                                                                            |
| 货龄 / Stock age                 | 全部仓库批次按快照日期计算≥60天库存÷全部库存，不增加文档未要求的01/02限制。非零库存生产日期缺失或晚于快照时保留不可计算，不剔除后发布完整占比。业务大品项优先取同日库存计划的唯一product_item，缺失才用唯一pinxiang，不使用细物料组冒充大品项。 / All warehouse classes; missing production dates invalidate the ratio.                                                                                                                   |

## 缺值与完整性 / Missing inputs and completeness

缺作废时间、锁定依据、最后发货日期或完整到货/承诺交期时显示横线及具体原因。查询拒绝、字段未发布、关联冲突、零分母、源字段为空分别保留，不回退数量比率、旧 `is_ontime` 行级平均、滚动计划日均或开发数据库账号。 / Missing inputs and failed queries stay unknown; no quantity-rate, row-average or direct-database fallback.

同一来源单/产品上游多行不能证明为同一份重复数据时，保持不可计算；不得任取最大需求或重复累加已合并发货。现有快照不代表历史每日固定快照。 / Conflicting merged rows remain unavailable; current observations do not establish immutable historical snapshots.

原订单接单周期以全部子执行记录中最早OMS新增时间归属，先归并后筛选；不同子执行单创建时间不构成冲突。确认交期仅在确需判定锁定事件时参与完整性检查。 / Select cohorts after merging split orders by the earliest observed OMS creation time; differing child creation times are not conflicts.

负库存按源值纳入净合计，不补0，也不因单条负数使全国指标不可计算；净库存合计为负、缺值或重复粒度仍不发布支撑天数。 / Keep negative stock in the source net sum; one negative line does not invalidate a non-negative national total.

历史截止日之后的作废/改单不计入此前事件。只有最新改单时间而没有历史事件记录时，不能推断截止日前是否发生过其他改单；这类订单保留不可判定。不得为接近参考截图而剔除或拟合。 / Later events cannot be included in an earlier reporting cutoff; latest-only event timestamps do not reconstruct event history and must not be fitted to reference figures.

准交订单维度采用受控 SQL 聚合为每单一条，长度前缀按 Doris UTF-8字节编码，以避免多SKU放大订单数及大规模重复分页；解码失败拒绝该集合。 / Arrival dimensions use one governed row per order and UTF-8 byte-length tuples; invalid decoding rejects the collection.

全部页面查询继续使用现有 Consumer `order`、GEA 当前身份和原有授权。仅通过数据库开发账号验证SQL不等同页面受控查询通过。 / All page reads retain Consumer `order` and the existing GEA identity and grants.

## 维度对齐 / Dimension alignment

可发货天数目标按本次业务截图：全国（含品项及合计）<12.5天，郑州≤12.5天，其他基地<11天；总监按对应基地判定，不再使用8至12天区间。只调整目标和达标判定，不改变库存/计划计算公式。六张月周表以未舍入本期值判定满足率≤95%、准交率≤98.5%及可发货天数未达标为红色；货龄本期最高标黄，并列全部标黄，合计与缺值不参与最高比较，环同比不着色。 / Targets and current-value flags follow the supplied business screenshots.

应责总监：郑州按基地＋产品，共同负责产品分别进入两人范围；其余基地按基地，缺当月订单的库存SKU不因缺产品映射而丢失。各比较周期独立读取该月归属，不拿当前责任映射倒套上月或去年；归属冲突显示待补全，全国合计不能加总重叠责任组。 / Match responsibility by the documented base/product grain and reporting month.

2026-10-25只读回查：上述全部库存公式全国约13.44天，全仓批次≥60天占比约3.71%。这是当前历史快照计算，不声明等于参考报表的12.9/14.9天或2.2/2.3%。缺完整发货日期、承诺交期和历史事件的指标继续显示未知，不能发布已知样本率充当全量结果。 / Reconciliation follows definitions, not target-fitting.

原单关联先用原值精确匹配客户＋产品。仅允许移除客户编码后唯一的一个分隔符，且双方规范键均只对应一个原订单号，才使用格式补匹配；精确匹配有记录但缺发货日期时不挪用另一格式订单的日期。责任名单从当前周期小时表完整聚合，多人共同责任保留完整名单；名单不完整或归属冲突仍为横线。品项只接受同快照唯一库存归属或快照当月截至快照日的唯一指标归属，不用物料组推测大品项。 / Exact keys take precedence; normalization requires uniqueness on both sides and responsibility lists must be complete.

六表缺失的维度标签显示“—”，悬浮注明来源字段、缺失或冲突原因；内部未映射分组保留参与全国合计，未因隐藏标签丢弃数量。 / Unknown dimension labels remain in totals and expose their source reason on hover.
