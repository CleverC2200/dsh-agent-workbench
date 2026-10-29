> 2026-10-28 最新：原计划/周期表真实UPSERT及回读通过；已新建并发布 data_service.agent_branch_submission_event。真实DMS测试单 S00700199（65件）完成确认快照→DMS暂存→回执入库及重复提交核对。隔离源码已增加 planningLayout=legacy 接线；当前安装客户端未替换，大批量仍有接口与快照上限。详见本任务 Host docs/fc-live-flow-20261028.md，以下旧阶段记录仅作历史。

# 分仓原 PostgreSQL 表复用核查

**2026-10-28更新：** 用户已确认通用接口支持UPSERT/批量保存，数据源编码为 `Postgres-Data-service`。下文“不支持UPSERT”的描述是10月27日按v1.1文档得出的历史结论，已不作为当前确定阻塞。实际调用通用接口的只读请求返回401；新语法边界、旧表授权、批量原子性仍需联调，不能据口头支持就认定原SQL可原样执行。旧表触发器与外键的实查结论不因此自动改变。

核查时间：2026-10-27 14:45–14:47（Asia/Shanghai）。使用原 `gea-agent-fc` 配置的 PostgreSQL 连接，仅执行只读事务内的元数据查询及数量汇总。连接凭据未进入报告，未读取订单明细或修改数据。

## 实际库结果

| 已存在物理表                             | 行数 | 结构与用途                                                     | 自定义触发器                                       |
| ---------------------------------------- | ---: | -------------------------------------------------------------- | -------------------------------------------------- |
| `data_service.agent_branch_plan_import`  | 2733 | 5个分仓的人工计划；主键为 `warehouse_id + target_month + sku`  | 无                                                 |
| `data_service.agent_branch_cycle_config` |    2 | 2个分仓的周期规则；主键为 `warehouse_id`，规则存 `rules JSONB` | 无                                                 |
| `public.branch_inventory_submission`     |    1 | 旧补货快照、GEA审批状态与回执                                  | 有：`trg_branch_inventory_submission_updated_time` |

三张均为普通表，未发现继承关系。计划表 `warehouse_code` 没有空值；这不等于已证明其与新页面分仓编码逐一对应，周期表仍以原 `warehouse_id` 关联。

本次库中未发现此前建议的 `agent_branch_plan_version`、`agent_branch_cycle_version`、`agent_branch_submission_event`。这说明新适配表尚未建成，不代表原版没有相应业务存储。

原迁移004定义了计划/周期的仓库映射触发器，但当前实际库的这两张表没有这些触发器，也没有迁移004新增的 `warehouseid` 列。不得把迁移文件当作已执行证据；将来应用该迁移后需重新核验通用接口写入资格。

## 能否复用

### 人工计划：可作为复用目标，保存协议需要适配

实际字段为 `warehouse_id`、`warehouse_name`、`sku`、`product_name`、`target_month`、`category`、`material_group`、`outbound_qty`、`transfer_qty`、`imported_by`、`updated_time`、`warehouse_code`、`suggested_outbound_qty`、`suggested_transfer_qty`。

原 `planning-store.ts` 用一次 `INSERT SELECT + jsonb_to_recordset + ON CONFLICT DO UPDATE` 原子保存导入。用户提供的通用接口禁止表值函数和UPSERT，单次写入默认最多100行，不能原样迁移。简单拆成逐行INSERT/UPDATE会产生部分保存和并发覆盖风险，无法等同原来的整批成功语义。

如复用，应由平台提供受控的批量保存业务能力，在服务端完成整批事务、版本冲突和幂等检查；或另行实现经确认的分批暂存及发布协议。当前不能宣称仅改表名即可复用。

### 周期配置：可作为复用目标，需适配编码与版本检查

实际字段为 `warehouse_id`、`rules JSONB`、`updated_by`、`updated_time`。原规则使用 `id`、`objectId`、`cycleDays`、`effectiveFrom`、`effectiveTo`、`status`；当前页面使用 `object`、`days`、`from`、`to`，还具有默认周期，需明确双向映射。

原保存同样使用UPSERT。独立的INSERT/带旧版本条件UPDATE可设计，但必须处理首次插入竞争、数据库时间精度、旧版同时修改以及未知写结果，不能丢弃当前冲突和回读保护。通过接口读取JSONB还需转为其支持的文本类型。

### 旧提交记录：不能直接经当前通用接口写入

- 实际存在自定义更新时间触发器；通用接口规定PostgreSQL写目标不能有自定义触发器。
- `conversation_id + agent_id` 外键引用原 `agent_conversation`，新客户端Session不能冒充旧会话。
- 状态仅允许 `intent_saved / submitting / pending / failed`，回执字段为 `gea_instance_id / gea_receipt`，不是当前DMS事件模型。

因此保留旧表和旧业务数据。当前DMS提交可以继续考虑独立的追加事件表 `agent_branch_submission_event`，或平台提供兼容两种业务的存储服务；不能为了新接线直接删除旧触发器、外键或放宽接口校验。

## 接线与待确认项

原库已有三类业务表，撤回“原库缺三张表，必须全部新建”的表述。优先评估复用人工计划与周期；DMS事件与旧GEA审批分开适配。

现有隔离Host的 `fc-storage.ts` 仍使用三张建议表的追加版本协议，本次没有将它误指向结构不同的旧表，也没有启用真实写入。现有代码的离线验证不等于旧表复用已经实现。

还需平台确认：

1. 通用接口的真实 `dataSourceCode` 是否指向本次核查的数据库，以及上述schema/表的发布方式与SELECT/INSERT/UPDATE授权。
2. 是否提供原子批量人工计划保存能力；仅开放旧表白名单不足以恢复原版整批保存语义。
3. 当前可信身份及分仓授权与原 `warehouse_id` 的对应关系。通用接口不自动做业务行权限过滤，不能只凭有表便开放写入。

只读直连用于此次管理员式核查，不是新增Agent数据库直连通道，也未替代接口授权验收。未发DMS订单、未执行DDL或业务写入，未操作另一对话的PR和CI。

原始脱敏结构证据：本任务隔离父目录 `fc-legacy-pg-schema-audit-20261027.json`。
