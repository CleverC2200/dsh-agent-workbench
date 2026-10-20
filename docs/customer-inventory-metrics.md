# 客户库存新版指标 / Customer inventory metrics

Source: [客户库存知识库](https://klvcodtump.feishu.cn/docx/Alj7d3XXjow3GrxGOsEcXijJnBb), revision 431, read 2026-10-20.

页面布局保持不变；最新快照先按客户与SKU合并，再在受控SQL中计算占比差与缺货项，最后按客户发布。SQL只读，身份、字段与行授权仍由GEA执行。

The layout is unchanged. Governed read-only SQL first groups each snapshot by customer/SKU, then computes structure differences and shortage items before customer rollup. GEA remains the identity and permission authority.

| Metric / 指标           | Implementation / 实现与限制                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quantity / 库存量       | Sum upstream stock_qty, in boxes; no in-transit added. Upstream stock-report simulation is not independently verified. 汇总上游现库存；提报推演未独立核验。                                                                                                                                                                               |
| Value / 价值            | Sum stock_amt / 10000; SAP sales-order price lineage remains unverified. 保留上游金额，不以到岸价重算。                                                                                                                                                                                                                                   |
| Structure / 结构分      | 100 × (1 − 0.5 × Σ absolute inventory-share minus 30-day-sales-share difference). Absolute values are inferred from the document's 90-point example; the written formula omits them. Current stock proxies sellable stock. Both assumptions are disclosed pending business confirmation. 绝对值及可售库存代理均显式说明，非最终确认口径。 |
| Structure rollup / 上卷 | Arithmetic mean of valid customer scores with coverage. >=80 healthy, >=65 attention, below65 risk. Missing/negative inputs or zero denominators are unscored.                                                                                                                                                                            |
| Turnover / 周转         | (stock + pack_unitqty) / (30-day sales / 30). Missing transit retains an explicitly marked stock-only estimate, not a formal transit-inclusive value. Aggregate matched numerators and denominators; never average days. 在途缺失保留现货估算，标明覆盖；负值或无动销不计算。                                                             |
| Shortage / 缺货         | Count customer/SKU items with positive 30-day sales and stock-only coverage below60 days. Customer low-coverage uses turnover below60, estimated when transit is missing. No invented20-day target or30.7/100.7-day limits.                                                                                                               |
| Large-date / 大日期 | Read upstream over120_final_qty (boxes), replacing the temporary stock-minus-normal estimate. Preserve source quantity and mark negative/excess quantities; any inconsistent SKU blocks that customer’s ratio/freshness. Quantity and ratio coverage are separate. 源字段大日期数量不清零；异常客户不参与占比和新鲜度。 |
| Freshness / 新鲜度 | (stock − over120_final_qty) / stock over the same valid covered customers; no independent health thresholds are defined. 同范围汇总分子分母，数量异常或零分母不计算。 |
| Risk / 待处理           | Attention + risk + negative-inventory anomalies; table filtering uses the same predicate. Unknown rows are separate, not silently healthy. Large-date attention >=5%, based on the upstream large-date quantity.                                                                                                                                               |

平均货龄控补（>=90天）与预订单（周转需求、剩余计划、120天货龄熔断）缺少同快照完整输入；只解释缺口，不用周转天数代替货龄，也不生成虚假的补货数。客户跨城市为成员关系，城市结果不可相加。

Average-age replenishment control and formal preorder calculations lack complete same-snapshot inputs. Turnover is not stock age; no fabricated replenishment numbers are shown. Multi-city customer membership must not be summed across cities.

Validation: `node --test tests/customer-inventory-data-source.test.mjs`, `node scripts/build-customer-prototype.mjs`. Local preview validates data/display only, not GEA authorization or installed-host acceptance.
