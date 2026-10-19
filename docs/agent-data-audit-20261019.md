# 26张Agent来源表复核与补接

核对日期：2026-10-19。仅核对 `agents` 开头、名称不含 `wide` 的26张表。保留旧版主体布局；SQL仍按每个Agent一份配置，默认10行，翻页重新查询。没有修改底层表结构。

## 本轮补接

- 基地、分仓、全链、产销协同：库存健康明细补商品名称。先取当前订单中唯一SKU名称，仅当订单没有名称时补用出入库来源唯一名称；订单名称冲突时保持未知。2026-10-18分仓1799条仓库×SKU中，1785条可取得名称，14条存在订单名称冲突。左连接不增加库存行数或库存量。
- 基地、分仓、全链、产销协同：新增基地产销日记录入口，展示已有但原页面没有入口的生产入库、调入调出、原/纠偏/滚动计划、次月出货与销售计划。日库存及累计计划不跨日求和。
- 产销协同、基地、全链：补订单计划源值查询，含原计划、计划下单、计划发货、两类缺货归因。来源包含出口，不能替换内销指标；同业务键冲突字段返回空，重复月计划不跨日累计。
- 产销协同、全链：补发货批次流水，交货单、实际发货日、批号、源到达日期、交货类型、客户组、两种计量单位分别显示。客户组不是客户编码；批号不是生产日；到达日期异常及冲销标志缺值时不推算在途或签收率。
- 产销协同：补33条审批配置只读参考，源创建时间与同步写入时间分列。启停、删除和节点编码保留原值，不替代审批接口。
- 经销商客户计划分析：保留明确的不可用入口，不登记可执行SQL、不重复请求被拒资源；当前表为空且未进入该Consumer启用数据集。已有经销商库存仍沿用原来源。

## 26张表逐表结果

| 表名                                         |   当前行数 | 相关Agent                              | 结论                                                        |
| -------------------------------------------- | ---------: | -------------------------------------- | ----------------------------------------------------------- |
| `agents_dim_car_data_d`                      |     30,188 | 经销商                                 | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_dim_cust_sales_material_detail_d`    |  5,348,992 | 经销商                                 | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_dim_dealer_data_d`                   |     38,042 | 经销商                                 | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_dim_material_prod_sales_info_d`      |      6,032 | 全链、经销商                           | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_dim_pickup_point_data_d`             |      1,750 | 分仓、经销商                           | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_mes_prod_oee_line_result_d`          |     38,313 | 产销协同                               | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_order_cancel_change_di`              | 14,882,652 | 产销协同                               | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_order_execute_isontime_mi`           |    109,818 | 基地库存、分仓、全链、产销协同、经销商 | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_sales_deliv_flow_m`                  |    394,826 | 全链、产销协同                         | 本轮新增发货批次查询；不参与当前库存加总                    |
| `agents_sales_forecast_detail_mi`            | 14,934,814 | 产销协同                               | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_sales_plan_demand_m`                 |  1,879,243 | 产销协同、经销商                       | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_sales_promotion_policy_d`            | 42,757,195 | 经销商                                 | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_sales_target_data_d`                 |    189,822 | 产销协同                               | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_scm_branch_cost_m`                   |      1,037 | 分仓、产销协同                         | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_scm_cust_deliv_daily_di`             |  9,955,905 | 基地库存、分仓、全链、产销协同、经销商 | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_scm_cust_jxc_ai_daliy_d`             |     61,097 | 全链、经销商                           | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_scm_cust_plan_order_analysis_d`      |          0 | 经销商（待开放）                       | 0行；经销商Consumer返回RESOURCE_NOT_IN_DATASET，暂未启用SQL |
| `agents_scm_demand_sales_f`                  |    253,099 | 产销协同                               | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_scm_goods_inventory_turnover_data_m` |      8,226 | 基地库存、分仓、全链、产销协同         | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_scm_inventory_sku_data_d`            | 15,090,481 | 基地库存、分仓、全链、产销协同         | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_scm_material_in_out_summary_d`       |    994,792 | 基地库存、分仓、全链、产销协同         | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_scm_order_plan_exe_m`                |  3,575,986 | 基地库存、全链、产销协同               | 本轮新增订单计划源值；含出口，计划跨日重复                  |
| `agents_scm_plan_workflow_config`            |         33 | 产销协同                               | 本轮新增只读配置参考；业务配置不算缺失指标                  |
| `agents_scm_shortage_trace_f`                |     96,450 | 基地库存、分仓、全链、产销协同         | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_scm_stock_detail_d`                  |  3,662,854 | 基地库存、分仓、全链、产销协同         | 已有来源保留；按日期、粒度及字段有效范围读取                |
| `agents_scm_warehouse_transfer_plan_data_d`  |      2,366 | 分仓、全链、产销协同                   | 已有来源保留；按日期、粒度及字段有效范围读取                |

## 仍需大数据来源补齐的字段

以下每行一个字段。仅列来源事实缺口；人工计划、导入预算、审批结果、负责人、用户备注、建议补货规则及操作保存不计为缺失大数据指标。派生指标不能用近似口径冒填。

| 业务Agent               | 缺失字段/事实        | 当前26表中的来源情况                                                                                                        |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 基地/分仓/全链/产销协同 | 库存批次生产日期     | `agents_sales_deliv_flow_m.batch_no`仅是发货批次；26表缺库存批次生产日期                                                    |
| 基地/分仓/全链/产销协同 | 库存批次剩余在仓数量 | `agents_scm_inventory_sku_data_d.total_qty`为仓库SKU数量，不能分配到批次                                                    |
| 基地/分仓/全链/产销协同 | 当前订单阶段         | `agents_order_execute_isontime_mi`、`agents_scm_order_plan_exe_m`为期间执行事实，缺同一时点的待备/已备未发阶段              |
| 基地/分仓/全链/产销协同 | 当前订单所需数量     | 缺与当前订单阶段对应的需求快照，不能以月累计需求替代                                                                        |
| 基地/分仓/全链/产销协同 | 当前订单占用数量     | 库存汇总占用不能分配到当前订单及阶段                                                                                        |
| 产销协同/分仓           | 未来逐日排产数量     | `agents_mes_prod_oee_line_result_d.plan_qty`随已记录生产实绩；`agents_scm_stock_detail_d.produce_plan`等不是未来7日逐日排程 |
| 基地/全链/产销协同      | 历史某日当时状态快照 | 业务日期和当前累计结果不能还原过去某日当时版本                                                                              |
| 产销协同                | 财务确认未税本币收入 | 发货收入估价与客户实际销售目标口径不能替代财务确认；是否原由财务同步，需沿财务来源接入                                      |
| 经销商                  | 客户SKU目标库存      | `agents_scm_cust_plan_order_analysis_d.target_inventory`：表为空且未纳入当前启用数据集                                      |
| 经销商                  | 客户SKU在途量        | `agents_scm_cust_plan_order_analysis_d.in_transit_qty`：同上；发货流水不能当当前客户在途                                    |
| 经销商                  | 客户SKU平均货龄      | `agents_scm_cust_plan_order_analysis_d.avg_stock_age`：同上；基地最大库龄不能替代客户平均货龄                               |
| 经销商                  | 客户标签周转标准     | `agents_scm_cust_plan_order_analysis_d.label_turnover_days`：同上                                                           |
| 经销商                  | 客户货龄周转状态     | `agents_scm_cust_plan_order_analysis_d.stock_age_turnover_status`：同上                                                     |

## 已有字段的值与口径问题

| 业务Agent | 字段                                                    | 事实                                                                         |
| --------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 产销协同  | `agents_sales_forecast_detail_mi.actual_sales_quantity` | 202610实际销量为空，不能算当月预测准确率                                     |
| 产销协同  | `agents_sales_forecast_detail_mi.actual_sales_amount`   | 202610实际金额为空                                                           |
| 产销协同  | `agents_scm_demand_sales_f.plan_qty_adjusted`           | 10月基地口径合计为0，纠偏计划达成分母不能用原计划替代                        |
| 产销协同  | `agents_mes_prod_oee_line_result_d.plan_qty`            | 本月一组完整业务键两行不同计划量；总达成率保持未知，有效范围单独显示         |
| 产销协同  | `agents_mes_prod_oee_line_result_d.actual_qty`          | 同组两行实绩不同，无法据现有键决定覆盖还是累加                               |
| 经销商    | `agents_scm_cust_jxc_ai_daliy_d.stock_qty`              | 50条为空、5153条负数；有效55894/61097条，不把未知补0                         |
| 经销商    | `agents_scm_cust_jxc_ai_daliy_d.stock_amt`              | 5条为空、4951条负数；有效56141/61097条                                       |
| 经销商    | `agents_scm_cust_jxc_ai_daliy_d.pack_unitqty`           | 48018条为空；有值13079条                                                     |
| 基地库存  | 月目标/日均需求关联                                     | 最新基地3499个基地SKU中723个缺目标或日均需求关联；不是所有SKU均无值          |
| 基地库存  | 安全库存关联                                            | 最新基地3499个基地SKU中852个未取得安全库存                                   |
| 库存健康  | `material_name`名称映射                                 | 分仓14条订单SKU名称冲突，未用其他来源掩盖冲突                                |
| 发货流水  | `agents_sales_deliv_flow_m.sign_date`                   | 存在早于发货日、晚于当前日，甚至2027年的源日期；保持原值，不算真实签收或在途 |
| 订单计划  | `agents_scm_order_plan_exe_m.allnum`                    | 月计划随日期及来源明细重复；直接全表累计会严重放大，已取消任何跨行计划加总   |

## 权限与验证

- 当前正式环境登录身份通过本地GEA Host读取。已有22表的52组检查、989个Agent×字段引用全部通过；新增4表按用途补查7组，其中6组成功，客户计划分析表被数据集范围拒绝。未改Consumer、未绕过网关、未向正式目录写入。
- `RESOURCE_NOT_IN_DATASET`属于数据集启用范围，不是某个字段RETURN被裁剪。需将 `agents_scm_cust_plan_order_analysis_d`纳入经销商Consumer对应的当前租户启用数据集，并同步记录；授权前不启用查询。
- 以下是待开放表的实际源字段目录，逐字段列出；列目录不代表该字段现在有数据或已获得查询权限。

| 表名                                    | 字段                        |
| --------------------------------------- | --------------------------- |
| `agents_scm_cust_plan_order_analysis_d` | `all_amount`                |
| `agents_scm_cust_plan_order_analysis_d` | `all_qty`                   |
| `agents_scm_cust_plan_order_analysis_d` | `allnum`                    |
| `agents_scm_cust_plan_order_analysis_d` | `avg_stock_age`             |
| `agents_scm_cust_plan_order_analysis_d` | `budget_rate`               |
| `agents_scm_cust_plan_order_analysis_d` | `create_date`               |
| `agents_scm_cust_plan_order_analysis_d` | `cust_code`                 |
| `agents_scm_cust_plan_order_analysis_d` | `cust_name`                 |
| `agents_scm_cust_plan_order_analysis_d` | `daily_sales`               |
| `agents_scm_cust_plan_order_analysis_d` | `in_transit_qty`            |
| `agents_scm_cust_plan_order_analysis_d` | `label_turnover_days`       |
| `agents_scm_cust_plan_order_analysis_d` | `material_code`             |
| `agents_scm_cust_plan_order_analysis_d` | `material_name`             |
| `agents_scm_cust_plan_order_analysis_d` | `month`                     |
| `agents_scm_cust_plan_order_analysis_d` | `plannum_rate`              |
| `agents_scm_cust_plan_order_analysis_d` | `pre_order_qty`             |
| `agents_scm_cust_plan_order_analysis_d` | `ship_amount`               |
| `agents_scm_cust_plan_order_analysis_d` | `ship_qty`                  |
| `agents_scm_cust_plan_order_analysis_d` | `simulation_need_mny`       |
| `agents_scm_cust_plan_order_analysis_d` | `stock_age_turnover_status` |
| `agents_scm_cust_plan_order_analysis_d` | `stock_qty`                 |
| `agents_scm_cust_plan_order_analysis_d` | `target_inventory`          |
| `agents_scm_cust_plan_order_analysis_d` | `turnover_days`             |
| `agents_scm_cust_plan_order_analysis_d` | `unship_amount`             |
| `agents_scm_cust_plan_order_analysis_d` | `unship_qty`                |

## 本轮验收结果

- 100项定向回归测试通过，覆盖真实共用读取器、10行默认分页、翻页重查、零值、不可用来源、配置一致性及权限错误不回退。
- 27条相关SQL通过只读、命名参数、已知表字段、禁用窗口等自检。
- 新增及补名查询、基地产销日记录共41组GEA读取成功，包含第一页、第二页和计数；返回字段没有被裁剪，结果与直连逐行一致。
- 本轮单次GEA查询耗时0.699～1.893秒，中位数1.024秒；这是查询耗时，不是整页完成时间。
- 2026-10-01至2026-10-19来源查询范围：订单计划源键56,529条；发货批次126,953条；基地产销日记录63,110条；审批配置33条。它们代表不同粒度，不能相加为一个指标。
- 产销协同候选HTML构建通过；候选相邻SQL配置与源配置一致；定向lint、支持文件格式检查及差异空白检查通过。
- 真实GEA检查使用当前登录客户端的Host查询通道。公共诊断入口只负责一次分页；集合IN条件先等价展开为命名标量参数，避免旧入口误转成数组字面量。未改查询范围、Consumer、身份或返回权限。页面按queryId读取配置的分页行为另由共用读取器回归覆盖。

## 交付边界

本文记录数据核对阶段的证据。查询已通过当前登录身份的GEA通道验证；分页、空值与权限行为通过页面共用读取器测试。页面恢复、PR、合并与本地装载结果另见本次交付回执。
