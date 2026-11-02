# 全链分布来源

页面、确定性业务计算与范围和引用逻辑恢复自 Git 对象 `eab392344ab2081222683f2d6d2ae2741fde8e06`。趋势面板来源为原 15 Workbench `096e2ccf43a2d766853163754d7469ccb8879fb1`，解释规则来源为原 15 Manage `66bb4380d2f05b803a7478ea2bb29a4d2864dd1b`。原模拟接收阶段的固定输入、数量、预算和缺口保存在[历史来源说明](../../docs/history/inventory-qll-source-before-live-read.md)，不用于判断当前运行模式。

当前菜单入口为 `inventory-qll`，页面 surface 为 `gea-html-inventory-qll`，Consumer 为 `full-chain-inventory`。运行声明见 [plugin.json](plugin.json) 与 [page.json](page.json)。[qll-source.ts](source/inventory-light-plugins/src/qll-source.ts) 经公共 GEA 通道按固定 SQL 显式读取公司库存、订单和货龄来源，并分别读取当前事实与按需历史。原字段映射和数量、速度纯计算由 Manage 的 `full-chain-source-rows` 唯一维护。渠道读取未启用，缺客户数据保持未知；拒权、错误或取消不回退模拟输入，也不恢复旧 pool/channel。

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
