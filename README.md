# Agent 工作台

Workbench 贡献页面目录、Native/HTML 业务文档、公共布局、页面动作与页面/Session 关联。它消费当前官方 Core 的公开接口。Core 持有 Session、预设、草稿和历史；Manage 管资源与纯计算；GEA Host 管唯一业务身份、凭据与受控执行。

## 开发入口

从本项目 `docs/agents/current-development.md` 找本票登记的 checkout，再读 [AGENTS.md](AGENTS.md)。package.json 的 packageManager、scripts 与 exports 是实际工具链、命令和公开导出来源。

- [本地准备与检查](docs/local-development.md)
- [候选输入约定](docs/candidate-input.md)
- [页面、引用与业务桥合同](docs/workbench-contracts.md)
- [页面恢复与 Core Session 关联](docs/presentation-recovery.md)
- [共享视觉资源](theme/README.md)

## 当前实现

| 职责 | 当前实现入口 |
|---|---|
| 页面选择与 Session 地址关联 | [workbench.ts](src/workbench.ts) |
| Native/HTML 文档呈现与引用释放 | [frame-presenter.tsx](src/frame-presenter.tsx) |
| Host 页面登记与安全 HTML 读取 | [html-pages.ts](src/html-pages.ts) |
| 资源选用与借用 Core Session | [resource-selection.ts](src/resource-selection.ts) |
| 页面动作和业务授权使用 | [page-runtime.ts](src/page-runtime.ts) |
| 显式引用与 Core 持久 sidecar | [reference-store.ts](src/page-interaction/reference-store.ts) |
| 原销售审批业务口径 | [业务页面说明](src/workbench/original/README.md) |

页面可见、资源存在、业务身份已认证和 Consumer 授权分别成立。静态页面不创建 Session；已声明资源的页面沿公开资源入口借用真实 Core Session。历史恢复重新核实际 Session、工作区、preset 与 GEA subject，不覆盖旧草稿或恢复旧 grant。源码、测试和包通过分别是候选证明，真实运行需对应窗口回执。

## 来源与历史

[官方来源](UPSTREAM.md)、[原销售页面来源](src/workbench/original/SOURCE.md)和各资源的 SOURCE 文件保存来源、许可证与非直观业务原因。模拟页面保持 mock 标记与原必要限制。历史失败、用户 Session 和业务 Prompt/Skill 不在信息清理中重写。

[之前的 README](docs/history/README-before-agent-environment-02.md)与[仓级指引](docs/history/AGENTS-before-agent-environment-02.md)保留原字节，仅供追溯。当前合同在上述活跃入口维护，不从旧文档推断运行、授权或发布事实。
