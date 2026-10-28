# 客户库存新版指标 / Customer inventory metrics

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
