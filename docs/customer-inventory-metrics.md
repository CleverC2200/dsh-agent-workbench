# 客户库存新版指标 / Customer inventory metrics

客户列表的「SKU库存」页签复用经销商库存 `sku-stock` 的明细查询和展示列，通过当前客户库存 Consumer 执行。明细范围跟随上方角色、组织、状态、区域和经销商筛选，按该范围查询全部客户SKU并十行分页；不再设置独立筛选栏、下载按钮或口径说明区。该明细为截至计划快照日最近的客户日库存，与顶部计划库存指标分别注明日期和来源。商品资料关联包含 `agents_dim_material_prod_sales_info_d`；真实环境仍须由资源声明所有者及 GEA 核对 `customer_inventory` 对相关表/字段的只读授权，本次页面实现不授予权限。读取失败、缺失与负数沿用经销商库存的合同，不补零。

Source: [客户库存知识库](https://klvcodtump.feishu.cn/docx/Alj7d3XXjow3GrxGOsEcXijJnBb), revision 431, read 2026-10-20.

页面布局保持不变；最新快照先按客户与SKU合并，再在受控SQL中计算占比差与缺货项，最后按客户发布。SQL只读，身份、字段与行授权仍由GEA执行。

The layout is unchanged. Governed read-only SQL first groups each snapshot by customer/SKU, then computes structure differences and shortage items before customer rollup. GEA remains the identity and permission authority.

## 计划主范围 / Plan-led scope (2026-10-28)

大日期展示按已知源值汇总，不再要求全部SKU有值才显示客户数量；部分覆盖标明已知数量及SKU覆盖。新鲜度沿原公式使用同日库存与已知大日期合计，部分覆盖时明确为“测算上限”，不是完整精确值，不因缺值判健康。整客户大日期全为空时仍为未知，不能生成0箱或100%。

Known large-date values are summed even with partial SKU coverage. Freshness retains its formula but is labelled an estimated upper bound for partial data; incomplete coverage does not establish health. All-null customers remain unknown, never zero or 100%.

新增字段发布后，六项指标统一切到计划表同一最新快照：库存价值使用同表stock_qty×cif_price，大日期使用big_final_qty，新鲜度分子分母均来自同表同日全部SKU。原库存表仅用于仍缺失的组织维度，组织日期独立标注，不再用于指标或空值回退。单价、大日期、在途仍有源空值，必须按本表SKU数检查覆盖；不能把NULL当0，也不能以旧快照填补。

After the new fields are published, all six KPIs use the same latest plan-table snapshot: stock×cif_price for value and big_final_qty with same-day stock for freshness. The old inventory table supplies only missing organization dimensions, with a separate date. Missing prices, large-date or transit values remain unknown and are never replaced by old snapshots.

主范围改为 `agents_scm_cust_plan_order_analysis_d` 最新 `create_date` 的全部客户+SKU；库存数量、在途和日均销量分别取 `stock_qty`、`in_transit_qty`、`daily_sales`，近30日销量按日均量×30还原。重复客户+SKU的数量输入保持未知，不任意挑一行。目标、预算、发货等补充数据必须与主表同日，读取期间日期变化拒绝混合。

The latest plan snapshot supplies the complete customer/SKU scope, stock, transit and 30-day daily sales. Thirty-day sales equal daily sales ×30. Duplicate keys remain unknown; plan enrichments from a different date are rejected.

客户指标先按计划表SKU归并、汇总，再按客户关联主索引；客户汇总值在外层使用MAX投影，不随SKU行重复累加。组织维度单独按客户关联，不限制计划表客户范围。页面原日期位置、卡片说明和诊断显示统一指标日期、组织补充日期、SKU及客户覆盖。在途不完整仍显示已知部分和计划SKU覆盖。右侧独立Cube模型未更改。

KPI aggregates retain customer grain without multiplication by plan rows. Organization joins cannot drop plan-only customers. Existing date, caption and detail locations disclose the unified KPI date, organization date and coverage. Partial-transit handling and independent Cube models remain unchanged.

## 加载与失败展示 / Loading and failures

客户库存先渲染六张指标卡、筛选框和空表格，再等待页面连接及受控查询；未读取的指标显示 `—`，不发布为库存证据。15秒仍未连接时展示未就绪提示，读取有90秒取消上限；身份范围的可选读取最多等待5秒。Agent拒权、数据拒权、资源未就绪、会话失效和查询失败均保留界面并说明原因。成功的空结果单独标明“当前授权范围暂无客户库存数据”。身份或会话变化立即清除旧数据并取消在途读取，迟到结果不得回填。HTML内保留静态卡片和表格作为脚本未执行时的兜底，不含样例库存，也不绕过GEA权限。

The six KPI cards, filters and empty table render before the page connection and governed query. Unread KPIs remain `—` and are not published as inventory evidence. A missing connection is explained after15 seconds; reads are cancelled after90 seconds and the optional identity projection waits at most5 seconds. Agent/data denial, missing resources, expired sessions and query failures preserve the layout with distinct messages. A successful empty result is not an error. Identity or session changes clear old data and cancel in-flight reads; late results cannot refill the page. Static HTML cards/table remain when scripts do not execute, without mock facts or an authorization bypass.

刷新按钮重新加载页面，由宿主重新建立授权连接和读取数据。Refresh reloads the page so the Host re-establishes authorization and reads current data.

| Metric / 指标           | Implementation / 实现与限制                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quantity / 库存量       | Sum upstream stock_qty, in boxes; no in-transit added. Upstream stock-report simulation is not independently verified. 汇总上游现库存；提报推演未独立核验。                                                                                                                                                                               |
| Value / 价值            | Σ(plan stock_qty × same-snapshot cif_price) / 10000. Completeness uses all plan SKUs. 新表库存数量按同日到岸价计价；缺失不补0。 |
| Structure / 结构分      | 100 × (1 − 0.5 × Σ absolute inventory-share minus 30-day-sales-share difference). Absolute values are inferred from the document's 90-point example; the written formula omits them. Current stock proxies sellable stock. Both assumptions are disclosed pending business confirmation. 绝对值及可售库存代理均显式说明，非最终确认口径。 |
| Structure rollup / 上卷 | Arithmetic mean of valid customer scores with coverage. >=80 healthy, >=65 attention, below65 risk. Missing/negative inputs or zero denominators are unscored.                                                                                                                                                                            |
| Turnover / 周转         | (plan stock_qty + in_transit_qty) / daily_sales. Missing transit retains an explicitly marked stock-only estimate, not a formal transit-inclusive value. Aggregate matched numerators and denominators; never average days. 在途缺失保留现货估算，标明覆盖；负值或无动销不计算。 |
| Shortage / 缺货         | Count customer/SKU items with positive 30-day sales and stock-only coverage below60 days. Customer low-coverage uses turnover below60, estimated when transit is missing. No invented20-day target or30.7/100.7-day limits.                                                                                                               |
| Large-date / 大日期 | Read upstream big_final_qty (boxes), replacing the temporary stock-minus-normal estimate. Preserve source quantity and mark negative/excess quantities; isolated SKU discrepancies do not block customer/city aggregates. Quantity and ratio coverage are separate. 源字段大日期数量不清零；仅汇总分母无效或汇总数量超出范围时不计算占比和新鲜度。 |
| Freshness / 新鲜度 | (stock − big_final_qty) / stock over the same valid covered customers; no independent health thresholds are defined. 同范围汇总分子分母，数量异常或零分母不计算。 |
| Risk / 待处理           | Attention + risk + negative-inventory anomalies; table filtering uses the same predicate. Unknown rows are separate, not silently healthy. Large-date attention >=5%, based on the upstream large-date quantity.                                                                                                                                               |

平均货龄控补（>=90天）与预订单（周转需求、剩余计划、120天货龄熔断）缺少同快照完整输入；只解释缺口，不用周转天数代替货龄，也不生成虚假的补货数。客户跨城市为成员关系，城市结果不可相加。

Average-age replenishment control and formal preorder calculations lack complete same-snapshot inputs. Turnover is not stock age; no fabricated replenishment numbers are shown. Multi-city customer membership must not be summed across cities.

Validation: `node --test tests/customer-inventory-data-source.test.mjs`, `node scripts/build-customer-prototype.mjs`. Local preview validates data/display only, not GEA authorization or installed-host acceptance.

## 客户库存测试问题修正 / Customer inventory findings

卡片继续统计角色及组织范围，在卡片组下方以浅灰小字提示“顶部卡片统计范围不随下方列表筛选变化。”，不显示大框、计数、接收时间及技术说明。`capturedAt` 仍仅随页面接收数据更新，筛选、翻页及上下文心跳不生成新数据时间；它不是数据库不可变版本。没有上游不可变快照能力时，不把不同取数时刻当作同一快照核对。

Cards retain role/organization scope with one muted note below the card group explaining that list filters do not change card scope. No banner, counts or technical timestamps are shown. `capturedAt` remains page-reception metadata, not a database version; filtering, pagination and context heartbeats do not advance it.

`regionalInventoryValues` 从卡片同次全部客户结果按大区互斥分组；已知价值加总与卡片一致，缺失客户单列，整组未知保留null。具名`groupsByName`避免记录数组被投影成前三组；`groupCount`、`customerCount`、`knownValueTotal`显式声明全量覆盖，部分投影不能据此声称逐组完整。它是页面受控SQL证据，不是新发布的Cube价值度量，不用预算或旧表金额替代。城市多值关系仍不可相加。

Regional known-value partitions use the same page observation as cards, retaining unknown coverage and real zero values. They are governed page SQL evidence, not a newly published Cube measure. Multi-city memberships remain non-additive.

指标文档第434版规定批次货龄>90天；5%仅为客户大日期库存占比关注线。数量使用上游`big_final_qty`，历史`over120_final_qty`命名不改变业务阈值，页面未独立复算上游批次算法。

Definition revision434 specifies batch age over90 days;5% is a separate customer ratio threshold. Upstream batch calculation is not independently verified by the page.

客户经理经业务确认取小时订单表 `agents_scm_execute_detail_hourly_d.sales_person`，以 `cust_code` 关联最新计划表客户集合；仅唯一非空姓名显示，缺失或多人冲突显示“—”。独立受控查询失败不影响库存主数据，也不改 Consumer 或授权；`managerSnapshot` 保留该客户源记录的最近加载时间。所有缺失数值仅显示“—”，不附加单位，真实0保留单位。

Customer managers use the business-confirmed hourly order `sales_person`, joined by customer code within the latest plan customer set. Missing or conflicting names remain unknown. Optional governed-query failure does not suppress inventory or broaden authorization. Missing values omit units; real zero retains units.

## 10月29日专项问题12–15 / October29 findings12–15

列表区域、状态、页签、搜索和页码通过已有页面通道登记为可编辑控件，同时注册仅改变视图的 `filter` 动作。`pageControlsById` 与实际登记使用同一声明，`registeredPageActions` 明确当前可用动作；未登记能力不等于页面不存在控件或用户没有数据权限。`filteredRegionalInventoryValues` 为当前列表范围的大区互斥分组，卡片范围仍使用 `regionalInventoryValues`。不改变 GEA Consumer 或行列授权。

列表六项数值列在完整筛选集合排序后分页；空值在两个方向均排最后，同值以客户编码稳定排序。翻页不触发排序状态重置。综合状态旁披露结构分、大日期占比的缺失；原高风险/关注规则和页签计数不变，数据不足不能掩盖已确认风险，已确认风险也不代表其他维度完整。

The existing page channel publishes authored editable list controls and a view-only `filter` action. Card and filtered-list regional partitions are separate. Sorting precedes pagination with stable ties and nulls last. Missing assessment inputs are disclosed alongside known risks without changing business thresholds or authorization.

真实动作复验曾在35秒超时：Host的HTML动作队列未携带session，页面按原会话校验拒绝执行。修复仅在`html-sessions`的invoke信封附加所属lease的真实session；不放松页面会话校验。独立回归穿过原channel handler，验证不同Session不执行、正确Session执行并以原请求ID回执。该基础信封修正适用于已有HTML动作，不改变其他模块业务操作、权限或指标。

The live filter probe exposed an invocation missing its Session envelope. The Host now includes its owned lease Session; page guards remain intact. A focused regression covers mismatched-Session rejection and a correlated successful reply through the original channel handler.

最终隔离工作台实测：Agent发现5个可编辑控件，两次已登记`filter`调用均返回`applied:true, effect:view`；华南事业部列表90家，恢复全部后2861家，卡片数值及`capturedAt`保持不变。

The final isolated full-Workbench probe discovered all five editable controls and received successful view-only filter receipts: 90 South China customers, then 2861 restored. Card values and observation time remained unchanged.

空值悬浮原因读取实际覆盖计数：计划表 stock_qty、daily_sales、cif_price、big_final_qty 不完整时说明字段与覆盖；同日期客户物料重复单列为系统无法唯一归并，零分母、数量异常单列为计算条件不满足。接口未成功、未返回字段或关联未命中不能宣称数据库为空，缺失不补0。卡片、列表及补充计划数据保留原显示值。

Missing-value hover reasons distinguish source coverage gaps from duplicate-grain or invalid-denominator calculation conditions. Failed reads and unmatched joins do not establish that the database is empty. Values, zero policies and authorization are unchanged.

隔离环境真实验收（2026-10-29）：库存价值列已实际切换升/降序，Agent运行时仍可点击；页面6组大区合计2861家，已知价值46998.005078万元与卡片一致，缺值49家。当前单日计划Cube查询成功返回224682条源记录，不能把记录数当作客户数。Cube的`stock_qty_total`本次返回NULL并附`METRIC_VALUE_UNAVAILABLE`，未补0。按未发布成员`cust_plan_order_analysis_qa.region`查询得到`CUBE_MEMBER_UNAVAILABLE`（requestId:949ee230-b924-45e9-9024-61ba2f85f55a），属于模型成员缺口，不是本地范围映射失败或权限拒绝；本地未修改后台模型。

Live isolated validation confirmed bidirectional sorting, complete regional reconciliation and a successful current-day Cube query. The plan Cube has not exposed a confirmed regional dimension/customer-distinct measure; this remains an upstream model publication dependency, not an authorization workaround. No backend model changes are claimed.
