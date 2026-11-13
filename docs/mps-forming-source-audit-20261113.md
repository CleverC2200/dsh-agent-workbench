# MPS 成型机误报根因审计

日期：2026-11-13。用户本轮最终确认，当前业务不使用成型机。原报告中的 5989 项“缺成型机配置”是错误规则触发的误报，不能当作真实源数据缺失，也不产生补机台、日产能或分配数据的义务。此前“补齐成型机配置后重新评估”的结论撤销，原始失败及对照证据保留。

本次只读核源码、固定提交及原留档，仅新增本报告；未操作窗口、查询业务 API、修改实现、构建或发布。主线程完成的实现与运行验证由其独立回执记录，本报告不重复私有业务数据。

## 根因

原审计发现 `forming` 配置没有进入实际求解，只能证明原有可选配置路径未被消费。它不能推出“所有内部生产必须使用成型机”。当前业务是否使用设备，应由用户业务要求决定；类型允许 `forming`、原型存在示例或旧说明列过它，都不构成这一全局前置条件的业务授权。

| 层次             | 已确认事实                                                                                                                                                                                                                            | 对此次误报的意义                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 原实际求解       | Manage 固定提交 `fb3068c678aa3328f469b9e8b9a5b466973c3c64` 的 `src/mps-compute/plan.ts` 仅筛选 `kind === 'tunnel'`，按隧道候选调用 `fairAllocate`                                                                                     | 纯隧道是修改前已有的实际求解路径                                             |
| 新加强制条件     | Manage 提交 `546e6a2aef94b8929ad0071ddfce7cc3d010735b`，company.71，将全部资源带入求解，新增 `forming()`。无成型机或分配时返回 `null`，`optionsFor()` 随即删除该隧道候选                                                              | “没有配置可选设备”被扩大为“内部生产不可行”                                   |
| 错误分类         | 同一提交在 `plan.ts` 新增“缺有效成型机台账、月度批准分配或生产日历”                                                                                                                                                                   | 一条泛化消息混合多个条件，未逐项查询设备源表，不能证明真实缺机               |
| 测试漏验         | 同一提交修改 `tests/mps-workflow.test.mjs` 的通用 `planInput`，补入 `F` 成型机及各月分配，并为其他生产基地补成型机配置                                                                                                                | 原有纯隧道测试输入被改成新规则的满足样例，未保留“业务不使用成型机”的回归场景 |
| 旧评估与页面残留 | 固定基线 Manage `768508d1c3e7543672a6b3218bcaaff58ce4af84` 的 `workflow.ts` 对每行无条件检查 `['tunnel', 'forming']`；Workbench `7ac0f4c8ece889fa3d4fc31784116d392793e421` 的 `workflow-view.js` 硬编码缺成型机及两类资源批准分配提示 | 即使修正实际求解，仍须同步撤销评估和页面的无配置即缺失规则                   |

以上固定提交可在对应本地仓用 `git show <提交>:<路径>` 回读。Manage 仓为 `CleverC2200/dsh-agent-manage`，Workbench 仓为本报告所在仓。此处记录的是可复核的实现演变，不把此前工程说明当作业务合同。

## 源码说明了什么

当前主数据读取只请求产品、产线 SKU、隧道和调拨四类关系，见 [relations.js](../static/mps/source/relations.js#L21)。源隧道按基地、生产单位及隧道号装配为 `kind: 'tunnel'`，见 [plan-inputs.js](../static/mps/source/plan-inputs.js#L146)。草稿 schema 允许 `forming`，见 [mps-local-draft.ts](../src/mps-local-draft.ts#L174)。这些事实证明现有入口及配置能力，不能证明业务需要补成型机。

当前两条产能 SQL 来自 `agents_dim_tunnel_capacity_mi` 与 `agents_dim_production_line_sku_capacity_mi`，见 [SQL 配置](../static/mps/sql.config.json#L252)及[产线 SKU 查询](../static/mps/sql.config.json#L312)。没有请求成型机数据、没有适配器或当前配置不含该字段，都不能推出数据库没有数据。用户确认当前业务不使用成型机后，无需继续寻找“待补”的成型机表。

生产日历是独立输入。现有规则为每月默认 25 天，春节前后各 5 个自然日按所属月份扣减，人工天数最终覆盖，见 [production-calendar.js](../static/mps/source/production-calendar.js#L3)。原错误消息同时写“或生产日历”，也不能据此把全部记录归为真实日历缺失。

## 当前修正边界

以下记录源码修正与回归范围。Manage修正已提交并进入PR162，Workbench按同一固定输入校验；源码、开发窗口验收及正式发布分开记录。

| 修正                                                                                         | 当前依据                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 生产基地没有显式成型机时，`forming()` 返回空占用列表，保留隧道候选，正常进行隧道求解         | [plan.ts](https://github.com/CleverC2200/dsh-agent-manage/blob/815ebd4db6405433243e02a0732373a1cb393fce/src/mps-compute/plan.ts#L188)                                                                                                                                                                                                                                                                                                                                             |
| 常规资源评估跳过该基地未配置的 `forming` 类型                                                | [workflow.ts](https://github.com/CleverC2200/dsh-agent-manage/blob/815ebd4db6405433243e02a0732373a1cb393fce/src/mps-compute/workflow.ts#L598)                                                                                                                                                                                                                                                                                                                                     |
| 单资源占用复用已有 `fairAllocate`，纯隧道不额外承担多设备联合枚举                            | [joint-allocation.ts](https://github.com/CleverC2200/dsh-agent-manage/blob/815ebd4db6405433243e02a0732373a1cb393fce/src/mps-compute/joint-allocation.ts#L11)                                                                                                                                                                                                                                                                                                                      |
| Tab5 撤销无配置即缺成型机的缺项，Tab6 仅在已有显式配置时展示成型机区域                       | [workflow-view.js](../static/mps/source/workflow-view.js#L1192)、[capacity-report-view.js](../static/mps/source/capacity-report-view.js#L187)                                                                                                                                                                                                                                                                                                                                     |
| Prompt 与 Skill 撤销当前业务必须有成型机的要求，通用夹具恢复纯隧道，专门用例保留显式配置覆盖 | [MPS Prompt](https://github.com/CleverC2200/dsh-agent-manage/blob/815ebd4db6405433243e02a0732373a1cb393fce/business-resources/inventory-mps/prompt.json#L4)、[MPS Skill](https://github.com/CleverC2200/dsh-agent-manage/blob/815ebd4db6405433243e02a0732373a1cb393fce/business-resources/inventory-mps/skills/inventory-mps/SKILL.md#L23)、[计算测试](https://github.com/CleverC2200/dsh-agent-manage/blob/815ebd4db6405433243e02a0732373a1cb393fce/tests/mps-workflow.test.mjs) |

保留显式配置分支是保护原配置能力，不表示用户已确认当前业务采用该规则。本轮不补任何机台，也不填造能力或份额。后续验收应保留真实纯隧道输入，核对求解、工作流、页面、CSV 和助手说明均不再因未配置成型机报缺或阻断；其他真实输入缺项仍按各自证据处理。
