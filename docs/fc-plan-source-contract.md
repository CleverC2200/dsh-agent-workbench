# 分仓同步计划字段口径

分仓、全链库存插件从 `agents_scm_warehouse_transfer_plan_data_d` 读取计划。此调整只修改插件配置、页面与生成脚本，不修改数据库表或同步链路。

| 业务项 | 来源或处理 |
| --- | --- |
| 计划月份 | `stat_month`，YYYYMM，与页面所选自然月匹配；明细、汇总、计数、分组和选项口径一致 |
| 本月出货计划 | `warehouse_month_out_plan` |
| 次月出货计划 | 同一计划月记录的 `warehouse_future30_qty`，不是滚动30天或下一条记录 |
| 次月日均源值 | `future30_avg_plan`；次月计划日均展示另按次月数量/次月自然天数计算 |
| 数量单位 | 基地、分仓、提货点为件，直接使用源值；经销商库存仍为箱 |
| 调拨执行状态 | `warehouse_transfer_qty` 为调拨中量；包含备单、在途，不重复相加 |
| 月调拨计划 | 暂无独立真实来源，NULL；不以出货计划、在途或备单量替代 |
| 预计月末库存 | 依赖独立月调拨计划，源缺失时保持NULL，不按零推演 |

同月仓库×SKU只允许唯一记录用于计划计算；不同月份先过滤，避免误报重复。真实0计划保持0，数量NULL保持未知。有效出货计划用于补货；无有效计划时建议量保持未知，历史动销仅用于回顾周转。原有订单状态、权限与分页约束保持不变。

以下预留物理字段不再被查询或作为数据可用性条件：`plan_month`、`snapshot_date`、`plan_version`、`plan_source`、`warehouse_month_transfer_plan`、`manual_month_out_plan`、`manual_month_transfer_plan`、`plan_qty_unit`、`manual_out_source_record_id`、`manual_transfer_source_record_id`、`manual_plan_version`、`manual_plan_source`、`manual_tenant_code`、`manual_confirmed_at`。

页面兼容输出 `warehouse_month_transfer_plan` 是 NULL 占位，保留真实月调拨计划缺口，并非读取同名物理列。`plan_source` 是“分仓同步表”的取数来源标签，不代表业务维护的版本或人工提报记录。原有本地人工导入试算仍可使用用户输入，不写入数据库。回导的出货与调拨数量必须明确填写；空白不再自动按0计，零计划必须显式填0。

生成脚本 `scripts/update-fc-list-completion.py` 遵循同一口径。回归测试使用完全不含上述14个字段的模拟表，覆盖当月/跨月/跨年、真实0、NULL、重复记录、库存独有SKU、汇总与分页，不代表已做线上数据库对账或已发布客户端。

验证：SQL回归、配置与页面合同、分页、自然月边界、人工导入和DMS定向测试通过；整合主分支后官方类型检查通过。实际DMS下单未执行。
