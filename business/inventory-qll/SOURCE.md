# 全链分布来源

页面、确定性业务计算与范围和引用逻辑恢复自 Git 对象 `eab392344ab2081222683f2d6d2ae2741fde8e06`。趋势面板来源为原 15 Workbench `096e2ccf43a2d766853163754d7469ccb8879fb1`，解释规则来源为原 15 Manage `66bb4380d2f05b803a7478ea2bb29a4d2864dd1b`。原模拟接收阶段的固定输入、数量、预算和缺口保存在[历史来源说明](../../docs/history/inventory-qll-source-before-live-read.md)，不用于判断当前运行模式。

当前菜单入口为 `inventory-qll`，页面 surface 为 `gea-html-inventory-qll`，Consumer 为 `full-chain-inventory`。运行声明见 [plugin.json](plugin.json) 与 [page.json](page.json)。当前主页面为 [ConfiguredWorkbench](source/inventory-light-plugins/src/pages/configured-workbench.tsx)，使用受控摘要、批次和按需列表。公司部分读取既有每日汇总，渠道仍读取所选日期前最近的客户库存来源。缺失、拒权和失败保留原状态，不回退模拟数据；原 [qll-source.ts](source/inventory-light-plugins/src/qll-source.ts) 及 Manage 的 `full-chain-source-rows` 保留历史引擎接线。

读取要求明确时点和目标月。分页逐页核 total、字段权限元数据、应返回行数与来源键，任一变化或不完整使该读取失败。并发界限、固定 SQL 与历史窗口以 [qll-source.ts](source/inventory-light-plugins/src/qll-source.ts)、[qll-sql.ts](source/inventory-light-plugins/src/qll-sql.ts) 和 [qll-engine.ts](source/inventory-light-plugins/src/qll-engine.ts) 为准，不从旧模拟快照恢复查询协议。

按实际 Session 保存范围、月份、页签、SKU、风险及组织与品类 UI 意图。业务事实与快照不写入持久 UI 状态；身份、Session、范围变化及刷新撤旧事实与引用。缺失历史期间为 null，真实零值仍为 0。当前快照的有效期和引用上限由现有引擎维护。

真实客户数据集、行级权限、趋势、Native、模型与完整普通包验收仍需各自对应的回执。当前源码接线、资源声明和历史 fixture 不能证明实际 GEA 授权、真实数据或运行验收。原 14/15 失败与未完成验收保留。

四个Agent新增日期发货、有值库存范围与独立仓库筛选的来源及验证，见[2026-10-20数据补充](../../docs/four-agents-data-refresh-20261020.md)。当前本地构建与正式只读取数对账不代表客户端已经安装。

同步数据的剩余字段统一维护在[缺失字段清单](../../docs/agent-missing-fields.md)，页面仅保留数值范围与必要查询错误。布局继续沿用本页原始样式，指标卡按业务窗口宽度换行，宽表格在表格区域滚动。

原版可见结构和新版查询的分工见[界面恢复记录](../../docs/agent-original-layout-restoration-20261020.md)。

同一快照、仓库、SKU、生产日期及原查询业务范围内，先汇总有符号批次数量，再以净正批次计算货龄、分段和风险。完全冲销批次不再贡献旧货龄；不能用其它 SKU、仓库或生产日期抵消。`negative_qty` 表示汇总后仍为负的批次余额，库存总量继续保留有符号净额。原始明细不作改写。

重新生成库存 SQL 后，使用 `scripts/net-inventory-batches.py` 对交付配置应用同批次净额步骤；执行 `scripts/test_batch_net_balances.py` 和 `scripts/test_batch_age_lists.py` 核对冲销、货龄、风险及分页。SQL 配置仍是页面读取和打包的唯一查询来源。

全链看板通过公共 Host 的 `insight` 动作生成洞察。业务规则唯一来源为 Manage 的 `business-resources/inventory-qll/skills/qll/insight-rules.md`，构建时复制到 `insight-prompt.md` 并记录摘要。页面按当前证据和渠道观测选项刷新洞察；权限、会话归属、缺失值和渠道不计入公司主值的约束沿用公共实现。

同月、版本、基地和 SKU 的目标记录逐字段核一致性：全非空且唯一值取一次，不对重复目标求和；冲突或空值混合保持未知。初始/管理/最终目标作为同一优先级决策校验，冲突不得借空值回退到另一目标；日均计划仅全量缺失时按本版本既有计划公式补算，冲突不得回退。聚合输入在内部派生表只计算一次，再判断一致性；缺失和真实 0 分开。重新生成查询后执行 `scripts/normalize-target-consensus.py`，回归见 `scripts/test_base_target_versions.py`。

## 全链品类统计一致性（2026-11-05）

当前页面使用 `ConfiguredWorkbench` 的受控摘要与按需品类下钻。含渠道时主库存合并客户在仓，不合并客户在途；公司品类库存列保留基地和分仓，渠道另列。公司满足率合并基地与分仓已发货客户订单池的有效订货、限额发货数量后计算。

基地周转与基地工作台一致：使用按所选日期选择的目标版本，对库存、目标和计划日均均非负且有值的同一批 SKU，用库存合计÷计划日均合计。分仓回顾周转与分仓工作台一致：可用库存非负、近30日正向发货日均大于0的同批 SKU，用可用库存合计÷发货日均合计。公司周转先合并两层有效分子、分母再相除，不相加或平均各层天数。分仓货龄仍按库存快照日计算，动销窗口则与卡片的业务读取日期一致；快照下钻按同一批次、仓库、SKU关联既有 BRANCH_DEFAULT 动销，不改权限和库存净额。

渠道品类列表与卡片均逐条忽略负库存；有效零值保留，缺失与异常保留未知。目标差额保持原数据范围，不把缺失的分仓目标当作零。卡片、品类列表与组织下钻使用各层同一有效范围，缺少库存记录的出货不能据此填成零库存。组织基地库存使用与基地工作台相同的 BASE_STOCK 版本，货龄使用 BASE_AGE；分仓组织下钻仅取分仓记录，不混入基地批次。

基地组织下钻保留已物化的订单输入，只绑定当前基地和品类；不再因冗余订单过滤开关使合法摘要失配并回退原始明细。最终基地筛选和服务端权限继续生效。

重新生成源与快照查询后运行 `scripts/fix-qll-category-metrics.py`；首屏汇总仍保留显式返回字段和原权限条件，使用等价 COUNT(1) 避免当前网关的嵌套通配计数处理开销。回归见 `tests/qll-category-tree.test.mjs`、`tests/daily-summary.test.mjs` 与 `scripts/test_qll_category_metrics.py`。

## 完整批次与默认目标版本（2026-11-09）

同月的公司库存卡片和列表使用已授权完整批次的业务时点绑定窗口，所选时点早于该批次时不使用未来事实。渠道来源保持独立。基地品类下钻复用 `readConfiguredTargetScope` 的已发布月份/版本规则，不固定滚动版本。权限错误不切换资源重试，不补0；页面不新增数据日期提示。回归见 `tests/qll-published-date.test.mjs` 和 `tests/qll-category-tree.browser.mjs`。

满足率分别沿用各库存工作台：基地使用所选日的当月客户已发货订单池，分仓使用其有效业务日的当月客户已发货订单池。两层截止日不同则分别查询，公司合计只合并有效限额发货与订货数量，不平均百分比。目标版本仍按用户所选日解析，不被库存批次日回退改变。此次改动仅本地验证，未发布。
