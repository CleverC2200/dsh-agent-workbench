# MPS本轮完成度，2026-11-12

冻结发现见[mps-rule-completion-audit-20261112.md](mps-rule-completion-audit-20261112.md)。本文记录最终交付，原审计及失败证据保留。

四个月需求、待定单品隔离及草稿保留等本轮已确认规则已补修，已发布Workbench0.1.106、Manage0.6.3-company.69、GEA0.0.283。2026-11-13用户明确实际业务不使用成型机。后续108版将其设为必填所产生的5,989条缺项属于实现误报，原成型机补数结论撤销；修正及验收见[根因调查](mps-forming-source-audit-20261113.md)。以下106发行记录保留为历史。有效范围继续计算，源业务缺项逐基地、SKU及月份单列；完整范围排产仍需补齐业务输入。

| 层级   | 已核事实                                                                                                                                                          | 验收边界                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 源码   | 参与范围、全国不可拆分事实、带基地老码、替换系数未知、下游完整性及草稿保留已补齐                                                                                  | 规则与源缺项分别记录                           |
| 检查   | [Workbench319](https://github.com/CleverC2200/dsh-agent-workbench/pull/319)、[GEA401](https://github.com/CleverC2200/dsh-gea-plugin/pull/401)及各自合并后检查通过 | 原失败、取消与后续通过分别保留                 |
| 归档   | 固定主线构建、三包交付、正式预检及Core0acc官方安装接收通过                                                                                                        | 不代表其它Core或员工设备验收                   |
| Native | 授权开发profile实际加载最终归档；真实四月明细、参与范围、排产、ODM、入库及库存输出已核对                                                                          | 未知数量留空，ODM仍为默认估算                  |
| 原数据 | 原评估、草稿、人工输入及历史会话按安装前快照逐项核对保留                                                                                                          | 只新增本轮评估，没有写业务表                   |
| 发布   | test117、stable109及生产读取器三包下载通过；GitHub Release已读回                                                                                                  | 员工设备升级、补数后完整范围及供方实际能力另验 |

发行记录：[Workbench106](https://github.com/CleverC2200/dsh-agent-workbench/releases/tag/v0.1.106)、[Manage69](https://github.com/CleverC2200/dsh-agent-manage/releases/tag/v0.6.3-company.69)、[GEA283](https://github.com/CleverC2200/dsh-gea-plugin/releases/tag/v0.0.283)。Manage复用相同不可变归档。

合并后检查：[Workbench](https://github.com/CleverC2200/dsh-agent-workbench/actions/runs/43219156603)、[GEA](https://github.com/CleverC2200/dsh-gea-plugin/actions/runs/43220105570)。原102/279及104/281候选均在上传前保留原标签和归档，没有覆盖或移动。期间主线推进到105/282，106/283从包含其修复的主线重新固定。

## 复盘

前一版入库交付未包含另一分支的四月规则，部分页面用例仍读取旧编译产物或沿用全范围预期。本轮补上实际构建、归档、Native脚本及真实输出的逐层核对。

真实关闭又复现旧归属reset后默认草稿回写。持久化与读取先暂停，合法view restore后恢复；正常关闭冷启动与最终安装均保留原记录。

取数暂停回归原先使用宿主收件计数，把切换前已排队的消息误算为新查询。后续改在源iframe的MessagePort发送边界核验，并继续检查合法恢复后的重新读取。旧失败运行保留，后续通过单独留证。

CI元数据编辑检查依赖正式producer，同HEAD不等于重复运行。本轮曾误取消其正式producer，取消记录保留；重新固定实际106配套输入后的正式检查及主线检查已通过。

私有验收清单及CSV包含源表、字段、原值与补齐说明，不进入公开仓库。仍需补充或确认的业务输入包括有效需求的历史量与基地、期初库存、ODM及收货关系、产线和调拨关系，以及提报或环比分母。

## 进一步复盘仍未接完的部分

| 分类               | 当前实现与影响                                                                                                                     | 依据与后续范围                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 成型机误报已纠正   | 当前业务只使用隧道，未配置成型机不构成缺项；实际求解、参考评估及缺项提示撤销该默认必填。原显式配置保留，不能据此要求当前业务补机台 | [装配](../static/mps/source/plan-inputs.js)、[实际求解](https://github.com/CleverC2200/dsh-agent-manage/blob/main/src/mps-compute/plan.ts)、[计算合同](https://github.com/CleverC2200/dsh-agent-manage/blob/main/docs/design/mps-compute.md)。原形成型机补数判断撤销，真实数据已按隧道规则重新验收 |
| 状态描述已补修     | 需求上下文和JSON从同一份当前计算结果派生可计算、待定和排除数量，区分已计算、部分可计算、待补输入；MPS Prompt/Skill同步已确认规则   | [上下文及JSON](../static/mps/source/demand-confirmation.js)、[业务Skill](https://github.com/CleverC2200/dsh-agent-manage/blob/main/business-resources/inventory-mps/skills/inventory-mps/SKILL.md)。正式业务保存仍未接入                                                                           |
| 缺映射或口径待确认 | 濮阳合并、8:2外协没有完整映射，未折入能力；0.5调拨库存修正未采用，库存仍按完整调入调出守恒                                         | [能力装配](../static/mps/source/plan-inputs.js#L105)、[库存计算](https://github.com/CleverC2200/dsh-agent-manage/blob/v0.6.3-company.69/src/mps-compute/plan.ts#L425)。先确认作用对象、期间及映射，再实现                                                                                          |
| 仍为临时口径       | 源目标周转天数缺时使用原临时0天口径，源缺项及临时性质保留                                                                          | [源口径](../static/mps/source/inventory-target-view.js#L10)、[逐行提示](../static/mps/source/evaluation-view.js#L715)。补齐真实源天数后重评                                                                                                                                                        |
| 未接入的产品能力   | 正式业务保存、确认与写入仍未接；JSON仅供导出核对，没有文件重载路径。Core本地草稿恢复已实现，两者不同                               | [本地保存](../static/mps/source/demand-confirmation.js#L1034)、[底稿导出](../static/mps/source/demand-confirmation.js#L1955)。正式写入需业务接口与授权，JSON回载需另补导入校验                                                                                                                     |

模型预测单位仍待确认，但当前只进入对照展示，没有自动进入有效需求，见[先计算需求](../static/mps/source/workflow-inputs.js#L328)及[后装配模型对照](../static/mps/source/workflow-inputs.js#L414)。年度请求覆盖统计基月所属完整财年及四个滚动月，未发现可证实的窗口漏月；未取得月份仍需按实际读取回执区分缺记录、失败或财年口径，不能一概认定源表真缺，见[请求窗口](../static/mps/source/workflow-view.js#L310)与[报告窗口](https://github.com/CleverC2200/dsh-agent-manage/blob/v0.6.3-company.69/src/mps-compute/capacity-report.ts#L51)。

当前业务无需补成型机台账或批准分配，原错误补数清单仅作失败证据保留。正式业务计划保存仍未接入。原106/108归档不改写，源码修正、开发窗口验收与新版本发布分别记录。
