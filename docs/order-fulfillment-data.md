# 订单履约数据接入 / Order fulfillment data

最新基础字段、指标计算与保留缺口以[2026-10-23完整核对](order-fulfillment-source-audit-20261023.md)为准。主表状态保留，追踪表仅补充指标事实；未匹配追踪不清空主表数据。

批次货龄现按用户确认读取所选日期当天及之前的最新快照，不再强制昨日快照；货龄以该快照日减生产日期计算。缺生产日期、数量不完整、负库存和未来快照仍保持未知。

## 当前合同 / Current contract

订单履约 Consumer 为 `order01`。页面、Prompt、capability、MCP 声明保持一致。作者查询配置为 [sql.config.json](../business/inventory-orderfulfillment/sql.config.json)，构建复制到页面包旁；Workbench Host 在作者脚本前注入它。页面只传 `{queryId, parameters}`，不传 SQL、身份、Consumer 或凭据；GEA Host 根据可信安装声明执行，Gateway 按当前用户和委托强制行列权限。筛选器仅收窄范围，不根据前端角色选择数据源，不新增角色授权表。

The installed order01 declarations use the existing configured-query channel. GEA Host owns identity and delegation; Gateway owns row and field authorization. Separate query sections retain granted fields and show denials without switching Consumer, source or transport. The installed GEA page has no direct database fallback. An explicitly injected local preview marker can use a localhost read-only endpoint; its results are marked database-account-only and do not establish GEA grants.

## 需求来源 / Requirements

已读取[订单工作台及订单履约语义](https://klvcodtump.feishu.cn/docx/S7zwdltIaoKfZ0x8oqHcStqQnGg)，修订版 3111，以及其链接的[订单字段说明表](https://klvcodtump.feishu.cn/docx/R2uGdsXjFoGCqtxCPNmcOW76nig)，修订版 1311；2026-10-22 补读节点时限嵌入表。嵌入表格、图片说明与正文不是源数据库字段发布回执。运行面板保留原版 DOM、卡片、图表区域、筛选位置和表格列，只清除样例值与模拟脚本，在原位置绑定受控查询。不得新增筛选栏、汇总卡片或重排布局。

The live document distinguishes allocation fulfillment for unopened orders from shipment fulfillment for opened orders. Shipment demand needs exclusions and per-source-order/SKU execution merging; quantities cannot be summed blindly. Its future-five-day formula, change-rate severity inequality and on-time tolerance contain unresolved alternatives. Those branches are reported as pending rather than silently chosen. Referenced attachments and embedded sheets have not been fully validated against the source schema.

## 已接入及缺口 / Coverage

| 内容 / Content | 当前行为 / Behavior |
| --- | --- |
| 交付/销售 | 来源订单和 SKU 明细、源状态与处理原因、独立去重来源订单数；默认本日，按源创建时间左闭右开筛选。不是文档的期望交付时间口径。 |
| 源数量 | 完整授权明细按执行单及行号检查重复，EA 通过换算率对齐 CS（箱）。同源单行的相同重复需求只取一次；不同源行或需求冲突保持未知。整单数量与展开 SKU 使用同一归并结果。 |
| 追踪风险 | 当前最末已知节点按最晚开单、最晚到厂、最晚发车和开单确认到货时间计算；保留两小时和夜间预警规则。时限缺失和未识别状态不计作正常。 |
| 仓配 | 查询当前授权运单和承运商；空值保持未知，无映射资料不自行匹配。 |
| 品项 | 读取截止日前最近源库存日快照，并限定当前获准订单涉及的基地/SKU；补齐品项、系列、产品标签。自产品标签仅在月度、基地、SKU精确匹配且标签唯一时显示，重复或不匹配不猜测。 |
| 占单满足率、未开订单 | 有效状态 10、纳统标志 1、备单状态明确取值；占单满足率按完整需求加权，分档按订单去重。正式发货满足率仍缺完整排除及产品归集依据，不与占单满足率混用。 |
| 终缺和未来5日覆盖 | 源缺口字段可查看；缺分配账本、来源快照、完整计划/调拨到货依据与单位，不能重新分配或宣称当前完整终缺。 |
| 作废率、改单率、准交率 | 缺锁定期事件及当期应交付分母，不用数量比率或完成样本冒充正式订单张数比例。 |
| 可发货天数 | 已按源库存表内同粒度数量计算：可用库存÷((思念销售计划+BP销售计划+月调出计划×0.5)/月天数)。10日取初版，20日各计划纠偏>0取纠偏否则初版；月末取下月销售及调出初版并使用下月天数。不以近30日发货替代，不对分页行求平均冒充整体指标。 |
| OEM、货龄、未来排产 | 无对应批次/供应确认依据时保持未接入，不把超60天源汇总当≥60天分箱。 |
| 销售确认和下发 | 飞书回调、提醒调度、OMS/WMS/TMS 写入均未接入，页面只读。 |

查询返回列权限决定显示列；缺列与拒列不补零。汇总和明细独立失败、独立显示。分页前后核计数与配置版本，不把截断或变化中的分页当完整集合；跨页无法证明业务源快照完全不可变，页面不据此执行跨页供应分配。筛选、身份和 Session 变化立即清除显示和引用；迟到请求不能发布旧结果。界面状态只保存筛选、维度和页码，不保存业务事实。

## 验证 / Validation

待目标环境配置的资源是 `agents_scm_execute_detail_d`（订单、客户、组织、状态、数量、运单字段）、`agents_scm_shortage_trace_f`（来源/执行单、客户、SKU、需开单时间、提货点、节点标记、源缺口字段）、`agents_scm_stock_detail_d`（基地/SKU、日期、库存、计划字段）、`agents_dim_product_list_mi`（SKU产品标签）及 `agents_dim_transfer_direction_mi`（月度基地/SKU自产品标签）。字段精确清单以配置中的命名查询为准。按现有业务角色配置各表行范围和返回列，不能把数据库 develop 账户权限照搬给用户。源表缺少的字段需先由数据 owner 补齐，发布授权不会创造业务事实。

Different role scopes must be configured server-side for these published resources, including permissions for predicate/join columns and returned outputs. Client role labels grant nothing. Keep one narrow account, a distinct-scope account and a denied/revoked account for acceptance; compare rows, columns, summaries and references after switching identities.

运行 `node scripts/build-order-fulfillment.mjs` 和 `node --test tests/fulfillment-governed.test.mjs tests/fulfillment-live-dom.test.mjs tests/fulfillment-presentation.test.mjs`。Manage 运行 `node --test tests/fulfillment-resource-package.test.mjs`。SQL 已在 Doris/MySQL 协议上只读核对结果列；数据库账户回放仅证明查询可执行，不证明 order01 的资源发布、用户授权或官方 Loader 接收。

源查询回执见 [2026-10-21检查](reports/order01-source-query-check-20261021.json)，不保存业务明细或凭据。独立浏览器检查 `tests/fulfillment-live.browser.mjs` 不依赖官方SDK；可通过 `DSH_BROWSER_CHANNEL` 选择已安装的测试浏览器。它使用显式授权桩，仅证明显示与失效行为。

## 剩余空值核对（2026-10-21） / Remaining missing metrics

本次18个命名查询均在真实数据库返回成功；实际编译页面读取成功，无脚本错误。当前默认范围为10月21日创建的订单，库存最近快照为10月20日。首屏20行库存均有品项、系列、产品标签及可发货天数。节点超时为备单1、派车0、装车1、在途0，节点预警均为0；各节点独立去重，可能重叠，不能将节点计数相加替代整体订单数。回执见[指标核对结果](reports/order01-metric-audit-20261021.json)。

| 保留“—”的内容 | 库内已存在的事实 | 仍缺的依据 |
| --- | --- | --- |
| 未开/已开订单数及节点在办总数 | 执行源订单、源状态；库存表有SKU汇总未备单数量 | 有效执行单关联、未开状态及最新在办节点规则。SKU汇总数量不能变成订单张数，也不能按客户拆分。 |
| 未开缺货量/满足率、已开发货满足率、单行商品满足率及基地/省区比较中的对应值 | 原始/调整/实占/发货数量 | 有效订单清洗、虚拟/短拨/调账等排除、KA渠道需求选择与重复执行需求归并。10月执行源162108行中原始需求155111行有值；源满足率和缺货量字段均无值。 |
| 作废率 | `agents_order_cancel_change_di`有作废数量及原单创建日 | 缺订单主键、作废事件时间，无法落实下单12小时后作废的订单张数分子及全部接收订单分母。 |
| 改单率 | 同表有改单数量 | 缺改单时间、锁定期及发货时间关系，无法确认12小时后且发货前7日内的绝对改量与有效提报数量。 |
| 准交率及完成节点统计 | `agents_order_execute_isontime_mi`有完成样本、排除标记、计算时间及准时标记 | 无法证明包含全部当期应交付订单，源标记的加12小时版本未确认，不能直接用完成样本比例代替。 |
| 终缺、当天及之前、未来5日累计终缺 | 源追踪有缺口字段 | 缺完整供需分配快照、确认到货日期与统一单位。不可将跨执行单重复来源值直接汇总。 |
| 未来5日排产、调拨及预计满足日 | 库存源有日生产计划、入库及调拨数量 | 缺未来5日有效确认供应及订单级逐次分配结果，过去入库不能充当未来排产。 |
| 应责总监、OEM库存、货龄40/60/90/120天分箱 | 有销售/订货员、ODM产品标签、超60天源汇总及最大货龄 | 缺SKU责任总监映射、OEM库存归属及批次库存余额。产品标签不是库存归属，最大货龄不能拆分各区间数量。 |
| 部分自产品标签 | `agents_dim_transfer_direction_mi`有月度基地/SKU标签 | 库存的华东/华南/西南与标签的湖州/广州/四川名称不一致，缺权威映射；精确匹配不到的行保留未知。 |
| 部分可发货天数 | 同库存表有可用库存、销售和调拨初版/纠偏计划 | 非10日/20日/月末快照、计划缺失、天数不一致、零分母或重复源键时不计算。 |
| 承运商/运单、销售确认及下发 | 存在源字段及原界面入口 | 源值为空时保留未知；业务确认与写入接口尚未接入。 |

Missing values remain distinct from genuine zero and denied columns. The additional product tables must be published and granted through GEA before production use; the local database-account check does not establish user permissions.

本地运行在 127.0.0.1:8891 的数据库账户预览与 127.0.0.1:3198 的 GEA 当前用户入口独立。生产入口仍通过 GEA，不在拒权后切换数据库账户预览。

## 页面接线补齐（2026-10-22） / Page bindings

基地、省区与仓配对比使用完整授权输入；状态展开、数量与满足率区间下钻共用同一组订单。订单状态图和满足率分布图支持点击与键盘下钻。产销协同表读取源库存、销售和生产计划，支持产品搜索、基地筛选与分页；没有日期依据的计划不作为未来五日供应。筛选选项来自当前授权结果，客户搜索同时匹配编码或名称。

批次货龄查询仅读取分组生产日期、数量与完整性计数，避免网关未开放的日期运算函数；页面按上一日快照计算 40/60/90/120 天区间，缺日期、负库存、缺数量及旧快照均保持未知。查询与计数使用同一分组。

销售确认和历史弹窗保留模板入口；未安装真实推送及回调接口时禁用提交，不创建模拟成功记录。身份变化清除明细、图表、协同表、下钻缓存和弹窗内容。源表为空不恢复旧数据。完整数据验收与受影响测试通过分别记录。

Comparisons, charts and drilldowns share complete granted facts. The coordination table supports search, base selection and paging without treating undated plans as five-day supply. Batch ages are computed from complete prior-day source dates and quantities without widening gateway function permissions. Confirmation dialogs remain usable, but submission stays disabled until real mutation and callback contracts exist. Identity changes clear all data-derived UI state.

## GEA 实际接入修复（2026-10-21）

客户库存 CTE 的 `sku.*` 在网关执行失败，改成显式输出字段后，明细与总数查询均成功。履约追踪、品项原有的关联 `EXISTS` 不被网关接受，改为对执行范围唯一键 `JOIN`；品项的 `SUBSTR` 改为获准的 `SUBSTRING`。五项改写前后的查询在同一数据库、同一基地和日期参数下结果一致，18 项履约查询均通过实际 GEA。回执见[查询修复验证](reports/order01-gea-query-fix-20261021.json)。

目录已补登履约执行明细，客户库存字段快照已更新为 `big_final_qty`。当前登录账号有 Agent 和受控 SQL 使用权限，新履约表原先没有人员数据范围；本次按用户授权，复用该账号库存明细已有的“郑州基地”范围，为新履约表增加只读岗位来源，未设为不受控。网关实际查询其他基地返回零行。此来源是现有范围的岗位授权快照，尚未验证组织变更自动同步；不代表已完成所有账号的组织授权迁移。

当前账号的页面实测与不同真实账号的验收分开记录。后续仍需以不同范围、拒权及撤权账号验证行列、汇总和身份切换；源码授权桩不代替该验收。客户端安装和发布渠道未变更，界面布局未修改。

## 最新术语库接线（2026-10-22） / Latest glossary

当前口径以[订单履约及工作台术语库](https://klvcodtump.feishu.cn/wiki/DfoBw71VNivaOLkHU2mc2OB2nyd)所指文档 `QN9AdJovRozeqCxmK3zcTg3Ynie`、revision 1548 为准；下述内容替代本页历史记录中相应的旧公式和缺口描述，历史验收不代表当前状态。

- 商品缺货量＝|原始数量－实占数量|；整单及未开订单满足率＝|原始数量合计－当前缺货合计|÷原始数量合计×100%。全部有效输入、单位与拆单归并明确后才计算，不平均SKU百分比。
- 已开订单满足率按当前列表发货数量÷原始数量计算并发布覆盖；创建日列表不是全月发货指标。准交率需要实际到货周期、已发货分母、GPS优先的到货事实及最大承诺时间加12小时规则，不能借用当前列表计算。
- 可发货天数＝可用库存÷[(当月销售计划＋当月调拨出库计划×0.5)÷当月天数]。各计划纠偏值大于0取纠偏，否则取初版；不再限制10日、20日或月末快照，也不在月末自动切换下月计划。
- 主表 `agents_scm_execute_detail_d` 已有 `director`、`product_item`、`series`；独立命名查询 `sku.owners` 已接线，当前GEA探测三列均返回 `FIELD_NOT_PUBLISHED`。不扩大授权，不使该独立失败阻断已有数据，总监未获返回时保持未知。
- 厂内/厂外候车状态归入装车节点。缺货供应追踪仅展示已关联源事实，不冒充按同到货日倒序逐单分配的完整供应账本。未来五日确认供应、GPS/人工实际到货和确认回调仍需补齐。

The latest glossary replaces the corresponding historical formulas above. Quantity-based rates use complete original demand and absolute shortage; the opened shipment rate is explicitly limited to the current list. Days of supply use positive adjusted plans or initial plans for the stock month on any date. New director/category/series fields exist in Doris but are not published by GEA; their optional failure neither widens access nor clears other sections. Conflicting period/threshold definitions and the existing age-bin boundaries are not silently reinterpreted. Layout, pagination and hidden charts remain unchanged.

## 加载与滚动验收（2026-10-21）

按用户本次要求，订单履约和客户库存移除顶部正常加载状态条，取消页面内部固定高度的纵向滚动层，保留单一页面滚动；业务卡片、筛选和表格结构不变。

订单履约按已完成查询逐区显示，连接与视图恢复使用同一有效读取，身份或筛选变化仍取消旧读取。客户库存的后续分页并发读取，全部分页的总数、字段权限和行数通过检查后才使用；身份展示信息不阻塞数据展示。当前用户、同一受控查询的耗时记录见[加载验证](reports/inventory-loading-20261021.json)，不代表其他网络或数据规模下的固定时限。
# Missing-value reasons / 空值原因

Missing quantity tooltips retain provenance: absent source values, failed/unpublished reads, unmatched keys, ambiguous split/unit conversion, duplicate keys and invalid denominators are distinct. No missing value is filled with zero, and formulas/authorization remain unchanged. / 数量横线的悬浮提示区分源字段空值、查询或发布失败、关联未命中、拆单/单位不明、重复键及无效分母，不改变公式与权限。

Shortage diagnosis reads existing governed `shortage.detail` only. `agents_scm_shortage_trace_f` rows with `source_flag='缺货供应匹配'` are joined by execution order plus `material_code`, then checked against customer; SKU-only fallback is forbidden. `final_short_qty=0` is known zero, NULL is missing. Duplicates stay unaggregated; a missing match in current results does not prove the source table lacks the order. / 终缺判断沿已授权明细，以执行单号＋物料匹配并核对客户；不得按SKU串单。真实0保留，NULL、缺键、未匹配与重复分别计数和提示。
