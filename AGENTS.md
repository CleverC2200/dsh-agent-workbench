# Workbench 开发入口

先核本次任务登记的 checkout、HEAD 和未提交改动。工具链、命令、锁和公开导出从 [package.json](package.json) 读取；根同名历史克隆和旧验收不是当前实现依据。

Workbench 管页面目录、Native/HTML 呈现、公共布局、页面动作及页面/Session 关联。Core 持有真实 Session、预设、草稿和历史；Manage 管资源与纯计算；GEA Host 持有业务身份、凭据和执行授权，页面只消费只读投影。

按功能读[页面合同](docs/workbench-contracts.md)、[恢复合同](docs/presentation-recovery.md)和现有源码/测试。代码用命名、类型和结构表达规则，自有源码、脚本与测试不写注释；业务 Prompt/Skill 与运行时文案保持原含义。工具指令先消除依赖，许可证来源按原分发要求保全。

普通检查和注释清理范围见[本地开发](docs/local-development.md)。`check:comments` 默认阻断全仓自有代码注释，支持范围和资产来源见 `source-comments.json` 与[本地开发](docs/local-development.md)。第三方、生成物、业务资源、fixture 与历史证据按真实来源保留。

在插件拆分项目中构建或调试前，读取项目根 `docs/agents/dependency-preparation.md` 的源码反馈入口，复用已准备环境，只隔离本次可写源码。三包交付由 GEA 的 `docs/package-delivery.md` 维护；页面检查、实际安装和业务验收分别留证。

仅修改本任务工作区。GitLab source、正式 OSS/npm/频道、正式客户端与用户 Session/草稿保持保护；远端写入按本次有效授权执行。历史文件退场先核引用与原提交，原始业务要求、失败和必要测试输入保留。
