# MPS 已确认规则完成度审计，2026-11-12

当前仍不能把本轮 MPS 标为“全部改完并已验收”。正式版已具备最新调拨、中转、30 日日均回退、ODM 外部收货、累计生产入库和金额来源。四个月需求算法、最新产品快照、净重及替换系数已进入本地源码，但未由本审计证明实际客户端验收或发布。本轮 partial 改动还存在范围与完整性缺口，见下表。

本文冻结审计时观察，不替代后续修复记录。全部数值案例均为合成数据；未访问生产，未修改实现、generated lib、草稿或安装目录。

## 观察输入与证据边界

| 输入              | 本次观察                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workbench         | `codex/mps-partial-four-month-20261112`，观察起点 HEAD `02e7d3f0c2ae3b7847ddf35e1596f74533d9c071`，另有未提交 partial 改动及已有 generated lib 改动。本报告完成前，主 Agent 将所观察 partial 源码原样冻结为 `6ae8a9e`，后续补修另作提交 |
| Manage            | `ecaaaa6aa7984fa1ff52db10d289d8dc3b5d0390`，路径 `/Users/synear/.codex/worktrees/mps-all-manage-integration/dsh-agent-manage`                                                                                                           |
| GEA 参考 checkout | `1a4ca6f805ae99d0dd9478b0e8becb00fcc55136`，仅作源码观察，不能当作实际安装版本                                                                                                                                                          |
| 正式发行比较点    | WB 0.1.101，`ca3e051b0d9a0a3c096cf4ea4a5a843a19c2855a`；Manage .68，`496091e532be11693fba27962f3ef7fd44926777`；GEA .278，`dcc5deaf7340f48265404e0b24404f5b92040aac`                                                                    |
| 安装验收          | 上述正式发行和 Core `0acc` 是本票提供的既有安装基线。本审计没有重新检查装载，也没有把本地源码视为已安装                                                                                                                                 |

比较正式版时使用 `git show` 或固定提交差异；查当前行为时读取当前源码。未使用旧测试通过记录作为本轮通过证明。当前 checkout 无 `.codegraph`，本审计用源码定位，不创建索引。

## 仍需修复的代码缺口

| 优先级             | 缺口和触发条件                                                                         | 影响                                                                                                                                                                 | 最少补修位置                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P1                 | partial 只作为附加字段，求解、汇总和导出未完整采用                                     | 剔除待定 SKU 后，剩余域全部求解即可得到 `plan.status='complete'`；页面显示“已完成求解”，独立 CSV 和 agent 的 planContext 丢失 partial 范围。全版本汇总仍可能写“完整” | WB 结果投影、`planContext`、求解概览及所有相关导出。保留参与域求解结果，另传范围状态和排除清单；不要把排除项塞进全局 sourceIssues 阻断有效域  |
| P1                 | 无基地的全国 SKU 事实不能按基地＋SKU 排除，当前却原样参与 partial 的近三月基数和达成率 | 一部分 SKU 已排除，历史/计划基数仍含其全范围量，产生范围不一致的需求                                                                                                 | `category-demand.js` 的 sourceChecks 裁剪。可分解时按实际基地裁剪；无法分解时保留未知与具体范围原因，不能猜扣量或删除该 SKU 的其他有效基地    |
| P1                 | 老品匹配器不使用基地                                                                   | 同一老品在不同基地分别对应不同新品时，本可按基地唯一匹配，却被全局判多义；partial 排除也不能可靠定位源老码                                                           | `createSourceProductMatcher`、sourceChecks 调用点及 partial 筛选。匹配身份应包含实际基地，保留当前码优先和真实多义诊断                        |
| P1                 | 新版产品源与保留草稿中的老品关系不一致时，替换系数可静默回到 1                         | 源字段缺失/冲突会伪装成有效历史参考量，影响各层占比                                                                                                                  | `productHistoryMappings` 的未匹配分支。仅对旧格式输入保留明确兼容语义；存在新版产品源但当前映射不匹配时，系数应未知，保留人工关系与原始源证据 |
| P2，随 P1 一并处理 | 大类对照仍汇总全量发货和模型预测，未采用当前参与范围                                   | 需求已按有效域计算，CSV 大类行的“本月预估发货”仍缺项或包含不同范围，且该行没有范围字段                                                                               | `comparisonSources` / `categoryComparisons` 及大类导出。若保留全量对照，明确标全量并同时给参与域对照；两者不能共用无范围的列名                |

第一项的代码证据是 [partial 只附加给 result/plan](../static/mps/source/workflow-inputs.js:372)、[Manage 完整状态只看剩余行及 sourceIssues](/Users/synear/.codex/worktrees/mps-all-manage-integration/dsh-agent-manage/src/mps-compute/plan.ts:498)、[概览只依据 plan.status](../static/mps/source/evaluation-view.js:299)、[planContext 未投影 partial](../static/mps/source/evaluation-view.js:85)、[独立求解 CSV](../static/mps/source/evaluation-view.js:319)、[大类 CSV](../static/mps/source/workflow-view.js:805)及[全版本汇总可写完整](../static/mps/source/workflow-view.js:863)。不能简单将所有剩余域数值置空，应保留“参与范围内”的有效量、已知小计和资源约束结果，避免把未知全范围总量误报为完整。

第二项的筛选键见 [includeSource](../static/mps/source/category-demand.js:62)。既有 [source checks 汇总](../static/mps/source/source-projections.js:291)允许无基地来源归入当前产品大类，因此缺基地不是一律错误；错误是 partial 需要基地粒度裁剪时，继续把不可分解的全国量视为裁剪后基数。

第三项的全局索引与调用见 [旧码匹配器](../static/mps/source/source-projections.js:194)、[sourceCheckRows](../static/mps/source/source-projections.js:233)和[partial 旧码转换](../static/mps/source/category-demand.js:64)。修复必须覆盖同基地真冲突、跨基地可唯一匹配、源基地缺失三种情况，不能用一次全局选择掩盖冲突。

第四项的跳过分支见 [matching.length 为零直接返回](../static/mps/source/workflow-inputs.js:33)，缺省系数 1 见 [Manage historyFactor](/Users/synear/.codex/worktrees/mps-all-manage-integration/dsh-agent-manage/src/mps-compute/workflow.ts:293)。其明确适用点是“新 SKU 的同基地历史参考量”。不能据此改写 BI 真实实绩、达成率分子或原始历史源值；其它计算域是否采用替换系数需要独立业务依据。

第五项见 [comparisonSources / categoryComparisons](../static/mps/source/workflow-inputs.js:376)。这是展示与证据范围缺口，不是已经确认的四个月核心公式缺口。

## 本次合成回放

采用既有 `workflowPerformanceInput` / `workflowDraft`，经现有 `mpsComputePlugin` 将源码在内存中打包，`write:false`，没有构建落盘。回放仅打印下面所需字段。

| 场景                                                                                                   | 实际输出                                                                                                  | 结论                                                                  |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 两个合成 SKU，其中一个 `fin=null`，另一个有效；给定四个月大类值和排产参数                              | `result.partial=true`，计算行只剩有效 SKU，但 `plan.status='complete'`；`planContext` 无 partial/排除字段 | 复现完整性投影缺口。该例检查的是 partial 元数据，不证明四个月来源完备 |
| 同例的大类发货对照                                                                                     | 计算域只剩一个 SKU，对照仍 `count=2`、`knownQuantity=10`、`missingCount=1`                                | 复现对照范围未同步                                                    |
| sourceChecks 中甲/A 每月实绩100、计划125，乙/B 每月实绩1000、计划1000；排除乙/B                        | 有基地时近三月 actual=300、plan=375；只把源基地改为空后 actual=3300、plan=3375                            | 复现不可按基地裁剪的来源仍被当作参与域基数                            |
| `OLD` 在甲对应 `NEW-A`，在乙对应 `NEW-B`，同大类                                                       | 匹配器返回 `currentCode=''`、`category=''`，原因“老品编码对应多个当前产品，未选择”                        | 复现缺基地维度。没有证明同基地多义可被选择                            |
| 草稿人工老品为 `EDITED-OLD`，新版 raw 的关系为 `SOURCE-OLD`，raw `replace_num=null`，人工老品历史量100 | `historyFactor` 未设置，`historyReferenceQuantity=100`，`historyQuantity=100`                             | 复现新版来源不匹配时默认 1。没有修改草稿或 raw                        |

## 全部已确认规则状态

| 规则                                                                          | 正式版状态                                                             | 本地源码状态和证据                                                                                                                                                                                                                                                                                          | 尚未完成                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M+1 两法平均再与销售提报×三月达成率平均；M+2/M+3/M+4直接两法平均；独立 mom 链 | 正式 Manage 比较点仍在前两月销售加权、后两月只用环比法                 | 已改，见 [category-demand.ts:105](/Users/synear/.codex/worktrees/mps-all-manage-integration/dsh-agent-manage/src/mps-compute/category-demand.ts:105)。`previousMom=momMethod`，不回写最终加权或人工量                                                                                                       | 本审计未运行该算法测试；已有测试定义见 [四月两法与1150例](/Users/synear/.codex/worktrees/mps-all-manage-integration/dsh-agent-manage/tests/mps-category-demand.test.mjs:29)。需修复 partial 缺口后真实输入验收 |
| 历史占比延伸至 M+4                                                            | 正式比较点历史参数只生成六个月窗口                                     | 本地读取与计算都扩至八个月，见 [读取窗口](../static/mps/source/source-tables.js:68)、[计算窗口](/Users/synear/.codex/worktrees/mps-all-manage-integration/dsh-agent-manage/src/mps-compute/category-demand.ts:44)；后两月也输出 shareMethod                                                                 | 未证明当前客户端已经加载、真实历史分母有效                                                                                                                                                                     |
| 待定基地 SKU 异常 CSV，其余继续；缺值不补零；下游一致范围并标 partial         | 本轮新增，未在正式比较点                                               | 已过滤基月发货、report、sourceChecks、history/productMonths，partial 禁用全范围 reportRatios；见 [类别范围](../static/mps/source/category-demand.js:43)、[workflow 范围](../static/mps/source/workflow-inputs.js:73)、[异常 CSV](../static/mps/source/category-demand-view.js:4)                            | 上述 P1/P2。还应新增全待定、无基地、旧码跨基地、跨版本、独立 CSV 检查；现有新增测试只断言普通带基地部分排除和跨 draftId，不足以证明这些边界                                                                    |
| 调拨只用最新 stat_period，供后续需求月；完整路径逐段记录                      | 正式比较点已有 latestTransferSnapshot 与中转算法                       | [最新日期选择](../static/mps/source/relations.js:3)、[全部需求月共用无 month 的 transferRoutes](../static/mps/source/plan-inputs.js:288)、[路径搜索](/Users/synear/.codex/worktrees/mps-all-manage-integration/dsh-agent-manage/src/mps-compute/plan.ts:32)。本地补接受完整日期格式                         | 当前真实最新关系仍需按路径、方向、标签验收，不从源值存在推断路径有效                                                                                                                                           |
| 近三天和本月速度都为0，用近30天日均；仍0待定                                  | 正式比较点已包含 `use30DayPace`，当前 shipment 源与该比较点无差异      | [derive](../static/mps/source/shipment.js:60)，仅正数近30天速度可用。无待发订单的真实0仍保留既有语义                                                                                                                                                                                                        | [浏览器测试定义](../tests/mps-shipment.browser.mjs:397)本审计未运行；需真实样本验证源速度及人工值                                                                                                              |
| 产品清单最新快照，新增七字段；新品依 transfer_tag                             | 正式 products 查询没有七字段、没有最新 stat_period 过滤                | 本地 [products.detail](../static/mps/sql.config.json:9) 已接；[新品投影](../static/mps/source/source-projections.js:25)按 transfer_tag；[productRows](../static/mps/source/master-data.js:64)维持全国关系投影                                                                                               | 结构可读不等于业务值有效，需检查实际快照、标签值、同基地冲突与保留草稿关系                                                                                                                                     |
| 同基地老品历史×replace_num；保留原始源数量及替换依据                          | 正式比较点没有 historyFactor                                           | 本地 [按基地映射](../static/mps/source/workflow-inputs.js:26)、[实际参考量](/Users/synear/.codex/worktrees/mps-all-manage-integration/dsh-agent-manage/src/mps-compute/workflow.ts:293)、[过程 CSV](../static/mps/source/workflow-view.js:756)、[求解 CSV](../static/mps/source/evaluation-view.js:331)已接 | 上述新版映射不匹配默认1和无基地旧码匹配 P1；零系数、冲突、旧格式兼容均须保留                                                                                                                                   |
| 每计量单位净重换吨                                                            | 正式产品查询无净重字段，该路径未接                                     | [单位换吨和冲突判断](../static/mps/source/unit-weights.js:95)、[人工优先、产品净重优先、缺产品记录才旧渠道回退](../static/mps/source/plan-inputs.js:43)、[年度报告同用解析重量](../static/mps/source/workflow-inputs.js:438)                                                                                | 未独立确认实际业务数量单位与 measure_unit 一致；不能把字段有值等同折吨已验收                                                                                                                                   |
| ODM 外部收货独立于内部产能                                                    | 正式比较点已有 odmSupplies 和 odmCapacity                              | [ODM 输入](../static/mps/source/plan-inputs.js:81)、[收货独立汇总](/Users/synear/.codex/worktrees/mps-all-manage-integration/dsh-agent-manage/src/mps-compute/plan.ts:489)。本地 HEAD `02e7d3f0` 修正 ODM 汇总及替换证据导出                                                                                | 不推断实际供应商产能、到货承诺或中转能力。partial 报告完整性仍需修复                                                                                                                                           |
| 生产入库按月初至截止日 SUM，负数冲销保留；快照字段仍截止日                    | 正式比较点已含 `SUM(produce_in_qty)`，与当前 shipment/facts 实现无差异 | [SQL 回归用例](../tests/mps-facts-sql.test.mjs:111)本次实际通过，涵盖跨日累计、负数、缺值及快照                                                                                                                                                                                                             | 本审计未重新验收正式安装；旧规格中“只取截止日当天”的历史表述不能覆盖当前已确认规则                                                                                                                             |
| 金额来自 agents_scm_dws_scm_cust_plan_exe_di；库存及跨月缺值不制造            | 正式比较点已使用该金额表                                               | [金额 SQL](../static/mps/sql.config.json:1451)、[库存缺值和后月依赖](/Users/synear/.codex/worktrees/mps-all-manage-integration/dsh-agent-manage/src/mps-compute/workflow.ts:301)。本次 SQL 测试通过；partial 大类/全版本导出仍需范围修复                                                                    | 没有证明当前真实价量覆盖完整，缺价、缺量、库存缺值继续待补                                                                                                                                                     |
| SQL仍 /ai/gateway/sql/execute，不改后端限制；性能真实测量                     | 本票没有授权改后端协议                                                 | GEA [配置查询入口](/Users/synear/.codex/worktrees/mps-all-gea-reference/dsh-gea-plugin/src/host/business.ts:3152)保持 gateway 路由。WB 通过配置 queryId 调用，见 [master-data](../static/mps/source/master-data.js:36)                                                                                      | 本审计未测真实性能、未改变后端限制。合成耗时或内存回放不能替代真实端到端测量                                                                                                                                   |

安全天数的 `missingTurnoverDaysAsZero` 不作为本轮新缺口。[既有规格 D14](/Users/synear/Documents/ChatGPT/插件拆分/.scratch/mps-confirmed-changes-20261111/spec.md:111)明确保留可追溯的原人工/临时0路径，[08 票](/Users/synear/Documents/ChatGPT/插件拆分/.scratch/mps-confirmed-changes-20261111/issues/08-turnover-dependency-export.md:41)也要求保留其语义。它不能扩大为其它数量缺值补0，更不能撤销 partial 范围说明。

本轮主 Agent 提供的受控只读探针状态是“产品七字段和最新完整日期快照现已可读，调拨也有最新完整日期”。本报告未独立访问该探针，不引用业务行数或源数据。因此，旧“字段尚未发布”的阻断不再沿用；业务值、标签、系数及实际计算验收仍未完成。

## 为什么已有检查仍漏掉确认规则

问题不是“没有 CI”。仓库已有 MPS 定向测试、源码检查和候选门禁，旧规则测试也在主线运行。固定正式提交与当前分支的差异表明，四个月算法及新品源字段修正此前留在另一组提交，入库修复的发布范围没有带上它们；本票提供的既有安装验收也只确认入库行为，不能证明全部确认规则。后来新增 partial 用例只覆盖普通带基地数据，未覆盖本报告暴露的粒度与投影边界。

应在既有 MPS 用例和最终产物验收中，对照本表逐条核规则、固定提交和实际装载结果。保留已有 CI 的价值，同时纠正发布范围与验收范围的遗漏，不需要新增全局 AGENTS 大条款或治理平台。

## 本次实际验证和最少后续检查

本次运行 `node --test tests/mps-source-projections.test.mjs tests/mps-relations.test.mjs tests/mps-annual-demand.test.mjs`，24 通过、1 跳过、0 失败。跳过项需要显式提供留存业务底稿，本次未运行。另运行 `node --test tests/mps-facts-sql.test.mjs`，7 通过、0 失败。以上共31通过、1跳过，只证明这些当前测试。本报告没有运行全仓测试、浏览器测试、候选检查、安装检查或真实业务验收。前述五组合成回放是本次新运行的诊断证据，不能改写成测试套件已通过。

完成补修后，最少检查按依赖顺序进行：

1. 用当前固定三仓重新运行受影响的 category-demand、source-projections、workflow-inputs、workflow/plan 及独立导出检查。新增用例只覆盖本报告的真实缺口，包括全待定仍未知、无基地不可分解、同老品跨基地唯一、同基地真冲突、新源与人工关系不匹配、跨版本/截止日、partial 独立 CSV 和概览。
2. 用公开页面入口检查 partial 异常 CSV、四个月大类过程、三个月拆分、排产与年度报告。对照参与域、排除域及全量对照，证明同一份范围进入分母、数量、吨数和完整性提示；保留库存跨月未知。
3. 使用本票已授权真实数据新增可辨认评估，保留原版本、草稿和人工编辑。检查最新完整日期、替换关系/系数、计量单位、实际来源速度、ODM 收货与合法中转路径；记录真实 SQL 与页面耗时。
4. 真实数据验收完成后再冻结候选、运行本票必需门禁并发版。分别留证源码、CI、包来源、频道版本、实际安装及装载，不用任一层替代业务验收。

后续修复或验收应追加自己的提交、输入与回执，不能回改本文的观察结论为“当时已通过”。
