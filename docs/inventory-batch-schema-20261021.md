# 库存批次源字段调整

影响全链库存、基地库存、分仓库存、产销协同工作台，共 63 个查询定义。SQL 保留每 Agent 独立配置，页面仍通过 GEA 受控通道执行，列表默认 10 行并在翻页时查询。

| 原字段 / 用途 | 新来源 / 规则 |
| --- | --- |
| stat_date | month_date，YYYYMMDD 转日期；快照及日期选项只扫描日期与分类 |
| warehouse_type | warehouse_classify：01、02 为基地仓；20 为分仓；其余排除 |
| total_qty | live_qty 按日期、仓库、SKU 汇总，批次不能视为仓库 SKU 重复记录 |
| available_qty | 同范围批次可用量合计 |
| pack_unit_qty | 同范围批次占用量合计 |
| freeze_qty | 同范围批次冻结量合计 |
| age_days | 正库存批次的快照日期减 prod_date，再取仓库 SKU 最大值；缺日期、未来生产日期及非正库存批次不参与 |
| warehouse_name | 库存源新增同名字段，按快照、仓库、SKU 和仓库类型核唯一值；空值显示仓库编码，不再依赖出入库历史补仓名 |
| belong_base | 库存源新增同名字段，按同库存粒度核唯一值；不再从客户交货记录推断基地。用于四个 Agent 的基地筛选、分组和产销分仓列表 |
| material_name | 库存源新增同名字段；库存明细、分仓补货列表优先显示源商品名，缺值沿用原商品字典补充 |
| product_categ_name、material_group_name | 仍取 agents_scm_material_in_out_summary_d 同仓库 SKU 唯一品类、物料组；聚合后关联，避免放大库存 |

日期差用公历序日计算，覆盖跨月、跨年和闰年。不能直接在 Doris 中相减 DATE，因为其结果是 YYYYMMDD 数值差。

新表删除了下列字段，不能根据现库存反推。保留未知结果，不阻断已有库存、占用、冻结、补货与最大货龄计算：

| 业务 Agent | 数据 | 原来源字段 / 缺口 |
| --- | --- | --- |
| 全链、基地、分仓、产销协同 | 超龄库存标志 | agents_scm_inventory_sku_data_d.is_overaged 已移除；需业务超龄阈值，不能默认用 60/90 天替代 |
| 全链、基地、分仓、产销协同 | 超龄库存数量 | agents_scm_inventory_sku_data_d.overaged_qty 已移除；无业务超龄阈值时不能计算 |
| 全链、基地、分仓、产销协同 | 低库存标志 | agents_scm_inventory_sku_data_d.is_low_stock 已移除 |
| 全链、基地、分仓、产销协同 | 高库存标志 | agents_scm_inventory_sku_data_d.is_high_stock 已移除 |
| 全链、基地、分仓、产销协同 | 仓库 SKU 安全库存 | agents_scm_inventory_sku_data_d.safe_stock_qty 已移除 |
| 全链、基地、分仓、产销协同 | 仓库 SKU 目标库存 | agents_scm_inventory_sku_data_d.target_stock_qty 已移除；基地计划目标和分仓测算各自沿用现有来源 |
| 全链、基地、分仓、产销协同 | 旧基地 SKU 总库存字段 | agents_scm_inventory_sku_data_d.current_stock 已移除；现物理库存使用 live_qty 批次合计，不能冒充旧基地粒度 |
| 全链、基地、分仓、产销协同 | 源更新时间 | agents_scm_inventory_sku_data_d.source_updated_at 已移除；month_date 是快照日期 |
| 全链、基地、分仓、产销协同 | 行更新时间 | agents_scm_inventory_sku_data_d.update_time 已移除；month_date 是快照日期 |

2026-10-21 新增三个名称、归属字段已回灌：01/02 基地共 33 个仓库，20 分仓共 25 个仓库，同库存粒度未发现名称、基地冲突。分类范围内现库存合计 5,233,552.1 箱，基地 4,962,765.9 箱，分仓 270,786.2 箱。

发布验证按用户要求取消三个插件联合启动检查，保留相关 SQL、功能回归、各插件构建和 CI；不把静态打包成功表述为客户端运行验收。

四个正式 Consumer 的库存汇总与明细、分仓补货明细、产销分仓列表，以及按基地筛选的第二页共 11 次查询均与直连逐列一致，没有返回列被拒；47 个受影响 SQL 定义通过字段、别名和只读语法自检，50 项 SQL 回归通过。
