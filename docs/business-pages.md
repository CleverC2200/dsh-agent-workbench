# 业务页面导航

修改某个页面时读取下列入口，再核本票 checkout 的声明、实际源码和候选构建输入。表中只导航来源；当前运行模式不从旧验收或页面名称推断。业务 Prompt、Skill 和能力由相邻 Manage 源维护，`lib` 中是构建装配副本。真实身份、Consumer、权限和受控执行由 GEA Host 决定。

| 页面 | 来源与特有约束 |
|---|---|
| 原销售审批 | [页面与业务合同](../src/workbench/original/README.md)，[迁入来源](../src/workbench/original/SOURCE.md) |
| 分仓库存 | [固定迁入来源与两种版本基线](../business/inventory-fc/SOURCE.md) |
| 基地库存 | [迁入来源与原库存计算](../business/inventory-aqkc/SOURCE.md) |
| 经销商库存 | [当前范围及未完成验收](../business/inventory-dealer/README.md)，[来源和完整分页](../business/inventory-dealer/SOURCE.md) |
| 全链分布 | [公司只读来源、历史范围与未完成验收](../business/inventory-qll/SOURCE.md) |
| 个人库存 | [独立 Consumer、隐藏入口和反馈边界](../business/inventory-personal/SOURCE.md) |
| APS 产销协同 | [真实生成链、显式 mock 构建与遗留验收](../business/inventory-apsplan/SOURCE.md) |
| 客户库存 | [固定 HTML 来源和受控读取范围](../prototypes/inventory-customer/SOURCE.md) |
| 订单履约 | [固定输入与模拟范围](../prototypes/inventory-orderfulfillment/README.md) |
| DMS | [来源、内存模拟和真实写入边界](../prototypes/dms/README.md) |

## 区域、品类与 MPS 模拟页面

客户库存右侧 Agent 使用 Manage 提供的完整提示词、页面证据桥接 Skill 和五个专项 Skill：库存诊断、缺货补货、高库存控补、货龄风险、库存变化。Workbench 的 plugin.json 按 Prompt 中的顺序登记全部六个 Skill 文件；构建仍从 Manage 复制资源，不在本仓重复维护业务原文。此次资源接入不新增页面数据源、写操作或权限。

客户库存由 Workbench 保留原展示并通过 GEA 受控 SQL 读取最新客户库存快照；Manage 声明其 Prompt、Skill、表和 `governed-sql-read` 能力，身份、凭据、行列权限仍归 GEA Host。订单工作台与订单履约仍是模拟交互和零业务能力声明。资源选用关联实际 Core Session，不自行创建 Session。订单工作台的本地演示任务在冷刷新后清空。其固定作者输入和边界见 `prototypes/inventory-orderworkbench` 下的 SOURCE.json。

区域计划复用静态作者页与 `plan-regional` 资源。模块、模拟日期、提报维度、节奏草稿和未保存节奏编辑按实际 Session 恢复，重新派生模拟上下文。品类计划复用静态作者页、`category-plan` Prompt、Skill 和空 MCP 声明；指标、事件、建议和任务由作者状态发布为模拟快照。临时模拟任务不落库。

MPS 页面 `plan-category-production` 接收 `inventory-mps` 资源；构建从相邻 Manage 装配。当前挂载步骤发布模拟上下文和页签目录，切步撤旧数据。UI 意图、调整输入和未发文字按实际 Session 恢复；模拟派生数据不存业务库。保存、导出、提交和结转仍只显示模拟提示。

页侧恢复合同见[呈现恢复](presentation-recovery.md)，view 动作的影响范围与授权见[页面桥](page-interaction.md)。

## 验收边界

来源迁入、类型或 fixture 通过、普通包接收、Native 显示、真实数据、模型问答和正式业务写入各有自己的证据。各来源文件中记录的失败、未知与未完成条件继续有效，需以对应提交、输入、环境与时间的回执关闭。没有当前运行回执时，不将源码接线写成已经验收。
