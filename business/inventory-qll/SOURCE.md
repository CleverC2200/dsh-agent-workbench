# 全链分布来源

页面、确定性业务计算与范围和引用逻辑恢复自 Git 对象 `eab392344ab2081222683f2d6d2ae2741fde8e06`。趋势面板来源为原 15 Workbench `096e2ccf43a2d766853163754d7469ccb8879fb1`，解释规则来源为原 15 Manage `66bb4380d2f05b803a7478ea2bb29a4d2864dd1b`。原模拟接收阶段的固定输入、数量、预算和缺口保存在[历史来源说明](../../docs/history/inventory-qll-source-before-live-read.md)，不用于判断当前运行模式。

当前菜单入口为 `inventory-qll`，页面 surface 为 `gea-html-inventory-qll`，Consumer 为 `full-chain-inventory`。运行声明见 [plugin.json](plugin.json) 与 [page.json](page.json)。[qll-source.ts](source/inventory-light-plugins/src/qll-source.ts) 经公共 GEA 通道按固定 SQL 显式读取公司库存、订单和货龄来源，并分别读取当前事实与按需历史。原字段映射和数量、速度纯计算由 Manage 的 `full-chain-source-rows` 唯一维护。渠道读取未启用，缺客户数据保持未知；拒权、错误或取消不回退模拟输入，也不恢复旧 pool/channel。

读取要求明确时点和目标月。分页逐页核 total、字段权限元数据、应返回行数与来源键，任一变化或不完整使该读取失败。并发界限、固定 SQL 与历史窗口以 [qll-source.ts](source/inventory-light-plugins/src/qll-source.ts)、[qll-sql.ts](source/inventory-light-plugins/src/qll-sql.ts) 和 [qll-engine.ts](source/inventory-light-plugins/src/qll-engine.ts) 为准，不从旧模拟快照恢复查询协议。

按实际 Session 保存范围、月份、页签、SKU、风险及组织与品类 UI 意图。业务事实与快照不写入持久 UI 状态；身份、Session、范围变化及刷新撤旧事实与引用。缺失历史期间为 null，真实零值仍为 0。当前快照的有效期和引用上限由现有引擎维护。

真实客户数据集、行级权限、趋势、Native、模型与完整普通包验收仍需各自对应的回执。当前源码接线、资源声明和历史 fixture 不能证明实际 GEA 授权、真实数据或运行验收。原 14/15 失败与未完成验收保留。

四个Agent新增日期发货、有值库存范围与独立仓库筛选的来源及验证，见[2026-10-20数据补充](../../docs/four-agents-data-refresh-20261020.md)。当前本地构建与正式只读取数对账不代表客户端已经安装。

同步数据的剩余字段统一维护在[缺失字段清单](../../docs/agent-missing-fields.md)，页面仅保留数值范围与必要查询错误。布局继续沿用本页原始样式，指标卡按业务窗口宽度换行，宽表格在表格区域滚动。

原版可见结构和新版查询的分工见[界面恢复记录](../../docs/agent-original-layout-restoration-20261020.md)。
