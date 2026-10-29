# Agent SQL 集中配置与统一 GEA 通道

每个 Agent 的 SQL 只维护在其 `business/inventory-*/sql.config.json` 中。页面模块引用配置键，保留字段映射、交互和原计算。构建将配置复制到 `lib/business/inventory-*/sql.config.json`；页面包的 `plugin.json.sqlConfig` 指向它。

| Agent | 配置 |
| --- | --- |
| 基地安全库存 | [inventory-aqkc](../business/inventory-aqkc/sql.config.json) |
| 分仓库存 | [inventory-fc](../business/inventory-fc/sql.config.json) |
| 全链库存 | [inventory-qll](../business/inventory-qll/sql.config.json) |
| 产销协同 | [inventory-apsplan](../business/inventory-apsplan/sql.config.json) |
| 经销商库存 | [inventory-dealer](../business/inventory-dealer/sql.config.json) |
| 订单履约 | [inventory-orderfulfillment](../business/inventory-orderfulfillment/sql.config.json) |

## 配置内容

- `queries`：新 `ai_db` 的命名查询。每项有 SQL、业务参数合同、返回列及分页配对；页侧发送 `queryId + parameters`，SQL 由 GEA Host（或显式本地预览服务）从该 Agent 的文件读取。没有任意 SQL HTTP 接口。
- `templates`：从原页面提取的固定 SQL 和拼装片段。`segments` 保留原插值顺序，代码只按键拼装；不 eval 配置。它们保留原 GEA/旧源兼容行为，不会在新库查询失败后自动执行。
- `workspace`：产销原页面的查询、标签和来源说明，取代原 `gea-queries.json`。与其他 SQL 在同一文件中维护。
- `workspaceBindings`、`resultAliases`：新查询与原页面字段的映射。缺少等价来源的页面项明确返回 `SOURCE_NOT_AVAILABLE`。
- `sourceGaps`：当前已核实的数据或接入缺口。源库表存在不代表已被 GEA 发布或授权。
- `sourceViews`、`fieldGaps`：分仓、全链、经销商的独立来源页签、字段显示与筛选合同，以及逐字段的来源/缺值说明。它们只消费本 Agent 的命名查询。

`templates` 与 `workspace` 是原读取链路的兼容配置。原查询进入既有编译/适配流程；不能把其中的旧源表达式当作新网关可直接执行的 SQL。新的 `queries` 按受控 PostgreSQL 子集检查，并在 Doris 的 MySQL 协议上验证。

## 页面刷新与执行

Workbench Host 每次呈现页面时读取包旁的配置，验证 Agent 身份和路径边界，在应用脚本前注入 JSON。构建后的 JavaScript 不再内嵌 SQL 配置副本。因此，修改已安装包旁的配置后，重新打开页面即可生效；修改仓库的作者配置则先运行相应页面构建，复制到 `lib`。

配置改动期间的完整分页会拒绝混用不同版本。分页使用配置中的 SQL `LIMIT/OFFSET` 和配对 count，不能再叠加 GEA 旧适配器的分页。业务计算仍需完整读取必要事实，先计算和合并人工覆盖，再筛选、汇总及分页；数据超限、重复键、权限缺列或读取失败均不能当成完整结果。

## 本地只读直连

连接信息只放忽略目录 `.runtime`；SQL 配置、浏览器和源码均不放数据库密码。

```sh
python3 -m venv .runtime/sql-python
.runtime/sql-python/bin/pip install -r scripts/requirements-sql.txt
cp scripts/sql-connection.example.json .runtime/sql-connection.json
chmod 600 .runtime/sql-connection.json
```

在本地编辑连接文件后运行：

```sh
.runtime/sql-python/bin/python scripts/agent_sql.py \
  --connection .runtime/sql-connection.json --replay .runtime/sql-replay.json

.runtime/sql-python/bin/python scripts/agent_sql.py \
  --connection .runtime/sql-connection.json --port 8876
```

服务只监听 `127.0.0.1`，读取预先配置的查询、按驱动绑定参数，并核对单条只读语句和实际表字段。临时访问凭据保存在 `.runtime/sql-preview.json`。数据库授权只代表该数据库账户的权限，不代表 GEA 用户、Consumer、行或字段授权。页面取消后不发布迟到结果；数据库中已发送的 SELECT 仍可能执行至返回或超时。

已接入新库页面字段的直连预览：

- `http://127.0.0.1:8876/agents/aqkc`：原页面接库存、目标、月履约与超60天数量；批次货龄、当前订单及30日总量缺等价事实时保持未知。
- `http://127.0.0.1:8876/agents/apsplan`：原页面接库存、MES同期计划/实绩、订单履约、预测、准确率、计划和交货；财务、预算等无等价来源的部分分别报缺口。
- `http://127.0.0.1:8876/agents/fc`：分仓计划、订单执行、交货、经营指标、基地资源与仓型健康。单仓库存及补货建议单独说明缺失依赖。
- `http://127.0.0.1:8876/agents/qll`：基地库存/目标/历史、订单、交货、缺货追踪、仓型健康和分仓计划。未覆盖层级不计入全链合计。
- `http://127.0.0.1:8876/agents/dealer`：客户/商品目录、指定客户的公司订单/交货、促销和车型，以及提货约束；不把主数据或公司交货当客户库存、动销。

三个插件复用原构建和入口，存在安装配置时呈现新版来源视图，分别支持统一 GEA 通道与显式本地预览。每个页签独立读取；配对计数、明细和汇总检查配置版本，前后计数不一致时拒绝不完整页。汇总权限/读取失败只使相应卡片未知，保留独立验证过的明细。数量缺值保持 `-`；基地卡片显示已覆盖数量和覆盖行数，不能冒充完整总量。

分仓当前计划的年月/版本/单位等列存在但源值为空时，不能被所选月筛选冒充成有效月计划。促销源量较大，必须指定客户，禁止启动无客户全量加载。车型载重/运载与旧折扣订货量的对应未确认，只展示源配置。

逐项缺口及对应源表字段由各 Agent 配置的 sourceGaps、fieldGaps 维护。这些独立视图已验证本地页面与直连接口，不代表旧全功能计算、GEA 用户授权或桌面正式安装完成。无直连标记时通过所属页面的 GEA 通道执行配置查询。

## 统一身份与 GEA 接线（2026-10-19）

基地库存和产销协同的取数、显示及源字段清单由对应配置维护。两个页面保留原界面；其余三个插件的独立来源视图范围另见上文。

`createAgentQueries(config, execute)` 默认通过 `gea-html-v2` 所属页面通道发送 `{queryId, parameters}`，页面不传 SQL、用户身份、Consumer 或凭据。GEA Host 从可信安装目录读取该 Agent 的配置，验证身份与路径边界，并绑定声明的 Consumer。它复用统一登录状态和委托会话，通过 `/ai/gateway/sql/execute` 传递命名参数，保留 `returnedColumns/rejectedColumns` 和结构化错误。

五个 Agent 的配置执行器现已接入。SQL 内的 LIMIT/OFFSET 是唯一分页来源，不叠加请求级 pageNo/pageSize；翻页重新请求。断开页面归属、取消或切换身份后，原请求和迟到结果失效。资源未发布、返回列拒绝和查询截断按失败处理，不回退数据库直连。资源目录发布及当前用户返回权限须在目标 GEA 环境单独验收，不能由本地预览结果推断。

## 验证

```sh
node --test tests/agent-sql-config.test.mjs business/inventory-apsplan/source/tests/data/*.test.mjs
node --test tests/dealer-pagination.test.mjs tests/dealer-query-error.test.mjs business/inventory-fc/source/inventory-light-plugins/tests/*.test.mjs
node --test tests/configured-facts.test.mjs
.runtime/sql-python/bin/python -m unittest discover -s scripts -p test_agent_sql.py
```

每个页面仍使用原构建入口，如 `node scripts/build-inventory-fc.mjs` 和 `node scripts/build-aps-metrics.mjs`。完整官方 SDK 检查和普通安装验收继续按[本地开发](local-development.md)执行；独立页面构建与直连验证不替代这些阶段。


## 默认分页与加载优化

当前来源列表默认每页10行，翻页重新查询；汇总独立全量计算。基地SKU采用服务端筛选、排序与分页，产销初始加载延后未使用的商品预测明细。同一筛选范围内只复用快照日期和配置版本，业务明细不缓存；刷新或筛选变化重新解析快照。

订单履约 order01 使用相同 Host 命名查询通道，不启用本地直连预览。指标口径、权限失败及字段缺口见 [订单履约接入](order-fulfillment-data.md)。 / Fulfillment uses the same governed channel without a direct preview fallback.
# Missing-data hover diagnostics / 空值悬浮诊断

Customer inventory, order fulfillment and order workbench explain unknown values from current governed results, not assumptions about the whole database. Missing source fields, failed or unpublished reads, unmatched joins and invalid calculation conditions are distinct. Values and GEA authorization are unchanged. / 三个页面基于当前受控结果区分源字段缺失、查询/发布失败、未匹配与计算条件不足；不把未知改成0，不扩大权限。

Order workbench retains each metric's `missingReason` beside its formula. Cards, period comparisons, grouped performance tables and expanded SKU rows expose native hover titles; empty periods and zero denominators have different explanations. / 订单工作台在指标元数据保留原因，卡片、周期对比、分组表和SKU展开用悬浮提示说明；无来源记录与零分母分别处理。
