# Workbench 实现入口

先从项目根的 `docs/agents/current-development.md` 与本票冻结输入确认自己的 checkout；根同名历史克隆不是默认实现目标。先读本票范围，再读此目录的指引。

## 归属与当前接口

- Workbench 负责页面目录、Native/HTML 呈现、公共布局、页面动作与页面/Session 关联。
- Core 持有真实 Session、预设、草稿、历史和持久生命周期。Workbench 借用公开引用，不另建当前 Session 权威。
- Manage 提供已安装资源声明与纯计算。GEA Host 持有唯一业务身份、凭据、Consumer 授权和受控执行；账户 UI 只读投影不授予业务权限。

当前导航与声明见 [README](README.md)、[页面合同](docs/workbench-contracts.md)和[恢复合同](docs/presentation-recovery.md)。公开导出从 package.json 查询，工具链和命令从 packageManager/scripts 查询。按触及的行为读取相关源码和已有测试，不从历史过程记录推断当前实现。

## 检查与隔离

[本地检查](docs/local-development.md)说明依赖、候选输入、引用和注释语义检查。普通增量检查可面对未提交修改；`candidate:verify` 只用于已冻结的干净三仓，不代替开发期检查。保留业务口径、取消/权限原因、法律/工具注释和公共声明。Prompt、Skill、业务文案与运行时字符串不属于普通注释清理。

本仓只交付 Workbench 插件。客户端壳、启动器和安装协议由对应客户端所有者处理；页面验证不代表客户端打包、Native 装载或业务验收。本隔离任务不向正式 GitLab/OSS/npm/频道发布，不修改正式运行目录。远端动作按本票有效授权和项目登记目标办理，不能从上游发行说明扩大范围。

[之前的仓级入口](docs/history/AGENTS-before-agent-environment-02.md)与[之前的 README](docs/history/README-before-agent-environment-02.md)按原字节保留为历史。历史资料不作为本任务操作指引。当前职责与非直观规则分别就近保存在合同和源码中。

## 质量规则与执行

| 规则 | 执行机制 |
| --- | --- |
| 普通开发检查实际知识引用、固定 lint/format 与官方声明 | `quality:fast`，固定策略及质量 CLI 反例 |
| 冻结候选核实际包名、HEAD、锁、事件 SHA 与登记 Core | `candidate:verify`、`quality:ci`，Core 清单读取相邻 GEA |
| 原迁移语义输入在冷 runner 保持固定来源 | `migration-history-input.test.mjs`，原 Git blob 与原始字节摘要 |
| 汇总仅在两个 Core 的所有适用门禁成功时通过 | workflow matrix 与 `run-quality-ci.mjs --phase final` |

检查范围、旧债和验证阶段见 [质量门禁](QUALITY.md)。已有只读 SDK 使用 verify，独立冷 runner 才准备自己的 SDK。
