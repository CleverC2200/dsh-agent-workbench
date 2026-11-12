# MPS 数据来源、公式与性能研究

日期：2026-11-11。研究顺序是先穷举当前来源与计算，再对相同输入分段实测，最后据测量提出优化方案。源码清单不等于运行验收，也不把静态复杂度当成已确认瓶颈。

本节源码观察固定在 Workbench `eb7645d0c7e8a743830f7238a9c694ac87e982cb`、Manage `375a98b58d862f9c7dc0b53938800ab4377d1e33`、GEA `16a45578a2a52dba3404a805d3f6579a106bfccc`。观察时目标源码无未提交修改；研究阶段未改业务代码、安装依赖、建图谱或操作正式环境。后续实施与本研究冻结数字分开记录。三仓没有 `.codegraph/`，按项目规则直接读源码。

> 实施入口：本轮规格与工单（私有验收记录）。用户已确认保持后端限制，年度仍每页200；实施结果以该轮验收为准。

> 阅读入口：第2–4节穷举所有取数入口、来源表和41个queryId；第5–6节列公式与计算环节；第9节给逐项实测、边界及优化顺序；第10节是本次会话的工具/测试环境复盘。已确认主瓶颈是年度大量分页和两处循环内全表扫描，业务源码尚未优化或发布。

## 1. 当前链路与职责

MPS 页面有七步，共用同一评估草稿。Workbench 负责取数、输入整形、页面与导出；Manage 的 `mps-compute` 接收数据执行纯计算；GEA Host 从已安装页面的配置解析 queryId，并以 `mps` Consumer 调用 SQL 或 Cube。页面请求只携带 queryId 与业务参数，不能指定 SQL、数据源或身份。见 [static/mps/source/app.js:7](../static/mps/source/app.js#L7)、[src/page-runtime.ts:442](../src/page-runtime.ts#L442)、GEA src/host/configured-html-query.ts:14（私有验收记录）、GEA src/host/configured-html-query.ts:163（私有验收记录）、`Manage business-resources/inventory-mps/mcp.json:1`。

```text
页面卡片 / 同步按钮
  → readProducts / readAnnual / readFactMonth / readSourceTable / readRelations / readUnitWeights
  → configured-query-client 的参数、字段、版本、分页与业务键校验
  → 页面 grant.readSql
  → GEA readConfiguredHtmlQuery
      SQL → pluginSql → 获权数据源
      Cube → moduleMcp("mps") → query_business_data
  → 转换为当前草稿输入
  → 大类测算 + 无约束需求/库存
  → 用户执行评估：读取关系/件吨/全年年度SKU → Worker
      → 输入整形 → 无约束参考 → 受限求解 → RCCP/汇总 → 缺项诊断
  → React 当前页呈现、助手上下文、CSV/XLSX下载
```

本清单有 **41 个 queryId**，其中 2 个 Cube 查询、1 个最新日期 SQL、19 个成对的数据/计数查询。SQL 配置是取数事实的 owner；资源 capability 的历史说明仍含“经 Cube 同步期初/纠偏”“库存映射待补”等旧描述，不能替代当前 SQL 和调用者。见 [static/mps/sql.config.json:9](../static/mps/sql.config.json#L9)、`Manage business-resources/inventory-mps/capability.json:1`。

## 2. 全部取数入口、期间及调度

通用完整 SQL 集合 `readAll` 先 count，首个数据页成功后最多 3 页并发，最后再 count。每次普通完整读取的请求数是 `2 + ceil(total / 200)`，即使 total=0 也会做两次 count。MPS 的单文档共享队列并发上限为 4，多个客户端实例不会各自获得 4 个独立槽位。每页核字段签名、配置版本和稳定业务键，末次计数核总量；这只是计数一致性，不是数据库原子快照。MPS 调用者未启用 `singlePageFirst` 或 atomicPages。见 [business/shared/configured-query-client.mjs:175](../business/shared/configured-query-client.mjs#L175)、[business/shared/configured-query-client.mjs:290](../business/shared/configured-query-client.mjs#L290)、[business/shared/configured-query-client.mjs:357](../business/shared/configured-query-client.mjs#L357)、[business/shared/query-scheduler.js:1](../business/shared/query-scheduler.js#L1)。

Cube 的月历史和全年历史不走配对 count；`facts.js` 以每页 200 顺序循环，利用源端 `totalRowCount/hasMorePages/offset` 校验，最多 100000 行，同时保留 partial 和 warnings。SQL `readAll` 与 Cube 两种成本须分开计时。见 [static/mps/source/facts.js:126](../static/mps/source/facts.js#L126)。

| 入口/触发 | 读取与依赖 | 期间、分页、重复关系 | owner |
|---|---|---|---|
| 需求页产品初读 | products.detail，再串行 products.prices；价格失败不抹掉产品 | 产品最多10000；价格最多100000；200行/页；产品仅business-unread自动，人工可同步 | [static/mps/source/master-data.js:124](../static/mps/source/master-data.js#L124)；[static/mps/source/demand-confirmation.js:1402](../static/mps/source/demand-confirmation.js#L1402) |
| 年度初读 | annual.summary，独立于产品链并发启动 | 全表所有月份的基地×大类；最多2000聚合行；不是本月明细 | [static/mps/source/master-data.js:170](../static/mps/source/master-data.js#L170)；[static/mps/source/demand-confirmation.js:1407](../static/mps/source/demand-confirmation.js#L1407) |
| 销售提报 | facts.report 后串行 facts.report-amounts；外层3个月也串行 | 评估月M、M+1、M+2，每月独立查询；月初/纠偏列分别保留；无本地report文件时自动 | [static/mps/source/facts.js:22](../static/mps/source/facts.js#L22)；[static/mps/source/demand-confirmation.js:1134](../static/mps/source/demand-confirmation.js#L1134)；[static/mps/source/demand-confirmation.js:1416](../static/mps/source/demand-confirmation.js#L1416) |
| 历史同期卡片 | facts.history | 所选历史同期月；切换historyYears会再读；与basic历史检查、全年历史是不同期间/口径 | [static/mps/source/demand-confirmation.js:220](../static/mps/source/demand-confirmation.js#L220)；[static/mps/source/demand-confirmation.js:1426](../static/mps/source/demand-confirmation.js#L1426) |
| 模型预测 | forecast.detail | 固定评估月份批次，展开当月与下一月两列；不混批次；最多100000 | [static/mps/source/source-tables.js:64](../static/mps/source/source-tables.js#L64)；[static/mps/source/source-tables.js:89](../static/mps/source/source-tables.js#L89)；[static/mps/source/demand-confirmation.js:1436](../static/mps/source/demand-confirmation.js#L1436) |
| 多维发货指标 | delivery.detail | draft.deliveryMonth，默认M；依维度独立展示；月份变化重读 | [static/mps/source/demand-confirmation.js:1446](../static/mps/source/demand-confirmation.js#L1446)；[static/mps/source/delivery-metrics.js:13](../static/mps/source/delivery-metrics.js#L13) |
| 目标库存同步 | inventory-targets.detail | M到M+2，纠偏/月初/滚动全部返回供版本选择；自动及按钮 | [static/mps/source/demand-confirmation.js:1239](../static/mps/source/demand-confirmation.js#L1239)；[static/mps/source/demand-confirmation.js:1456](../static/mps/source/demand-confirmation.js#L1456) |
| parameters 来源卡 | facts.history-annual 与历史指标组独立启动；3个category-history并发，全部完成后 annual-pool | 上一完整7月至6月财年Cube；三个往年各读取该基准月前4月至后1月共6个月；annual-pool全月池 | [static/mps/source/source-input-view.js:75](../static/mps/source/source-input-view.js#L75)；[static/mps/source/source-tables.js:64](../static/mps/source/source-tables.js#L64) |
| basic 来源核对卡 | 近3月每月 facts.history + facts.plan-quantity，两条同时，三个月同时 | monthly截止M-2，adjust截止M-1；用于达成率，不能拿facts.report替代 | [static/mps/source/source-input-view.js:121](../static/mps/source/source-input-view.js#L121)；`Manage src/mps-compute/category-demand.ts:41` |
| 销售提报占比卡 | plan-rate.detail | 只取M，复用同一拆分系数到3个计划月；进入参数卡时自动及按钮 | [static/mps/source/plan-rate-view.js:30](../static/mps/source/plan-rate-view.js#L30)；[static/mps/source/source-tables.js:81](../static/mps/source/source-tables.js#L81) |
| 主数据查看弹窗 | kind.count，再 kind.detail | products/annual/tunnels/sku_capacity/transfers；25行/页，每次翻页都重新count；annual限当前月兼容字符串 | [static/mps/source/master-data-view.js:35](../static/mps/source/master-data-view.js#L35)；[static/mps/source/master-data.js:99](../static/mps/source/master-data.js#L99) |
| 第四步关系读取 | products、sku_capacity、tunnels、transfers四组readAll并发 | 每组200行/页，最多10000；后两步/第三步enabled也会触发，不只第四步可见时；与初读产品重复 | [static/mps/source/relations.js:10](../static/mps/source/relations.js#L10)；[static/mps/source/relations-view.js:139](../static/mps/source/relations-view.js#L139)；[static/mps/source/app.js:123](../static/mps/source/app.js#L123) |
| 执行产能评估 | weights（无已有weightRead才读）、重新readPlanRelations、全年annual.detail并发 | 每次评估重新读取4组关系；年度期间为上月参考财年12月与当前滚动4月并集；再串行补年度独有codes的weights | [static/mps/source/workflow-view.js:247](../static/mps/source/workflow-view.js#L247) |
| 件吨系数同步 | unit-weights.detail | code去重排序，每100个code一批，批次串行；每批readAll 200行/页、最多10000；评估可复用已读weightRead | [static/mps/source/unit-weights.js:13](../static/mps/source/unit-weights.js#L13)；[static/mps/source/workflow-view.js:205](../static/mps/source/workflow-view.js#L205) |
| 发货最新日期 | facts.shipment-latest | 所选发货月起止内MAX(the_date)；进入第二步且cutoff空时自动；也有按钮刷新 | [static/mps/source/shipment.js:283](../static/mps/source/shipment.js#L283)；[static/mps/source/shipment.js:307](../static/mps/source/shipment.js#L307) |
| 发货/库存事实 | facts.shipment | 用户点击同步；从该月1日至cutoff；近三天从max(1,cutoff日-2)起；日期查询完成只设置cutoff，不自动调用该同步 | [static/mps/source/shipment.js:361](../static/mps/source/shipment.js#L361)；[static/mps/source/facts.js:225](../static/mps/source/facts.js#L225) |
| 年度下载 | annual.export | 基地+12月等用户所选months；200行/页、最多100000；不直接复用summary | [static/mps/source/master-data.js:249](../static/mps/source/master-data.js#L249)；[static/mps/source/demand-confirmation.js:1116](../static/mps/source/demand-confirmation.js#L1116) |
| 本地导入/恢复 | File.text、File.arrayBuffer、xlsx动态导入、草稿schema | 文件≤5MiB、产品Excel≤10000行；本地/编辑输入保留，业务事实恢复后重新读取 | [static/mps/source/demand-confirmation.js:1273](../static/mps/source/demand-confirmation.js#L1273)；[static/mps/source/product-file.js:36](../static/mps/source/product-file.js#L36)；[static/mps/source/local-draft.js:29](../static/mps/source/local-draft.js#L29) |

`DemandConfirmation` 的 active 固定传true；隐藏的check区仍挂着SourceInputs与CategoryDemand。SourceInputs的active未按当前step收缩，因此其初读不以可见状态为准。Shipment始终挂载但只在ship时active，Workflow只在process/constraints/capacity/report挂载。参数卡与basic卡的自动读取依赖active和draft.month，basic组件key还包含pull；切期初/纠偏会重建basic并读另一3月窗口。见 [static/mps/source/app.js:117](../static/mps/source/app.js#L117)、[static/mps/source/demand-confirmation.js:1958](../static/mps/source/demand-confirmation.js#L1958)、[static/mps/source/demand-confirmation.js:2401](../static/mps/source/demand-confirmation.js#L2401)、[static/mps/source/source-input-view.js:155](../static/mps/source/source-input-view.js#L155)。

## 3. 源表、字段与查询聚合口径

以下按数据族说明业务口径；第4节逐条列出41个配置ID、参数、所有输出字段与稳定粒度。表名均是当前配置声明的逻辑来源；Cube物理映射和数据库执行计划不在前端源码中，需由真实回执或后端owner补证，不能把Cube名当成已核物理存储。

| 数据族 | 源表、关键字段、SQL计算及期间 | owner |
|---|---|---|
| 产品 | agents_dim_product_list_mi；sub_category/series/product_item/product_item_name/material_code/material_name/responsible_item/replacement_product/replacement_material_code九维GROUP BY；MAX(update_time)、COUNT(*)。产品无基地，后续由事实建立基地SKU域 | [static/mps/sql.config.json:9](../static/mps/sql.config.json#L9)；[static/mps/source/workflow-inputs.js:151](../static/mps/source/workflow-inputs.js#L151) |
| 年度明细/导出 | agents_dim_demand_annual_mi；belong_base、sub_category、old_category、物料组、物料、stat_month、demand_qty原值分组；月份兼容YYYY-MM、Mon-YY、中文及去前导零月；导出加base | [static/mps/sql.config.json:66](../static/mps/sql.config.json#L66)；[static/mps/sql.config.json:771](../static/mps/sql.config.json#L771)；[static/mps/source/master-data.js:13](../static/mps/source/master-data.js#L13) |
| 年度summary | 同表，先按SKU维度与数量去重，再按完整SKU键识别quantity_variants；仅唯一且非缺数的raw_quantity加入基地×大类×月SUM；缺失与冲突另计数；没有stat_month过滤 | [static/mps/sql.config.json:315](../static/mps/sql.config.json#L315)；[static/mps/source/master-data.js:77](../static/mps/source/master-data.js#L77) |
| 年度pool | 同年度表按基地×编码×月识别数量变体，再JOIN产品表中唯一且非空分类，汇成基地×当前大类×月。与summary的源分类、分组键不同，不能不核合同就合并缓存 | [static/mps/sql.config.json:1008](../static/mps/sql.config.json#L1008) |
| 隧道/产线SKU | agents_dim_tunnel_capacity_mi 与 agents_dim_production_line_sku_capacity_mi；生产基地、production_unit/workshop、tunnel_no、吨位、类型、生产品类、日产件/吨、系列；SKU表含combined_series与material_code。物理资源按基地×生产单位/车间×隧道号唯一，候选组合不能相加重复能力 | [static/mps/sql.config.json:136](../static/mps/sql.config.json#L136)；[static/mps/sql.config.json:193](../static/mps/sql.config.json#L193)；[static/mps/source/relations.js:62](../static/mps/source/relations.js#L62)；[static/mps/source/plan-inputs.js:81](../static/mps/source/plan-inputs.js#L81) |
| 调拨 | agents_dim_transfer_direction_mi；stat_period=全表MAX(stat_period)，按完整源行维度分组；目标基地、编码、transfer_tag、transfer_direction；不是按评估月筛选。最新快照单独记录来源期间 | [static/mps/sql.config.json:256](../static/mps/sql.config.json#L256)；[static/mps/source/relations.js:3](../static/mps/source/relations.js#L3) |
| 计划核对量 | agents_scm_dws_scm_cust_plan_exe_di；stat_month=YYYYMM；先按stat_date/stat_month/base/material/cust/warehouse_group_type六维统计；只有COUNT(*)=1且allnum非空的键有有效plan_qty；再按base×SKU汇总，任一缺项时完整量NULL，保留known/source小计 | [static/mps/sql.config.json:359](../static/mps/sql.config.json#L359)；[static/mps/source/facts.js:73](../static/mps/source/facts.js#L73) |
| 销售提报量 | agents_sales_plan_demand_m，stat_month=YYYY-MM-01且客户非空；LEFT JOIN客户×SKU唯一region映射与SKU唯一产品属性；region/base/SKU聚合，plannum与allnum分别SUM，仅列全非空时完整SUM，否则NULL。两个版本不相加 | [static/mps/sql.config.json:422](../static/mps/sql.config.json#L422) |
| 提报金额 | agents_scm_dws_scm_cust_plan_exe_di；stat_month=YYYYMM；按基地SKU SUM(ycplanamount)与SUM(monthamount)，任何同组缺失则相应值NULL；CAST VARCHAR保留十进制。原始Hive来源名仅是facts元数据，当前请求访问配置逻辑表 | [static/mps/sql.config.json:1338](../static/mps/sql.config.json#L1338)；[static/mps/source/facts.js:307](../static/mps/source/facts.js#L307) |
| 历史Cube | agents_scm_cust_deliv_daily_di；shipment_date月范围或上一完整财年范围；base/material_code/name/product_categ_name/material_group_name五维；act_dl_qty_total、act_dl_qty_all_total、不含税收入分开，不合并赠品数量 | [static/mps/sql.config.json:469](../static/mps/sql.config.json#L469)；[static/mps/sql.config.json:1103](../static/mps/sql.config.json#L1103)；[static/mps/source/facts.js:167](../static/mps/source/facts.js#L167) |
| 发货库存 | agents_scm_stock_detail_d；data_month=月初日，the_date从月初到cutoff；按base×SKU；shipped=SUM(total_sales_qty)，同日重复则NULL；prepped/ordered/avg30/begin_stock/produce_in_qty只取唯一cutoff日；daily3须恰有3个日期、3个非空数值后SUM/3。维度名称也须唯一非空，否则NULL | [static/mps/sql.config.json:570](../static/mps/sql.config.json#L570) |
| 模型预测 | agents_scm_sales_forecast_mi；stat_month兼容多种月份字符串；按源批次×base×SKU，分别SUM(current_month_forecast_qty)、SUM(next_month_forecast_qty)，缺数NULL；同归一批次的重复行不再合计，保留缺项 | [static/mps/sql.config.json:630](../static/mps/sql.config.json#L630)；[static/mps/source/source-tables.js:89](../static/mps/source/source-tables.js#L89) |
| 多维发货原指标 | agents_scm_base_dimension_delivery_mi；按dimension_type/stat_month/base/value/name及全部源指标值分组，取source_rows；源month/fiscal/yoy/mom指标直接展示，不跨维度相加 | [static/mps/sql.config.json:686](../static/mps/sql.config.json#L686)；[static/mps/source/delivery-metrics.js:135](../static/mps/source/delivery-metrics.js#L135) |
| 大类历史重建 | 同发货表先取dimension_type='基地+产品'，源行DISTINCT后按月基地SKU核唯一量；JOIN当前产品唯一大类，汇全国月×类；同财年SKU全国年度量须唯一，再跨SKU汇成年分母；LEFT JOIN上一年同月与上月，计算数量差、Q/Y−1、Q/B−1、Q/财年量。detail SQL多次展开同一聚合子查询，外层才筛6个月 | [static/mps/sql.config.json:939](../static/mps/sql.config.json#L939) |
| 三层提报比例 | agents_scm_dimension_plan_rate_mi；stat_month IN YYYYMM；DISTINCT保留dimension_type/base/category/material_group_name/material_code/product_name/dimension_allnum/parent_allnum/dimension_rate；业务计算会按当前产品池重新聚合并有Top1剩余处理，不直接把所有源比例相乘 | [static/mps/sql.config.json:869](../static/mps/sql.config.json#L869)；[static/mps/source/workflow-inputs.js:66](../static/mps/source/workflow-inputs.js#L66) |
| 件吨 | agents_dim_material_prod_sales_info_d；只按codes IN，每批100；DISTINCT material_code/channel_name/ton_per_piece；适用渠道必须全部有来源且正数系数唯一，不能平均冲突值，不能从日产吨÷日产件推重量 | [static/mps/sql.config.json:1052](../static/mps/sql.config.json#L1052)；[static/mps/source/unit-weights.js:35](../static/mps/source/unit-weights.js#L35)；`Manage src/mps-compute/workflow.ts:566` |
| 库存政策 | agents_scm_goods_inventory_turnover_data_m；year_month前7位范围，版本限定纠偏/月初/滚动；按月base/SKU/version聚合；final_target_inventory、avg_daily_planned_demand、final_target_turnover_days各自要求全非空且唯一值才MAX，否则NULL；保留冲突计数 | [static/mps/sql.config.json:1215](../static/mps/sql.config.json#L1215) |
| 价格 | agents_scm_cust_jxc_ai_daliy_d；无日期过滤；DISTINCT material_code/cif_price；稳定grain仅material_code，因此同code多价会被readAll稳定键检查拒绝，不做平均或静默择值 | [static/mps/sql.config.json:1303](../static/mps/sql.config.json#L1303)；[business/shared/configured-query-client.mjs:345](../business/shared/configured-query-client.mjs#L345) |

## 4. 41个 queryId 完整附表

下表由本轮固定源码的配置逐条提取。`count`均输出total。除两条Cube外均为SQL；过滤/汇总语义见上一节与各行直接指向的配置。所有分页detail默认调用200行，主数据弹窗另用25行。

| queryId / 配置位置 | 类型/配对count | 业务参数（不含page_size/offset） | 稳定粒度 | 输出字段 |
|---|---|---|---|---|

| [products.detail](../static/mps/sql.config.json#L9) | SQL<br>→`products.count` | 无 | `sub_category`<br>`series`<br>`product_item`<br>`product_item_name`<br>`material_code`<br>`material_name`<br>`responsible_item`<br>`replacement_product`<br>`replacement_material_code` | `sub_category`<br>`series`<br>`product_item`<br>`product_item_name`<br>`material_code`<br>`material_name`<br>`responsible_item`<br>`replacement_product`<br>`replacement_material_code`<br>`update_time`<br>`source_rows` |

| [products.count](../static/mps/sql.config.json#L60) | SQL count | 无 | 无 | `total` |

| [annual.detail](../static/mps/sql.config.json#L66) | SQL<br>→`annual.count` | `months` | `belong_base`<br>`sub_category`<br>`old_category`<br>`product_item`<br>`product_item_name`<br>`material_code`<br>`material_name`<br>`stat_month`<br>`demand_qty` | `belong_base`<br>`sub_category`<br>`old_category`<br>`product_item`<br>`product_item_name`<br>`material_code`<br>`material_name`<br>`stat_month`<br>`demand_qty`<br>`update_time`<br>`source_rows` |

| [annual.count](../static/mps/sql.config.json#L123) | SQL count | `months` | 无 | `total` |

| [tunnels.detail](../static/mps/sql.config.json#L136) | SQL<br>→`tunnels.count` | 无 | `belong_base`<br>`production_unit`<br>`tunnel_no`<br>`tunnel_tonnage`<br>`tunnel_type`<br>`production_category`<br>`standard_daily_output_pc`<br>`standard_daily_output_ton`<br>`series` | `belong_base`<br>`production_unit`<br>`tunnel_no`<br>`tunnel_tonnage`<br>`tunnel_type`<br>`production_category`<br>`standard_daily_output_pc`<br>`standard_daily_output_ton`<br>`series`<br>`update_time`<br>`source_rows` |

| [tunnels.count](../static/mps/sql.config.json#L187) | SQL count | 无 | 无 | `total` |

| [sku_capacity.detail](../static/mps/sql.config.json#L193) | SQL<br>→`sku_capacity.count` | 无 | `belong_base`<br>`workshop`<br>`tunnel_no`<br>`tunnel_tonnage`<br>`tunnel_type`<br>`production_category`<br>`combined_series`<br>`standard_daily_output_pc`<br>`standard_daily_output_ton`<br>`series`<br>`material_code`<br>`material_name` | `belong_base`<br>`workshop`<br>`tunnel_no`<br>`tunnel_tonnage`<br>`tunnel_type`<br>`production_category`<br>`combined_series`<br>`standard_daily_output_pc`<br>`standard_daily_output_ton`<br>`series`<br>`material_code`<br>`material_name`<br>`update_time`<br>`source_rows` |

| [sku_capacity.count](../static/mps/sql.config.json#L250) | SQL count | 无 | 无 | `total` |

| [transfers.detail](../static/mps/sql.config.json#L256) | SQL<br>→`transfers.count` | 无 | `stat_period`<br>`material_code`<br>`sap_category`<br>`old_category`<br>`production_category`<br>`material_name`<br>`series`<br>`target_base`<br>`transfer_tag`<br>`transfer_direction` | `stat_period`<br>`material_code`<br>`sap_category`<br>`old_category`<br>`production_category`<br>`material_name`<br>`series`<br>`target_base`<br>`transfer_tag`<br>`transfer_direction`<br>`update_time`<br>`source_rows` |

| [transfers.count](../static/mps/sql.config.json#L309) | SQL count | 无 | 无 | `total` |

| [annual.summary](../static/mps/sql.config.json#L315) | SQL<br>→`annual.summary.count` | 无 | `belong_base`<br>`sub_category`<br>`stat_month` | `belong_base`<br>`sub_category`<br>`stat_month`<br>`source_rows`<br>`missing_qty`<br>`duplicate_rows`<br>`demand_qty`<br>`update_time` |

| [annual.summary.count](../static/mps/sql.config.json#L353) | SQL count | 无 | 无 | `total` |

| [facts.plan-quantity](../static/mps/sql.config.json#L359) | SQL<br>→`facts.plan-quantity.count` | `month` | `belong_base`<br>`material_code` | `belong_base`<br>`material_code`<br>`plan_qty_total`<br>`known_plan_qty_total`<br>`source_plan_qty_total`<br>`source_rows`<br>`missing_rows`<br>`duplicate_rows`<br>`source_date_start`<br>`source_date_end` |

| [facts.plan-quantity.count](../static/mps/sql.config.json#L406) | SQL count | `month` | 无 | `total` |

| [facts.report](../static/mps/sql.config.json#L422) | SQL<br>→`facts.report.count` | `month` | `region_name`<br>`belong_base`<br>`material_code` | `region_name`<br>`belong_base`<br>`material_code`<br>`material_name`<br>`sub_category`<br>`series`<br>`product_item`<br>`product_item_name`<br>`plannum_total`<br>`allnum_total` |

| [facts.history](../static/mps/sql.config.json#L469) | Cube | `month` | `agents_scm_cust_deliv_daily_di.belong_base`<br>`agents_scm_cust_deliv_daily_di.material_code`<br>`agents_scm_cust_deliv_daily_di.material_name`<br>`agents_scm_cust_deliv_daily_di.product_categ_name`<br>`agents_scm_cust_deliv_daily_di.material_group_name` | `agents_scm_cust_deliv_daily_di.belong_base`<br>`agents_scm_cust_deliv_daily_di.material_code`<br>`agents_scm_cust_deliv_daily_di.material_name`<br>`agents_scm_cust_deliv_daily_di.product_categ_name`<br>`agents_scm_cust_deliv_daily_di.material_group_name`<br>`agents_scm_cust_deliv_daily_di.act_dl_qty_total`<br>`agents_scm_cust_deliv_daily_di.act_dl_qty_all_total`<br>`agents_scm_cust_deliv_daily_di.income_excl_tax_local_total` |

| [facts.shipment-latest](../static/mps/sql.config.json#L549) | SQL | `month`<br>`month_end` | 无 | `latest_date` |

| [facts.shipment](../static/mps/sql.config.json#L570) | SQL<br>→`facts.shipment.count` | `month`<br>`cutoff`<br>`recent_start` | `belong_base`<br>`material_code` | `belong_base`<br>`material_code`<br>`material_name`<br>`series`<br>`product_item`<br>`shipped`<br>`prepped`<br>`unprepped`<br>`daily3`<br>`average`<br>`open`<br>`inbound`<br>`source_days`<br>`duplicate_days` |

| [forecast.detail](../static/mps/sql.config.json#L630) | SQL<br>→`forecast.count` | `months` | `stat_month`<br>`belong_base`<br>`material_code` | `stat_month`<br>`belong_base`<br>`material_code`<br>`material_name`<br>`current_month_forecast_qty`<br>`next_month_forecast_qty`<br>`source_rows` |

| [forecast.count](../static/mps/sql.config.json#L673) | SQL count | `months` | 无 | `total` |

| [delivery.detail](../static/mps/sql.config.json#L686) | SQL<br>→`delivery.count` | `months` | `dimension_type`<br>`stat_month`<br>`belong_base`<br>`dimension_value`<br>`product_name`<br>`dimension_act_dl_qty`<br>`fiscal_year`<br>`national_dimension_fiscal_act_dl_qty`<br>`dimension_act_dl_qty_rate`<br>`last_year_stat_month`<br>`last_year_dimension_act_dl_qty`<br>`year_on_year_act_dl_qty`<br>`year_on_year_rate`<br>`last_month_stat_month`<br>`last_month_dimension_act_dl_qty`<br>`month_on_month_act_dl_qty`<br>`month_on_month_rate` | `dimension_type`<br>`stat_month`<br>`belong_base`<br>`dimension_value`<br>`product_name`<br>`dimension_act_dl_qty`<br>`fiscal_year`<br>`national_dimension_fiscal_act_dl_qty`<br>`dimension_act_dl_qty_rate`<br>`last_year_stat_month`<br>`last_year_dimension_act_dl_qty`<br>`year_on_year_act_dl_qty`<br>`year_on_year_rate`<br>`last_month_stat_month`<br>`last_month_dimension_act_dl_qty`<br>`month_on_month_act_dl_qty`<br>`month_on_month_rate`<br>`source_rows` |

| [delivery.count](../static/mps/sql.config.json#L758) | SQL count | `months` | 无 | `total` |

| [annual.export](../static/mps/sql.config.json#L771) | SQL<br>→`annual.export.count` | `months`<br>`base` | `belong_base`<br>`sub_category`<br>`old_category`<br>`product_item`<br>`product_item_name`<br>`material_code`<br>`material_name`<br>`stat_month`<br>`demand_qty` | `belong_base`<br>`sub_category`<br>`old_category`<br>`product_item`<br>`product_item_name`<br>`material_code`<br>`material_name`<br>`stat_month`<br>`demand_qty`<br>`update_time`<br>`source_rows` |

| [annual.export.count](../static/mps/sql.config.json#L834) | SQL count | `months`<br>`base` | 无 | `total` |

| [facts.report.count](../static/mps/sql.config.json#L853) | SQL count | `month` | 无 | `total` |

| [plan-rate.detail](../static/mps/sql.config.json#L869) | SQL<br>→`plan-rate.count` | `months` | `dimension_type`<br>`stat_month`<br>`belong_base`<br>`category_name`<br>`material_group_name`<br>`material_code`<br>`product_name`<br>`dimension_allnum`<br>`parent_allnum`<br>`dimension_rate` | `dimension_type`<br>`stat_month`<br>`belong_base`<br>`category_name`<br>`material_group_name`<br>`material_code`<br>`product_name`<br>`dimension_allnum`<br>`parent_allnum`<br>`dimension_rate` |

| [plan-rate.count](../static/mps/sql.config.json#L926) | SQL count | `months` | 无 | `total` |

| [category-history.detail](../static/mps/sql.config.json#L939) | SQL<br>→`category-history.count` | `months` | `stat_month`<br>`dimension_value` | `dimension_type`<br>`stat_month`<br>`belong_base`<br>`dimension_value`<br>`product_name`<br>`dimension_act_dl_qty`<br>`fiscal_year`<br>`national_dimension_fiscal_act_dl_qty`<br>`dimension_act_dl_qty_rate`<br>`last_year_stat_month`<br>`last_year_dimension_act_dl_qty`<br>`year_on_year_act_dl_qty`<br>`year_on_year_rate`<br>`last_month_stat_month`<br>`last_month_dimension_act_dl_qty`<br>`month_on_month_act_dl_qty`<br>`month_on_month_rate`<br>`source_rows` |

| [category-history.count](../static/mps/sql.config.json#L994) | SQL count | `months` | 无 | `total` |

| [annual-pool.detail](../static/mps/sql.config.json#L1008) | SQL<br>→`annual-pool.count` | 无 | `belong_base`<br>`sub_category`<br>`stat_month` | `belong_base`<br>`sub_category`<br>`stat_month`<br>`source_rows`<br>`missing_qty`<br>`duplicate_rows`<br>`demand_qty`<br>`update_time` |

| [annual-pool.count](../static/mps/sql.config.json#L1046) | SQL count | 无 | 无 | `total` |

| [unit-weights.detail](../static/mps/sql.config.json#L1052) | SQL<br>→`unit-weights.count` | `codes` | `material_code`<br>`channel_name`<br>`ton_per_piece` | `material_code`<br>`channel_name`<br>`ton_per_piece` |

| [unit-weights.count](../static/mps/sql.config.json#L1088) | SQL count | `codes` | 无 | `total` |

| [facts.history-annual](../static/mps/sql.config.json#L1103) | Cube | `start`<br>`end` | `agents_scm_cust_deliv_daily_di.belong_base`<br>`agents_scm_cust_deliv_daily_di.material_code`<br>`agents_scm_cust_deliv_daily_di.material_name`<br>`agents_scm_cust_deliv_daily_di.product_categ_name`<br>`agents_scm_cust_deliv_daily_di.material_group_name` | `agents_scm_cust_deliv_daily_di.belong_base`<br>`agents_scm_cust_deliv_daily_di.material_code`<br>`agents_scm_cust_deliv_daily_di.material_name`<br>`agents_scm_cust_deliv_daily_di.product_categ_name`<br>`agents_scm_cust_deliv_daily_di.material_group_name`<br>`agents_scm_cust_deliv_daily_di.act_dl_qty_total`<br>`agents_scm_cust_deliv_daily_di.act_dl_qty_all_total`<br>`agents_scm_cust_deliv_daily_di.income_excl_tax_local_total` |

| [facts.shipment.count](../static/mps/sql.config.json#L1194) | SQL count | `month`<br>`cutoff` | 无 | `total` |

| [inventory-targets.detail](../static/mps/sql.config.json#L1215) | SQL<br>→`inventory-targets.count` | `start_month`<br>`end_month` | `target_month`<br>`belong_base`<br>`material_code`<br>`inventory_version` | `target_month`<br>`belong_base`<br>`material_code`<br>`inventory_version`<br>`final_target_inventory`<br>`avg_daily_planned_demand`<br>`final_target_turnover_days`<br>`source_rows`<br>`final_target_value_count`<br>`daily_demand_value_count`<br>`missing_target_rows`<br>`missing_daily_rows`<br>`turnover_days_value_count`<br>`missing_turnover_days_rows` |

| [inventory-targets.count](../static/mps/sql.config.json#L1276) | SQL count | `start_month`<br>`end_month` | 无 | `total` |

| [products.prices](../static/mps/sql.config.json#L1303) | SQL<br>→`products.prices.count` | 无 | `material_code` | `material_code`<br>`cif_price` |

| [products.prices.count](../static/mps/sql.config.json#L1332) | SQL count | 无 | 无 | `total` |

| [facts.report-amounts](../static/mps/sql.config.json#L1338) | SQL<br>→`facts.report-amounts.count` | `month` | `belong_base`<br>`material_code` | `belong_base`<br>`material_code`<br>`ycplanamount`<br>`monthamount` |

| [facts.report-amounts.count](../static/mps/sql.config.json#L1374) | SQL count | `month` | 无 | `total` |

## 5. 全部计算公式与owner

以下的M表示所选评估月份，源码的M也用于界面所称第一计划月。数量为当前输入的件数语义；源表中未确认单位的指标仍保留原值。null表示缺项或不满足有效性条件，不能等同0。

### 5.1 大类、同比、独立环比与两次平均

`Manage src/mps-compute/category-demand.ts:38` 是公式owner；[static/mps/source/category-demand.js:7](../static/mps/source/category-demand.js#L7) 负责来源及产品池映射。

| 项 | 当前公式与条件 | 精确位置 |
|---|---|---|
| 近三月核对窗口 | monthly结束于M−2、adjust结束于M−1，再向前取三个月 | `Manage src/mps-compute/category-demand.ts:41` |
| 三年同比 | 每年当月Q÷上一年同月Y，分母须>0；剔除无效年份后对剩余有效比值等权平均，0个有效为null；有效年份数与排除原因保留。这里是倍数，不是增长率减1 | `Manage src/mps-compute/category-demand.ts:44` |
| 三年环比 | 三个往年对应月各自Q÷上月B，再严格三年平均；缺一年即null。与同比独立，不用同比筛选结果替代 | `Manage src/mps-compute/category-demand.ts:85` |
| 三年月占财年比例 | 三个往年Q÷同财年全国大类量，再严格三年平均；同月多个基地共享的全国财年量须一致，只取一个，不按基地重复相加 | `Manage src/mps-compute/category-demand.ts:73` |
| 全年估计 | 近三月实际总量÷近三月历史月占比之和 | `Manage src/mps-compute/category-demand.ts:90` |
| 达成率 | 近三月实际总量÷近三月计划总量；计划完整且>0 | `Manage src/mps-compute/category-demand.ts:91` |
| M、M+1的环比法 | M起点是上一月预估发货；当月环比法=前一月环比法×对应历史环比。递推使用momMethod，保持独立，不改成最终加权量 | `Manage src/mps-compute/category-demand.ts:101`；`Manage src/mps-compute/category-demand.ts:134` |
| 占比法 | 全年估计×该月三年历史月占比 | `Manage src/mps-compute/category-demand.ts:120` |
| 第一次平均 | methodAverage=(环比法+占比法)/2 | `Manage src/mps-compute/category-demand.ts:121` |
| 提报校正与第二次平均 | salesCorrected=同月销售提报×达成率；最终参考=(methodAverage+salesCorrected)/2，即环比法25%+占比法25%+校正提报50% | `Manage src/mps-compute/category-demand.ts:113` |
| M+2、M+3 | 上月环比测算量×[年度当月需求÷年度上月需求]；继续用独立momMethod递推，不把前月人工调整或加权结果写入该链 | `Manage src/mps-compute/category-demand.ts:124` |
| 人工大类调整 | 保留systemQuantity，仅单一、非负、有限且属于当前域的quantity覆盖有效量；失效/重复记录报告issue | `Manage src/mps-compute/category-demand.ts:133` |

### 5.2 产品域、老品与三层拆分

产品关系按当前编码补唯一分类。历史取上一完整7月至6月财年，当前SKU有historyCode时直接查同基地老品，不递归替换；本期提报仍按当前SKU。初始域由本期提报和全年历史的基地SKU并集建立，并补入老品映射到新品的当前码，三个计划月共用本期系数。产品池外记录单列，未知不能混入分母。见 [static/mps/source/source-projections.js:78](../static/mps/source/source-projections.js#L78)、[static/mps/source/workflow-inputs.js:104](../static/mps/source/workflow-inputs.js#L104)、[static/mps/source/workflow-inputs.js:162](../static/mps/source/workflow-inputs.js#L162)、`Manage src/mps-compute/workflow.ts:175`、`Manage src/mps-compute/workflow.ts:208`。

业务提报拆分的数量来自plan-rate的基地+产品dimension_allnum；大类销售提报校正来自facts.report，二者有不同用途。完整、非partial且ready的提报比例源允许把已知产品域中缺提报行置0，并标记reportMissingAsZero；历史缺行仍保留缺项。见 [static/mps/source/workflow-inputs.js:59](../static/mps/source/workflow-inputs.js#L59)、[static/mps/source/workflow-inputs.js:186](../static/mps/source/workflow-inputs.js#L186)。

| 项 | 公式/调整 | owner |
|---|---|---|
| 三层比例 | 对提报、历史分别计算 groupShare=物料组量/大类量；skuShare=SKU跨基地量/物料组量；baseShare=基地SKU量/SKU跨基地量；product=三者乘积；直接rowShare=基地SKU量/大类量。中间分母0时层级乘积可空，完整大类的真实零直接份额仍可0 | `Manage src/mps-compute/workflow.ts:378` |
| 物料组Top1 | 按量降序、编码并列排序；最大组占比=1−其余组占比，减少浮点残差 | `Manage src/mps-compute/workflow.ts:412` |
| 提报缺系数托底 | 只有历史有正量、提报部分缺失时尝试源reportRatios；按历史量Top1物料组及Top1 SKU承接1−其余系数。基地份额不凭空补齐，最后全大类系数和须为1 | `Manage src/mps-compute/split-fallback.ts:13` |
| 综合份额 | 通常=(reportShare+historyShare)/2；若大类提报完整且全0则只用historyShare | `Manage src/mps-compute/workflow.ts:446` |
| 人工占比 | 仅所属物料组内调整，非Top1固定，Top1剩余候选按原systemShare权重承接剩余组份额；负剩余、重复、来源不完整则拒绝 | `Manage src/mps-compute/workflow.ts:463` |
| 需求拆分 | category.quantity×有效share；大类明确0直接输出0；最后一个托底行用大类量减其它行之和对平 | `Manage src/mps-compute/workflow.ts:496` |
| 人工数量 | 前两计划月可按物料组/SKU/基地SKU树设固定量，其余按原share权重摊剩余；父子合计冲突或同月占比编辑冲突拒绝；系统量留存 | `Manage src/mps-compute/workflow.ts:506`；`Manage src/mps-compute/quantity-adjustments.ts:11` |

### 5.3 发货、速度、入库与月末

[static/mps/source/shipment.js:60](../static/mps/source/shipment.js#L60) 是发货推算owner；真实事实聚合在SQL，剩余入库在 [static/mps/source/facts.js:225](../static/mps/source/facts.js#L225)。令d=截止日序号，D=该月自然天数。

| 项 | 当前公式 | owner |
|---|---|---|
| 待发订单O | 已备货prepped+未备货unprepped | [static/mps/source/shipment.js:61](../static/mps/source/shipment.js#L61) |
| 速度v | 优先正daily3；若daily3恰为0且shipped已知，用shipped/d；若该值恰为0且average>0，用近30天average。daily3缺失或负值不能当0降级 | [static/mps/source/shipment.js:63](../static/mps/source/shipment.js#L63) |
| 预估发运天数t | O=0则0，否则O/v，v须>0 | [static/mps/source/shipment.js:81](../static/mps/source/shipment.js#L81) |
| 已锁发货H、预估日均a | H=shipped+O；a=H/(d+t) | [static/mps/source/shipment.js:82](../static/mps/source/shipment.js#L82) |
| 剩余天数r、预估发货 | r=max(0,D−d−t)；prediction=round(a×r+H) | [static/mps/source/shipment.js:85](../static/mps/source/shipment.js#L85) |
| 剩余入库 | round(produce_in_qty/(d−1)×(D−d))，d≤1或入库缺失时null | [static/mps/source/facts.js:257](../static/mps/source/facts.js#L257) |
| 有效发货与月末 | fin=人工值或prediction；end=begin_stock+produce_in_qty+有效剩余入库−fin | [static/mps/source/shipment.js:216](../static/mps/source/shipment.js#L216) |
| 整数重摊 | 权重/权重总和×目标，先trunc，再按余数顺序分配整数残差；BigInt核目标与合计，零权重不能摊非零目标 | [static/mps/source/shipment.js:108](../static/mps/source/shipment.js#L108) |
| 基地/全国汇总 | fin、end等用已知行和，缺失数独立报告；另聚合有预测行再调用derive供公式参考，不能把该参考公式值当有效明细合计 | [static/mps/source/shipment.js:249](../static/mps/source/shipment.js#L249) |

### 5.4 目标库存、生产日历、无约束所需生产

| 项 | 当前公式与边界 | owner |
|---|---|---|
| 来源库存版本 | UI按选中来源月与今天比较，未来月优先月初、滚动；当前/过去优先纠偏、月初。默认来源月每月20日后进次月；实际selectedInventoryMonth优先读取metadata.start_month。Manage的通用auto默认顺序纠偏/月初/滚动会被Workbench传入顺序覆盖 | [static/mps/source/inventory-selection.js:3](../static/mps/source/inventory-selection.js#L3)；[static/mps/source/workflow-inputs.js:236](../static/mps/source/workflow-inputs.js#L236)；`Manage src/mps-compute/inventory-targets.ts:43` |
| 源目标天数展示 | finalTarget/dailyDemand，仅分母>0、记录唯一且无冲突时有效。与实际采用的final_target_turnover_days是两条字段，不可混淆 | `Manage src/mps-compute/inventory-targets.ts:90` |
| 采用周转政策 | 选中来源月份的finalTurnoverDays优先，再人工基地SKU周转天数；业务模式启用missingTurnoverDaysAsZero时缺源且缺人工暂用0，仍保留来源缺项；inventory-days硬/已接受规则再取max | `Manage src/mps-compute/inventory-targets.ts:118`；`Manage src/mps-compute/workflow.ts:296`；[static/mps/source/workflow-inputs.js:242](../static/mps/source/workflow-inputs.js#L242) |
| 推导目标库存 | safetyDays=0直接0，否则 safetyDays×下月有效需求/下月自然月天数；第三计划月下月需求借第四月大类×第三月有效份额，只作库存参考 | `Manage src/mps-compute/workflow.ts:526` |
| 起初与所需生产 | 第一月期初=第二步有效月末；后续无约束期初=前月projectedClosing；requiredProduction=max(0,demand+targetInventory−openingInventory)；projectedClosing=opening+requiredProduction−demand | [static/mps/source/workflow-inputs.js:137](../static/mps/source/workflow-inputs.js#L137)；`Manage src/mps-compute/workflow.ts:552` |
| 件吨与日历 | tons=件×唯一有效tonsPerPiece；0件可直接0吨。每月默认25天，春节前5日后5日按落入月份扣减，春节当天不另扣；人工天数覆盖；production-days硬/已接受规则再取min，停用资源能力归0 | `Manage src/mps-compute/workflow.ts:565`；[static/mps/source/production-calendar.js:8](../static/mps/source/production-calendar.js#L8)；`Manage src/mps-compute/constraint-rules.ts:144` |
| 无约束资源负荷 | 每类资源分配份额须各自和为1；requiredTons=ΣSKU所需吨×该资源份额；requiredDays=所需吨/日产吨；load=requiredDays/可用天数；overloadDays=max(0,requiredDays−可用天数)；gapTons=max(0,所需吨−日产吨×天数) | `Manage src/mps-compute/workflow.ts:576` |
| 负荷状态 | load<0.9正常，0.9至1.05预警，>1.05超负荷，缺输入unknown；不生成可相加SKU候选月产能 | `Manage src/mps-compute/workflow.ts:659` |

### 5.5 有约束求解、公平分配、调拨路径

`solveMpsPlan` 会先重算 `computeMpsWorkflow` 取得参考。只对唯一有效tunnel资源求解，月容量=日产吨×实际可用生产日，停用为0；候选资源沿当前基地SKU承接关系。后月期初使用前月受限求解的实际closingInventory。见 `Manage src/mps-compute/plan.ts:73`、`Manage src/mps-compute/plan.ts:129`。

| 项 | 当前算法/公式 | owner |
|---|---|---|
| 路径 | 按月、SKU筛选有向调拨边，从需求基地逆向BFS，按from排序，为每个可达供给基地保留一条路径；循环通过visited Map截断。沿线件吨系数必须一致；成本/提前期硬约束pending的基地不放行 | `Manage src/mps-compute/plan.ts:26`；`Manage src/mps-compute/plan.ts:170` |
| 本地优先，再异地 | 本地候选资源先fairAllocate所需生产吨；剩余产能对未满足量再fairAllocate异地候选，保留路径；不是把两轮容量独立使用 | `Manage src/mps-compute/plan.ts:216` |
| 公平分配 | 建source→需求→候选资源→sink容量图，用分层BFS+DFS增广判断给定满足率是否可行；未固定需求共享rate，42次二分求可行最大底线，再用最小割blocked固定受瓶颈需求并继续；最多需求数轮。返回量按剩余资源和剩余需求夹紧，并留1e−12余量 | `Manage src/mps-compute/fair-allocation.ts:12`；`Manage src/mps-compute/fair-allocation.ts:88` |
| 调拨限额 | 按规则适用沿线legs统计吨数，超上限则相应allocation等比缩小；多段路径按适用边数计；0限额路径另尝试非受限路径 | `Manage src/mps-compute/plan.ts:179`；`Manage src/mps-compute/plan.ts:261` |
| 资源守恒 | 若浮点累加超容量，再等比缩到capacity×(1−1e−12)，最后断言不能超产 | `Manage src/mps-compute/plan.ts:275` |
| 基地库存流 | mainPlan=本地生产件；transferIn/Out沿路径边计；transfer=In−Out；available=opening+production+In−Out；fulfilledDemand=min(demand,max(0,available))；closing=available−fulfilledDemand | `Manage src/mps-compute/plan.ts:293` |
| 未满足与满足率 | unfulfilled=max(0,requiredProduction−本地供本行−异地供本行)，相对容差内归0；fulfillment=min(1,供应/requiredProduction)，requiredProduction=0则1 | `Manage src/mps-compute/plan.ts:298` |
| 供给/中转补行 | 若生产或路径中转基地不在原需求域，再调用computeMpsWorkflow创建参考行，补生产/调拨事实，标记不含本地需求域 | `Manage src/mps-compute/plan.ts:330` |
| 规则 | 规则按有效期、基地、SKU、品类收窄；硬或人工accepted才执行；成本上限与提前期没有成本/日期模型，依据有来源的observations判断，缺观察为pending；不把文字自动执行 | `Manage src/mps-compute/constraint-rules.ts:38`；`Manage src/mps-compute/constraint-rules.ts:159` |

### 5.6 资源报表、金额、汇总、诊断

| 项 | 当前公式/内容 | owner |
|---|---|---|
| RCCP | 物理线capacity=日产吨×天数，按基地×大类候选资源ID去重；只对有候选承接的需求聚合，未承接量单列；load=完整需求吨/完整能力吨；knownLoad=已知需求吨/能力吨；缺完整输入不以known冒充total | `Manage src/mps-compute/capacity-report.ts:48`；`Manage src/mps-compute/capacity-report.ts:178` |
| 系列/组配额 | share=该组承接需求吨/大类承接需求吨；quota=大类能力×share；excess=组需求吨−quota | `Manage src/mps-compute/capacity-report.ts:196` |
| 容量汇总 | 月×基地及全国按唯一物理线求和；margin=capacity−demand；gap=max(0,demand−capacity)；全国不把全国原汇总行再次加到基地行 | `Manage src/mps-compute/capacity-report.ts:231` |
| 全年年度需求 | annual.detail按月基地SKU归并，同键数量相同只取一个、冲突null；排除无编码物料组汇总行；年度件数×件吨折吨，再按财年/基地汇总与能力相比 | [static/mps/source/master-data.js:195](../static/mps/source/master-data.js#L195)；`Manage src/mps-compute/capacity-report.ts:256` |
| 需求金额 | Σ有效需求件数×对应未税到岸单价；Decimal精度80、ROUND_HALF_UP，末端两位小数；generatedAmount只在数量、价格、源覆盖全时出完整值，generatedKnown独立；difference=生成完整金额−源最终计划金额 | [static/mps/source/amount-reconciliation.js:5](../static/mps/source/amount-reconciliation.js#L5)；[static/mps/source/amount-reconciliation.js:78](../static/mps/source/amount-reconciliation.js#L78) |
| 源金额总和 | 金额只接受保留两位小数的decimal，转BigInt分求和再格式化；缺任一条完整amount为null，knownAmount仍保留 | [static/mps/source/source-money.js:13](../static/mps/source/source-money.js#L13) |
| 诊断 | attachPlanReport按行查产线、调拨路径、来源标签、系数和规则，追加分类问题与人工补项；不修改原需求为0或伪造完整通过 | [static/mps/source/plan-diagnostics.js:17](../static/mps/source/plan-diagnostics.js#L17)；[static/mps/source/plan-diagnostics.js:240](../static/mps/source/plan-diagnostics.js#L240) |
| 其它汇总 | sourceCheckRows按当前产品池分类、分别求BI与计划完整量/已知量；ratio=actual/plan。workflow摘要requiredProductionTons仅完整时给总量，knownRequiredProductionTons单列；求解summary scheduledTons从allocation求和，unfulfilled只合计完整评估行 | [static/mps/source/source-projections.js:182](../static/mps/source/source-projections.js#L182)；`Manage src/mps-compute/workflow.ts:684`；`Manage src/mps-compute/plan.ts:364` |
| 年度导出计算 | SKU各月去冲突值、全年仅完整时合计；大类只加SKU，不与源物料组汇总重复相加；导出环比=当月/前月−1，前月为0或缺值则空 | [static/mps/source/annual-workbook.js:3](../static/mps/source/annual-workbook.js#L3) |

## 6. 区分纯计算、I/O、Worker与React呈现

| 工作 | 类型与线程 | 计时边界/重复机会 | owner |
|---|---|---|---|
| 受控取数 | I/O，含共享队列等待、Host解析配置、授权/网关/源查询及回传 | 必须按queryId、参数、count/每页、队列时间分别记录；前端端到端不能当SQL引擎时间 | [business/shared/configured-query-client.mjs:188](../business/shared/configured-query-client.mjs#L188)；GEA src/host/configured-html-query.ts:66（私有验收记录） |
| 来源规范化与匹配 | 主线程纯JS | readAll结果校验/structuredClone、sourceDimensions、产品/老品映射、金额解析；与网络拆开 | [business/shared/configured-query-client.mjs:218](../business/shared/configured-query-client.mjs#L218)；[static/mps/source/source-projections.js:78](../static/mps/source/source-projections.js#L78) |
| 大类/无约束 | 主线程纯计算，在useMemo内运行 | CategoryDemand、两个SourceInputs各算大类；parameters还算无约束；Workflow后续步再算无约束；依赖整份draft时任何来源写入都可能使memo失效，次数须运行计数 | [static/mps/source/category-demand-view.js:35](../static/mps/source/category-demand-view.js#L35)；[static/mps/source/source-input-view.js:31](../static/mps/source/source-input-view.js#L31)；[static/mps/source/source-input-view.js:166](../static/mps/source/source-input-view.js#L166)；[static/mps/source/workflow-view.js:169](../static/mps/source/workflow-view.js#L169) |
| 用户评估 | I/O后在Worker纯计算 | 新Blob、new Worker、postMessage整份draft/relations/shipment/evaluation，结果回传后terminate；结构化克隆、启动、worker内部计算、回传各自计时 | [static/mps/source/workflow-view.js:247](../static/mps/source/workflow-view.js#L247)；[static/mps/source/workflow-worker-client.js:3](../static/mps/source/workflow-worker-client.js#L3)；[static/mps/source/workflow-worker.js:3](../static/mps/source/workflow-worker.js#L3) |
| 一次评估内部 | Worker纯计算 | buildMpsWorkflow先算无约束，再solveMpsPlan内部又算；必要时供给补域再算。然后capacityReport和诊断。不可只测solveMpsPlan并称“整轮计算” | [static/mps/source/workflow-inputs.js:331](../static/mps/source/workflow-inputs.js#L331)；[static/mps/source/workflow-inputs.js:383](../static/mps/source/workflow-inputs.js#L383)；`Manage src/mps-compute/plan.ts:74`；`Manage src/mps-compute/plan.ts:341` |
| React呈现 | 主线程DOM/React，带格式化与筛选派生 | 分页只限制可见行，不等于全量filter/map/index/summary都已分页；hidden组件还挂载。应记录commit、long task和交互，不把纯函数耗时当界面流畅性 | [static/mps/source/demand-confirmation.js:1993](../static/mps/source/demand-confirmation.js#L1993)；[static/mps/source/processed-demand-view.js:230](../static/mps/source/processed-demand-view.js#L230)；[static/mps/source/relations-view.js:181](../static/mps/source/relations-view.js#L181) |
| 助手上下文 | 每个render JSON.stringify，effect里JSON.parse；微任务聚合再I/O publish | 序列化成本按所有参与part测；latest合并只约束发布，不省掉各render stringify；flush串行，身份/Session切换会取消 | [static/mps/source/context.js:37](../static/mps/source/context.js#L37)；[static/mps/source/context.js:61](../static/mps/source/context.js#L61)；[static/mps/source/context.js:98](../static/mps/source/context.js#L98) |
| 本地草稿 | schema校验、JSON/对象处理与Core持久化边界 | encode/decode单独测；不能为优化缓存把业务事实、身份grant或credential混入持久草稿 | [static/mps/source/local-draft.js:29](../static/mps/source/local-draft.js#L29)；[static/mps/source/demand-confirmation.js:1353](../static/mps/source/demand-confirmation.js#L1353) |

## 7. 导出入口必须逐项区分

函数名 `downloadCsv` 不能证明格式。该export函数实际生成XLSX，但 `downloadCsvLegacy` 仍生成UTF-8 BOM CSV。根组件通过参数把不同函数注入各页面，因此当前求解与问题下载是真CSV，金额等为XLSX。见 [static/mps/source/demand-confirmation.js:153](../static/mps/source/demand-confirmation.js#L153)、[static/mps/source/demand-confirmation.js:171](../static/mps/source/demand-confirmation.js#L171)、[static/mps/source/demand-confirmation.js:983](../static/mps/source/demand-confirmation.js#L983)。

| 入口 | 真实格式/过程 | caller |
|---|---|---|
| 求解结果、产销存结果、分类问题清单 | Workflow注入Legacy，CSV串行map转文本、转义、join、Blob下载 | [static/mps/source/demand-confirmation.js:985](../static/mps/source/demand-confirmation.js#L985)；[static/mps/source/evaluation-view.js:335](../static/mps/source/evaluation-view.js#L335)；[static/mps/source/evaluation-view.js:676](../static/mps/source/evaluation-view.js#L676) |
| Workflow内需求、缺项、资源、约束、产能报告等downloadCsv | 同一Legacy CSV依赖继续传给ProcessedDemand、SourceDiagnostics、InventoryTargetPanel、EvaluationOverview，后者再传CapacityReport | [static/mps/source/workflow-view.js:111](../static/mps/source/workflow-view.js#L111)；[static/mps/source/evaluation-view.js:103](../static/mps/source/evaluation-view.js#L103) |
| 发货明细/发货库存 | Shipment注入Legacy，真实CSV | [static/mps/source/demand-confirmation.js:996](../static/mps/source/demand-confirmation.js#L996) |
| 需求金额对比 | Workflow.downloadAmounts=导出downloadCsv，再注入AmountReconciliation为其downloadCsv，最终XLSX | [static/mps/source/demand-confirmation.js:988](../static/mps/source/demand-confirmation.js#L988)；[static/mps/source/processed-demand-view.js:40](../static/mps/source/processed-demand-view.js#L40)；[static/mps/source/amount-reconciliation-view.js:88](../static/mps/source/amount-reconciliation-view.js#L88) |
| 产品关系、来源卡、主数据弹窗、多维发货、参数/基础指标、年度business导出 | 注入export downloadCsv或显式downloadWorkbook，最终XLSX；report来源下载另附金额汇总sheet | [static/mps/source/demand-confirmation.js:461](../static/mps/source/demand-confirmation.js#L461)；[static/mps/source/demand-confirmation.js:983](../static/mps/source/demand-confirmation.js#L983)；[static/mps/source/demand-confirmation.js:1116](../static/mps/source/demand-confirmation.js#L1116)；[static/mps/source/demand-confirmation.js:2053](../static/mps/source/demand-confirmation.js#L2053) |
| 非business年度已读底稿 | Legacy CSV分支 | [static/mps/source/demand-confirmation.js:971](../static/mps/source/demand-confirmation.js#L971) |
| 全量本地核对底稿 | JSON.stringify后application/json下载 | [static/mps/source/demand-confirmation.js:1933](../static/mps/source/demand-confirmation.js#L1933) |

XLSX路径 `workbookBytes` 动态import xlsx、构造sheet矩阵、首次write、CFB重读ZIP、修改sheet XML冻结首行、再压缩。应分别测首次import与暖导出；CSV路径不承担该成本。CSV和XLSX均包含准备导出rows的计算，应同时测“rows准备”“编码/压缩”“Blob发起”，不要只测最后click。见 [static/mps/source/workbook.js:1](../static/mps/source/workbook.js#L1)、[static/mps/source/demand-confirmation.js:250](../static/mps/source/demand-confirmation.js#L250)。

运行产物核对边界：前轮loaded.json记录htmlSha=c5c6fee2…、productionScriptExact=true；当前checkout index.html全文SHA=778c553e…，SQL SHA=37db7cc2…与该loaded记录一致。HTML全文可受运行注入影响，单凭全文SHA不同不能断言业务脚本漂移。本报告公式以固定HEAD作者源为准；本轮性能报告须核实际装载脚本并记录运行输入，而不能沿用历史数字。

## 8. 潜在复杂度热点与逐项应测清单

下列是源码推导的候选热点；哪些被本轮实测确认、哪些未触发或待测，见第9节。

| 候选热点 | 静态原因 | 必测规模/指标 | owner |
|---|---|---|---|
| category-history SQL | 同一来源聚合在当前、同比、上月、全年子查询中重复展开；业务月过滤在最外层；count也做复杂聚合 | 三个年度分别计count和各页、源SQL执行计划/扫描行、网关与传输时间；不能仅按SQL长短下结论 | [static/mps/sql.config.json:939](../static/mps/sql.config.json#L939) |
| 同族count与OFFSET | readAll重复count，多个页反复GROUP BY/ORDER BY/OFFSET；多卡抢共享4槽 | count占比、首个数据页、后页随offset成本、队列等待；源数据变化拒绝场景不能删 | [business/shared/configured-query-client.mjs:290](../business/shared/configured-query-client.mjs#L290) |
| 同源重复读 | 产品初读/主数据弹窗/关系/评估再读；年度summary/pool/detail/export语义有差异；历史卡/basic/全年也有不同期间 | 逐queryId+完整参数去重比，区分相同scope与只是同表；先核权限/身份/版本生命周期再考虑复用 | [static/mps/source/relations.js:10](../static/mps/source/relations.js#L10)；[static/mps/source/workflow-view.js:257](../static/mps/source/workflow-view.js#L257) |
| 件吨分批 | 100codes串行批次，每批仍两count；年度额外code二阶段读取 | 首次/复用、批次数、每批行数、补读code数、读耗时及转换耗时 | [static/mps/source/unit-weights.js:19](../static/mps/source/unit-weights.js#L19)；[static/mps/source/workflow-view.js:281](../static/mps/source/workflow-view.js#L281) |
| 大类函数多次扫描 | categories×6月×3年对historical.filter，加上checks/annual/find；复杂度随分类数与历史数组长度增长 | 固定真实输入与2倍/5倍扩展，分别计buildCategoryDemand、computeMpsCategoryDemand及调用次数 | `Manage src/mps-compute/category-demand.ts:44` |
| 无约束重复计算 | 整draft依赖、多个组件重复入口、受限求解再建reference；资源×行×allocation多处filter | 每步调用次数、各子段、自身时间与累计时间、输入/输出规模 | [static/mps/source/workflow-view.js:169](../static/mps/source/workflow-view.js#L169)；`Manage src/mps-compute/workflow.ts:576` |
| 公平分配 | 每个瓶颈固定轮最多42次二分，每次重建并解最大流；最坏固定轮数不超过正需求数；图顶点=需求+资源+2，边数随候选关系增加 | local/supplemental分别计，分月计，记录需求/资源/边/固定轮/allocate调用次数；饱和、宽裕、稠密候选、隔离资源分别覆盖 | `Manage src/mps-compute/fair-allocation.ts:88` |
| 路径与诊断 | 每行反复filter路线、BFS并对每出队节点再扫selected边；plan与attachPlanReport各算路径；规则、候选资源、allocations多处逐行过滤 | plan候选整形/路径/公平求解/回填/attachPlanReport分段；路线数、基地数、SKU数与issues行数 | `Manage src/mps-compute/plan.ts:26`；[static/mps/source/plan-diagnostics.js:46](../static/mps/source/plan-diagnostics.js#L46) |
| RCCP与年度 | 月×资源×日历、月×基地×年度行扫描；按组索引部分已建，勿重复推荐已存在索引 | buildCapacityReport、resolveWeightPairs、annual normalization；全年行数、月/线/组数 | `Manage src/mps-compute/capacity-report.ts:48` |
| 主线程派生和上下文 | 隐藏check组件仍活；大量格式化、全量JSON.stringify、context复制、草稿schema，可能与数据分批到达叠加 | 取数完成前后React commit/long task、上下文bytes、序列化次数/时间、输入后首帧和稳定时间 | [static/mps/source/context.js:98](../static/mps/source/context.js#L98) |
| Worker及导出 | 每次评估新Worker与整份结构化克隆；CSV矩阵、XLSX二次ZIP过程 | Worker启动+传入/回传、worker函数内、CSV/XLSX首次与暖导出分别测 | [static/mps/source/workflow-worker-client.js:17](../static/mps/source/workflow-worker-client.js#L17)；[static/mps/source/workbook.js:1](../static/mps/source/workbook.js#L1) |

计时需要区分：首次进入页面、切换评估月份、切期初/纠偏、切历史年、同步按钮、首次评估、复用件吨后的再次评估、切步骤/筛选/翻页、CSV与XLSX导出。记录统一输入行数与状态、源返回行数与页数、是否命中既有读取、耗时口径和失败。网络、纯计算、React呈现、持久化和导出不应合成一个“计算耗时”。

现有机制可复用：WB的MPS路径选中mps浏览器/关系/输入/来源测试；Manage的src/mps-compute路径选中mps-workflow测试，package test:mps-compute同时列workflow及category-demand测试。当前检索未见MPS专用性能预算或真实数据规模性能门禁；其它summary-query-performance不能当作MPS性能保障。此处只报告现状，不新增治理检查。见 [scripts/ci-test-policy.json:67](../scripts/ci-test-policy.json#L67)、`Manage scripts/ci-test-policy.json:54`、`Manage package.json:95`。

### 8.1 键构造热点的具体调用位置与可选实现

此处给后续测量对应源码，优化仍未实施。令R为计划行数，W为件吨记录数，A为资源分配数，T为调拨边数。

| 热循环 | 当前实现 | 对应优化方向与必须保留的语义 |
|---|---|---|
| workflow `key` | `Manage src/mps-compute/workflow.ts:174` 每次JSON.stringify([base,code])；`Manage src/mps-compute/workflow.ts:566` 对每行filter全部unitWeights，filter中重造weight键与不变row键，O(R×W) | 每轮一次groupBy(unitWeights,key)，按row键直接取记录数组，继续保留“多条即非唯一”的校验；仅改键拼接格式不能消除全表扫描 |
| workflow 资源分配 | `Manage src/mps-compute/workflow.ts:585`、`Manage src/mps-compute/workflow.ts:602`、`Manage src/mps-compute/workflow.ts:630` 逐行/逐资源filter或some全部allocations，循环内重复key两侧 | 按month→baseSKU→resourceId分组；按base/kind索引资源候选；保留原同类份额和为1、未知/跨基地资源、重复分配校验 |
| plan `rowKey` 与 `unitWeight` | `Manage src/mps-compute/plan.ts:24`及`Manage src/mps-compute/plan.ts:103` 每次Map查值前JSON.stringify；`Manage src/mps-compute/plan.ts:176` 每个计划row扫描全部transferRoutes，逐边两次unitWeight，形成O(R×T)次键构造 | 已有coefficientIndex不需再泛称“加索引”；应把唯一有效weight先解析一次，并按code预分routes，只扫描本SKU边。保留from/to件吨严格一致和多条权重拒绝 |
| 路径、规则重复求值 | `Manage src/mps-compute/plan.ts:170` pendingAt多次扫rules；`Manage src/mps-compute/plan.ts:178`、`Manage src/mps-compute/plan.ts:179`、`Manage src/mps-compute/plan.ts:200` 同行重算不同路线集路径；[plan-diagnostics.js:52](../static/mps/source/plan-diagnostics.js#L52) 诊断另算全路径 | 以month/code/destination和已确定规则状态构建本轮索引/短生命周期缓存；区分全边、允许边、零限额后边，不能混成一张路径表绕过规则 |
| 无约束reference重复 | [workflow-inputs.js:331](../static/mps/source/workflow-inputs.js#L331)已经算过，随后`Manage src/mps-compute/plan.ts:74`又算，缺供给域时`Manage src/mps-compute/plan.ts:341`再算 | 先测每份成本和输入是否等价，再考虑内部入口复用已算reference；保持planSources装配后与初次workflowInput的差异，不能直接以旧参考替代不同资源/件吨/日历输入 |

### 8.2 结果体积与线程成本的核验位置

Worker已存在，不能把“引入Worker”作为本项目的新方案。先分解同一结果的顶级字段、plan字段、rows各字段与resourceLoads.missing字节，再决定是否有必要调整返回合同。重点核`Manage src/mps-compute/workflow.ts:316` 每行capacities复制、`Manage src/mps-compute/workflow.ts:359`每行missing、`Manage src/mps-compute/workflow.ts:624`每个资源对同基地所有行追加原因、`Manage src/mps-compute/workflow.ts:697`汇总原因、`Manage src/mps-compute/plan.ts:54`整行继承与missing克隆，以及[plan-diagnostics.js:240](../static/mps/source/plan-diagnostics.js#L240)按行扩充reportMissing和分类问题。这里列出重复展开位置，不预判哪部分占最大体积。

可选方向是在同一次计算中复用规则/来源/原因字典与稳定关系索引，在需要完整明细的导出、公式查看时按ID取回；必须保留每行的来源、缺项、系统值、有效值、调整留痕以及unknown/partial。助手上下文已有按planning阶段裁剪的分支，[workflow-view.js:388](../static/mps/source/workflow-view.js#L388)，不能把完整Worker结果大小直接当成助手传输量。验收应分别比较完整业务结果、Worker传输、页面状态、上下文和导出，不只比较JSON字节。

## 9. 本轮实测与优化方案

### 9.1 结论与测量边界

**当前慢在大量分页往返和两处循环内全表扫描。** 年度完整读取占用约169秒，之后还有约5.6秒件吨补读；纯计算两处临时索引实验已把同一输入从约24.9秒降到2.35–2.43秒。导出格式化在本轮样本中低于0.2秒。建议先落两处索引，再减取数往返；大类公式、最大流算法和XLSX库重写暂不列为首批改动。

本轮只研究、只读取数、执行临时模块实验和写报告。业务源码、SQL配置、安装版本、原草稿和原失败证据均未替换；未发布。临时实验不是已经上线的优化。

| 场景 | 本轮输入和环境 | 能支持的结论 |
|---|---|---|
| 离线真实输入 | Nov11原验收的冻结草稿与发运、1,286个产品、6,302条SKU产能、590条隧道来源行/66个物理资源、5,935条最新调拨边、1,286条件吨来源记录；Node v24.14.1 | 可复现当前数学函数热点与临时改动的完整结果一致性。无网络/React，最初不含全年参考 |
| 完整年度补测 | 使用当前queryId、参数生成器、分页/键/配置版本校验、真实登录及mps Consumer授权；年度12个月展开45种源月表示 | 全部年度读取及补件吨的真实服务等待。直接执行受控服务，保留configured-query-client的MPS四槽调度，但未经过页面通道与Host运行态，因此不是Native总耗时 |
| Native初读 | 重开原授权profile，实际装载脚本和SQL版本另存证；仅注入元数据计时观察器 | 139秒时已发255次请求、完成251次、4次未完，观察到30个queryId。随后页面关闭，原因未确认，没有完整首读终态，不能写成“首读139秒” |
| 浏览器Worker | Chrome 157.0.8103.39，真实输入先送入隔离页面；完整数学产物放入classic Worker，并加计时包装 | 线程启动、传入、数学与结果回传的分解；不含Native Host、实际React界面、全年参考、页面输入准备 |
| 导出 | 当前CSV函数、XLSX writer、金额导出表构造函数，Node中计时 | 字符串/工作簿生成成本；不含浏览器下载启动、操作系统保存或原生磁盘完成 |

当前计划12,783行，完整可排产行0、缺项明细30,251条。大量SKU需求为unknown，**没有用0伪造需求，也没有覆盖“全部需求有效且大量竞争产能”的负载**。因此公平分配的低耗时不能推导为未来完整排产也快。Node和Chrome数字各自比较，不能跨环境计算加速比。小样本按实际值报告，尚未形成p95或严格性能预算。

证据：benchmark-snapshot-baseline.json（私有验收记录）、benchmark-snapshot-instrumented.json（私有验收记录）、prototype-comparison.json（私有验收记录）、native-query-inflight-summary.json（私有验收记录）、live-query-metrics.json（私有验收记录）、cube-correct-routing-metrics.json（私有验收记录）、supplemental-summary.json（私有验收记录）、export-benchmark.json（私有验收记录）、browser-worker-benchmark.json（私有验收记录）。首次遗漏默认Cube路由的四次探测未找到工具，后来按生产默认`mcp.cube`恢复并成功读取；失败记录保留，不计入Cube耗时。年度只查标准月份的85秒样本同样保留，但不能代替完整169秒样本。

### 9.2 每个查询的服务耗时

下表穷举41个queryId，各取两次；SQL数据查询取首200行，count取该样本范围总数。`返回行数 / 结果总数`中的count总数是首行`total`，Cube总数来自响应；SQL明细未请求总数时为“—”。两次不是数据库冷/热缓存控制实验。时间含网关、网络、响应解析与当前执行器开销，不是DB引擎自身执行时间。Cube首个3,303.9ms还含连接协商约0.6秒；其余复用连接。

样本参数全文在live-query-metrics.json（私有验收记录）和cube-correct-routing-metrics.json（私有验收记录），不含认证头：大多数业务月2026-11；历史月2025-11；发运样本2026-10、截止22日；近三天20–22日；类别历史样本2025年7–12月；目标库存2026-11至2027-01；件吨首100编码；年度首轮仅标准12月字符串。按来源表、字段、单位、真实期间和完整scope读法见第2–4节；这些首屏样本不能代表完整集合。

| queryId | 路径 | 两次毫秒 | 返回行数 / 结果总数 |
|---|---|---:|---:|
| `products.detail` | SQL | 1094.0 / 1132.6 | 200 / — |
| `products.count` | SQL | 1018.4 / 1052.5 | 1 / 1286 |
| `annual.detail` | SQL | 1232.3 / 1186.6 | 200 / — |
| `annual.count` | SQL | 1058.9 / 1032.4 | 1 / 27720 |
| `tunnels.detail` | SQL | 1152.5 / 1556.6 | 200 / — |
| `tunnels.count` | SQL | 1028.5 / 1015.9 | 1 / 590 |
| `sku_capacity.detail` | SQL | 1148.4 / 1218.1 | 200 / — |
| `sku_capacity.count` | SQL | 1023.7 / 1085.7 | 1 / 6302 |
| `transfers.detail` | SQL | 1203.7 / 1213.5 | 200 / — |
| `transfers.count` | SQL | 1216.9 / 1512.7 | 1 / 5935 |
| `annual.summary` | SQL | 1546.3 / 1237.9 | 200 / — |
| `annual.summary.count` | SQL | 1120.2 / 1100.4 | 1 / 560 |
| `facts.plan-quantity` | SQL | 1284.4 / 1468.6 | 200 / — |
| `facts.plan-quantity.count` | SQL | 1376.9 / 1469.7 | 1 / 3099 |
| `facts.report` | SQL | 2480.2 / 2252.5 | 200 / — |
| `facts.history` | Cube | 3303.9 / 1681.2 | 200 / 2459 |
| `facts.shipment-latest` | SQL | 1174.6 / 1183.8 | 1 / — |
| `facts.shipment` | SQL | 1552.8 / 1351.1 | 200 / — |
| `forecast.detail` | SQL | 1188.8 / 1511.8 | 200 / — |
| `forecast.count` | SQL | 1086.7 / 1075.8 | 1 / 2387 |
| `delivery.detail` | SQL | 1479.4 / 1250.1 | 0 / — |
| `delivery.count` | SQL | 1164.1 / 1126.4 | 1 / 0 |
| `annual.export` | SQL | 1527.6 / 1201.5 | 200 / — |
| `annual.export.count` | SQL | 1048.3 / 1115.0 | 1 / 4692 |
| `facts.report.count` | SQL | 1837.1 / 1408.2 | 1 / 6036 |
| `plan-rate.detail` | SQL | 1222.0 / 1200.7 | 200 / — |
| `plan-rate.count` | SQL | 1073.3 / 1033.5 | 1 / 3962 |
| `category-history.detail` | SQL | 2576.8 / 1917.1 | 48 / — |
| `category-history.count` | SQL | 1376.2 / 1364.1 | 1 / 48 |
| `annual-pool.detail` | SQL | 1425.9 / 1590.0 | 200 / — |
| `annual-pool.count` | SQL | 1736.3 / 1274.0 | 1 / 560 |
| `unit-weights.detail` | SQL | 1116.2 / 1189.3 | 100 / — |
| `unit-weights.count` | SQL | 1138.5 / 1064.8 | 1 / 100 |
| `facts.history-annual` | Cube | 2465.7 / 1734.5 | 200 / 4070 |
| `facts.shipment.count` | SQL | 1066.7 / 1059.6 | 1 / 3598 |
| `inventory-targets.detail` | SQL | 1739.8 / 1282.9 | 200 / — |
| `inventory-targets.count` | SQL | 1048.2 / 1126.3 | 1 / 5156 |
| `products.prices` | SQL | 1126.2 / 1182.1 | 200 / — |
| `products.prices.count` | SQL | 1093.0 / 1142.3 | 1 / 1507 |
| `facts.report-amounts` | SQL | 1842.6 / 1277.6 | 200 / — |
| `facts.report-amounts.count` | SQL | 1408.5 / 1044.2 | 1 / 3099 |

SQL39种均两次成功；Cube2种经正确路由也均两次成功。类别历史detail、提报事实等单次可达约2秒，应再取DB侧计划定位扫描/聚合；当前证据不足以归因某个索引缺失、数据仓库引擎或网关某层慢。

### 9.3 完整评估取数与关键等待

使用现有`readRelations`、`readUnitWeights`及`readAll`实际运行：

| 集合 | 数据规模 | 请求数 | 集合经过时间 | 调度说明 |
|---|---|---:|---:|---|
| 产品/产线/隧道/调拨关系 | 1,286 / 6,302 / 590 / 5,935 | 80 | 41.66秒 | 四来源并发；各自2次count、先首数据页、后最多3页并发 |
| 当前产品件吨 | 1,286编码、1,286返回行 | 39 | 69.03秒 | 13批，每100编码一批，批之间串行；每批两count和一明细 |
| 年度首次标准月样本 | 27,720行 | 141 | 85.34秒 | 与上两项同时读取，仅为发现月份scope偏小的中间样本 |
| **年度真实完整月参数** | **64,826行** | **327** | **168.91秒** | 单独按完整45个月份表示补测；2次count+325页。当前maxRows100,000未超限 |
| 年度归并 | 64,826源行→45,284月/基地/SKU记录 | 纯计算 | 64.4毫秒 | 19,500条空SKU行剔除，42条重复键合并；不是直接SUM重复数量，冲突仍保留unknown |
| 年度额外件吨 | 197额外编码、50返回行 | 5 | 5.56秒 | 年度完成后再触发，2批；空结果批仍两count。缺来源不会自动当0 |

完整读取合计451个服务请求（关系80+当前件吨39+全年327+补件吨5）。这个数字来自各集合请求数，不代表一次完整Native trace。真实界面先并发前三类，再等年度额外件吨；直接服务测试保留Workbench四槽调度，但不含页面通道及Host运行态，且完整年度另一次测量，**不能把41.66+69.03+168.91相加，也不能把max(...)当作本轮已完成的原生评估计时**。前次业务验收约214.5秒仅作历史背景，不用于计算本轮改动收益。

正常SQL `readAll`每个集合有读取前后count；它能发现总数变化，**不构成原子快照**。Cube200行串行翻页且有total/offset检查。当前MPS不在Host通用SQL结果缓存的consumer名单内。故首选同scope的本轮读取复用、批量能力和可确认版本的快照，不建议直接删count、提升到无界并发或开跨身份通用缓存。

evaluation-reads-summary.json（私有验收记录）；annual-full-read-summary.json（私有验收记录）；supplemental-summary.json（私有验收记录）。现有四槽与分页实现见第2节。额外补读后的完整数学计时见9.5。

### 9.4 纯计算逐段定位

未插探针的一次Node基准27.99秒；同一数据的两次插探针回放25.28/25.33秒。下表是两轮累计除以2，调用次数仍是两轮总数。inclusive含子调用，self仅扣除被探针覆盖的子调用；**父子耗时不能相加，self也不是源码每行精准耗时**。

| 函数 | 两轮调用数 | 每轮inclusive毫秒 | 每轮self毫秒 |
|---|---:|---:|---:|
| `buildMpsWorkflow` | 2 | 25302.4 | 196.0 |
| `computeMpsWorkflow` | 4 | 12710.1 | 12701.6 |
| `solveMpsPlan` | 2 | 24476.9 | 11704.4 |
| `transferSupplyPaths` | 76698 | 388.6 | 388.6 |
| `buildPlanSources` | 2 | 171.2 | 68.7 |
| `attachPlanReport` | 2 | 168.6 | 51.5 |
| `matchTunnelCapacity` | 12604 | 94.4 | 86.1 |
| `buildCapacityReport` | 2 | 43.9 | 43.9 |
| `buildCategoryDemand` | 2 | 25.6 | 16.4 |
| `computeMpsCategoryDemand` | 2 | 1.2 | 1.2 |
| `fairAllocate` | 12 | 0.8 | 0.8 |

CPU采样显示`workflow.key`约11.1秒、`plan.rowKey`约6.8秒为采样self热点；不是为了推荐替换JSON.stringify，而是其在内层全表扫描中被调用了数千万次。

1. `workflow.ts:566`逐计划行filter全部件吨记录，约O(R×W)。临时实验只把相同键的记录数组预分组，保留重复记录的拒绝语义。
2. `plan.ts:176`逐计划行扫描全部调拨边，先对两端查询该行SKU件吨，再在路径函数内筛本SKU。临时实验先按`route.code`分组，只扫描本SKU边。日期最新快照、多段路径与逐段量、件吨一致性仍按原逻辑。
3. 资源assignment过滤、路径/规则重复、诊断仍可再优化，但当前路径函数平均约389ms、关系匹配约94ms、诊断约169ms，首批应先处理上述两项。
4. 当前大类公式约1.2ms，整个大类输入构造约25.6ms，金额约7–8ms。没有证据支持优先改公式或更换数值算法。
5. `fairAllocate`两轮12次总计约1.6ms，只反映本次unknown需求很少进入正需求竞争；需另补有效需求/瓶颈/密集边基准，不能据此关闭这项后续检查。

具体源码及保留条件见8.1；完整探针及CPU采样：benchmark-snapshot-instrumented.json（私有验收记录）、function-probes.json（私有验收记录）、snapshot.cpuprofile（私有验收记录）。

### 9.5 两处索引临时实验与全年对照

以下Node对照使用同一真实冻结输入，不含全年参考；每次临时模块完整计算后与原完整结果对象`deepEqual`，不只核摘要或哈希。原业务文件未改。

| 临时模块 | 每次秒数 | 结果核对 |
|---|---:|---|
| 原计算 | 24.866 | 比较基准 |
| 仅件吨分组索引 | 14.575 / 13.928 | 完整对象 deepEqual 通过 |
| 仅按SKU分组调拨边 | 15.426 / 15.337 | 完整对象 deepEqual 通过 |
| 两处同时修改 | 2.432 / 2.351 | 完整对象 deepEqual 通过 |

两处同时改平均约2.39秒，较同组24.87秒少约90.4%的纯函数等待，约10.4倍。只改其中一处仍会被另一处扫描拖住。Node V8预热、机器负载和小样本影响绝对数字；这是可进入实现的证据，不是承诺真实评估十倍提速。

再用冻结草稿/发运与本轮完整关系、件吨、45,284条年度归并及额外件吨组成输入，Node单轮原计算**25.196秒**、两处索引**2.450秒**，完整结果`deepEqual`通过。12,783行、完整可排0行、缺项30,251条，结果JSON 122,206,403字节。这里是冻结+新读取的混合快照，并未证明业务源原子同刻；不含IO和React。证据：full-evaluation-benchmark.json（私有验收记录）。

### 9.6 Worker、结果体积、呈现与导出

当前已有Worker，不能再把“引入Worker”当作新方案。隔离Chrome 157.0.8103.39的同输入测量如下，时间单位毫秒。`传入到达`包含同步postMessage阶段；`回传到达`包含Worker postMessage克隆、消息派发与主线程收到结果，不等同纯克隆。数学入口不含全年参考、输入在计时前已送进页面。

| 模块 | 启动 | 同步postMessage | 传入到达 | 数学 | 回传到达 | 总计 |
|---|---:|---:|---:|---:|---:|---:|
| 原计算 | 11.2 | 49.8 | 96.6 | 17207.9 | 397.4 | 17713.1 |
| 两处同时修改 | 3.1 | 41.7 | 87.4 | 2136.2 | 363.1 | 2589.8 |

此处只核行数/问题条数；临时变体的完整字段一致性由Node对照验证。该浏览器计时包装不是正式Native `computeWorkflow`页面验收。

无全年参考结果JSON **121,612,180字节（121.6MB）**，Node stringify约0.30–0.46秒、structuredClone约0.50–0.75秒。顶级workflow rows约42.88MB，plan约75.11MB，其中plan.rows49.21MB、reportIssues19.43MB、capacityReport6.42MB；comparisonSources3.22MB。workflow.rows逐字段累计missing约16.48MB、inventoryTarget3.51MB、reportLayers2.36MB、historyLayers1.99MB。字段值体积不含键/分隔符，不与完整对象字节精确相加。

本次`resourceLoads`为空；不是它造成121MB。结果中重复展开的来源/缺项/完整行才值得核去重。完整Worker结果大小也不等于助手上下文上传量，现有context已有planning裁剪。建议按层分别测Worker、状态、context与导出；只有保全逐行可追溯性后才压缩DTO或按ID展开。

| 导出/关联计算 | 两次毫秒 | 行数 | 输出字节 |
|---|---:|---:|---:|
| `amount-reconciliation` | 8.3 / 6.7 | — | — |
| `amount-xlsx` | 9.2 / 1.6 | 10 | 11711 |
| `source-xlsx-6302rows` | 188.3 / 170.5 | 6302 | 1138049 |
| `issues-csv` | 42.5 / 32.5 | 30251 | 13383900 |

金额表确实走XLSX，虽上游函数名/download调用初始后缀仍含csv；缺项等计划表走真实UTF8 CSV。XLSX测量执行现有建表→写ZIP→CFB读回→冻结表头XML→再次压缩过程。金额XLSX10行，来源XLSX按实际6,302行/14列源明细测试，缺项CSV按30,251行/16列测试；后者13.38MB。没有发现纯格式化秒级瓶颈。这里不包括Native文件保存完成，也未证明大于这些规模、全部年度行或多sheet导出都一样快。

**未取得终态的部分必须保留为待测。** Native页面在初读中关闭，无法完成真实七步切换的React commit、筛选/翻页首帧、助手context发布/草稿持久化与下载落盘测量。既有观察中单个long task约57ms不能证明整个界面流畅。隐藏组件、全量filter/map、render内JSON.stringify是源码候选，当前不能写成已证实的主要瓶颈。实现两处索引后，再在稳定Native窗口按“取数完成→切步骤→改输入→筛选→下载→取消/重评估”采一轮，保留慢的场景再改。

result-size-breakdown.json（私有验收记录）；export-benchmark.json（私有验收记录）；browser-worker-benchmark.json（私有验收记录）。

### 9.7 整体优化方案与验收

| 顺序 | 具体改动 | 预期收益依据 | 必须保留与验证 |
|---|---|---|---|
| **P0：两处计算索引** | Manage workflow件吨按base/SKU分组一次；plan调拨边按SKU分组一次。不改键定义、不改公式，不扩为全局缓存 | 已有全字段一致的临时对照，纯计算24.87→约2.39秒；本轮收益最明确、改动小 | 真实冻结输入全字段一致；0/unknown、重复件吨、多渠道、多段调拨、全路径/允许路径/零上限分别核；运行现有Manage mps-compute及WB相关输入/Worker测试 |
| **P1：本轮读取复用和件吨批量** | 使用相同queryId+完整参数的本轮Promise/快照复用；主数据已读且状态/版本仍有效时复用关系来源。件吨100→200需按现有参数上限、分页和重复来源验证；有界并发先压测 | 关系重复读80次；当前件吨13批/39次。现有1行/编码样本若200一批可变7批/21次，少18次；多渠道/多行会改变页数，不能普遍保证21次 | 身份/tenant/consumer、配置版本、月份/截止日、schema/grain、源刷新与用户同步状态必须隔离；失败不复用成功旧值，取消不污染别轮。保持范围外编码拒绝与duplicate校验 |
| **P1：全年读取减往返** | 与数据服务方确认可发布版本的年度归并结果/批量页；尽量在源侧输出月/基地/SKU归并值+冲突/空SKU/来源计数，或提供有版本的更大分页/快照流。先复用已有整年读取，避免summary/pool/detail等相同scope重读 | 真实327次、168.9秒最显著。年度投影仅64ms；优先减少传输与往返，不能期待改JS投影省169秒 | 当前maxRows/数组限制不能由页面绕过。重复数量冲突不能SUM成值；年份/月别名、空SKU、category/group/series冲突、源总数/快照版本全核。没有DB计划前不指定索引或数据库引擎 |
| **P1：关键路径与补读** | 若业务允许，将受限三个月计划和全年RCCP参考分段出结果，年度参考显示独立“读取中/待补/完成”；或由源侧一次提供年度所需编码/件吨，消除补读串行依赖 | 全年后额外197编码约5.6秒；避免三个月计划必须一直等全年。需先确认七步结果中哪些字段依赖全年 | 不得标整个报表完整、隐藏annual.weightError或悄悄用主产品池替代全年；原授权只研究，本方案尚未实施，业务呈现变化需明确验收口径 |
| **P2：结果展开减重** | 保留一份行与缺项/来源字典，页面与导出按ID关联；先只改Worker返回或页面派生中有证据重复的层，不跨Core草稿合同大重构 | 121.6MB；Worker回传约0.36–0.40秒，非本轮首要秒数，但影响内存、后续render和未来规模 | 核逐行系统值/有效值、调整留痕、缺项全部内容、层级来源、导出与公式查看仍能取回；不得删掉unknown/partial或原错误证据 |
| **P2：按证据优化主线程与源SQL** | 测出React/context/保存真正慢的步骤后缩小memo依赖、只算活跃视图；对类别历史等取DB侧profile，确认后把过滤/聚合前推、复用发布结果 | 当前页面终态未测；类别历史首屏约2秒只是候选，金额/CSV/XLSX没有主瓶颈证据 | 不提前重写公平分配、不盲加Worker或更换XLSX库；保留同一截止日/分子分母/来源字段，取消和迟到结果归原执行 |

验收分层：

1. **公式和结果**：固定当前真实快照，P0/P1不变更业务口径时完整输出对象一致；相同来源范围、顺序无关、0和NULL/unknown区分。核最新调拨关系覆盖未来各月、完整多段路径逐段守恒、近3天/本月速度为0回退近30天、仍为0待定；不得补造需求0消除缺项。大类YoY/MoM、两段平均、金额逐SKU未税单价和两位舍入保持原公式。
2. **有需求的负载**：复用现有200产品Worker夹具扩为接近真实的SKU/资源/边密度；补宽裕、瓶颈、密集候选、隔离资源，分别报告fairAllocate轮数/图规模/耗时。性能优化不得改变硬规则、局部/补充分配先后、公平性和零限额结果。
3. **取数和安全边界**：同身份及同scope复用成立；跨用户/tenant/consumer/期间/截止日/配置/同步不得命中；count变化、范围外编码、重复业务键、权限失败、取消、迟到返回仍保留原行为。版本化快照合同确定前保留现有检查。
4. **时间与资源**：同机器、同HEAD组合、同输入，分别记录首次/再次评估至少数轮；每阶段wall time、服务/队列、调用数、输出bytes和内存，不加总并行耗时。先以P0当前基准全字段一致且显著降低CPU、件吨减少请求、全年减少页往返为可审核门槛，再用正常机器分布定p95，不把单次2.39秒直接写成CI硬预算。
5. **实际运行**：原Native profile稳定装载后做完整七步、取消/重试、切月份、再次评估、下载完成与格式/数值核验。源码测试、隔离浏览器计时、Native组合验收、发布生效分别留证。本轮没有发布，也没有完整Native性能终态。

## 10. Retro：改进本次研究与后续编码环境

本节针对本次会话和实际仓库机制，按影响排列。属于可实施候选；用户本轮要求研究与方案，**本轮未加门禁、未改AGENTS、未改业务代码**。

| 优先级 | 本轮证据与环境缺口 | 机械改进候选 | 沿用机制及需要人判断的部分 |
|---|---|---|---|
| 高 | 临时Native启动器最初缺renderer/lib链接，恢复时读取原始启动日志曾将本地访问令牌带入工具输出；此后已用白名单元数据和脱敏，不再输出原始启动日志 | 在现有启动/观测工具的输出边界只允许PID、路径、版本、queryId、scope、耗时、行数、状态；认证字段在进入记录前丢弃。用已脱敏失败日志测试secret字段不会出现在stdout/工件 | 不给AGENTS再加“不要泄密”口号；复用现有window-admission与launcher，明文登录只原位读取，报告不复制。此候选比增加Agent文字规则可靠 |
| 高 | 首次Cube调用遗漏默认source路由，年度最初只标准月导致27,720与64,826范围偏差；保护断言及实际sourceMonthValues最终暴露问题；探针也曾猜错count queryId，被参数/注册校验拒绝 | 复用真实reader构建只读测量入口，参数和路由从owner导入，不在探针另写一套；输出固定HEAD、输入scope、规范化前后行数、配置SHA；自动核对与页面读法一致 | 现有configured-query-client的登记、参数、键、版本校验已有效，继续保留；不要把错误探针的失败记成服务不可用或优化收益 |
| 高 | 当前夹具200产品/一个资源只验Worker/CSP/结果/取消和timer tick；真实12,783行、121.6MB会暴露循环扫描，而当前unknown需求又掩盖公平分配负载 | 在现有MPS测试入口旁复用中/大规模数据，报告调用增长、传输bytes、CPU分段；先建立基线再设预算。加入完整可排需求的密集资源竞争样本 | WB有test/test:browser/quality:fast/quality:ci及affected browser，Manage已有test:mps-compute与mps-workflow选测，不能另宣称“仓库无CI”。绝对/相对预算、真实数据脱敏和CI噪声阈值需判断 |
| 中 | 当前只能拿到服务往返，不能分清DB扫描/网关/队列；Native页面中途关闭，没有完整终态。临时恢复还受缺链接、残留端口与mac退出生命周期影响 | 在现有launcher接入可复用只读性能模式：核自身PID/端口/完整资源、记录阶段状态与关闭原因、按任务所有权收尾；服务提供requestId关联的queue/execute/serialize阶段，不记录令牌/原始行 | 复用现有组合输入/window-admission，不再造全局启动平台。无终态必须标未完成；不能反复重开用户窗口或误杀其它profile。具体DB计划需源端只读观测能力 |
| 中 | XLSX测试助手可按PK识别并将首sheet转CSV，便于旧断言却可能掩盖格式变更；冻结表头已有检查，下载延迟完成/取消和全部sheet未形成同层证据 | 在现有mps download helper补扩展名/MIME/magic一致性，实际文件完成/取消、全部必需sheet/行数核验；保留编码、公式文本、金额精度和冻结表头断言 | 不重写导出套件，不把format耗时当落盘；按真实Native版本选择少量平台验收频率 |
| 中 | 三仓与物理Core、页面作者源/生成HTML/注入装载产物属于不同事实；手工探针多次受cwd和相似文件名影响，研究输出长且重复读取成本高 | 将本轮有效计时入口收成一条现有package script，显式repo-root参数并验证HEAD/integration-set、按阶段写结构化JSON；当前报告留源码总表与实测摘要供导航 | 现有dependency-preparation/current-development/README与integration-set已是入口，不再扩大全局AGENTS。输出长期保留哪些业务字段、能否使用受控脱敏夹具需判断 |

现有机械检查出处：[WB CI MPS选测](../scripts/ci-test-policy.json#L67)、`Manage scripts/ci-test-policy.json:54`、[Worker浏览器测试](../tests/mps-workflow-worker.browser.mjs#L1)。建议先把本次临时探针中已经验证的同源参数、完整结果比较和阶段JSON整合进现有测试工具，再让reviewer审查跨模块责任、缓存新鲜度与结果证据保全等需判断的事项。既有规则没有因本次研究增删。
