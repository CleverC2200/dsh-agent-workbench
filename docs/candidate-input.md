# 候选输入检查

Workbench 持有三仓候选检查 CLI。它读取调用者指定的冻结输入，检查登记目标、三仓提交、dirty、提交内的锁和固定官方 Core SDK。它不安装依赖、不构建、不更新登记、不启动进程或访问业务。

```sh
npm run candidate:verify -- --input /absolute/path/integration-set.json --checkout "$PWD"
```

输入沿用项目 `integration-set.json` 的 `core` 与 `repositories`。每个 repository 含 `repo`、绝对 `path`、完整 `head`；必须登记 Workbench、Manage、GEA 各一个。命令拒绝未登记的历史 checkout。实现者独立 checkout 需由该票冻结输入明确登记其路径和提交，不得改共享输入来掩盖失败，也不能把其他任务的集成目录当自己的可写工作树。

结果只有 `stage=candidate-input`、`status=passed` 与 `runtime=not-observed`。输出提供观察时间、Core 和各仓实际路径/HEAD。它不证明工具链已安装、类型/质量/测试通过、产物装配、当前选择、Native 装载或发布。

最低输入是 Node、Git、冻结输入文件、三个干净 Git checkout、各仓已提交的 package.json 和锁、Workbench 的 tsconfig.official.json，以及该配置声明的官方 SDK。官方 Core 固定在原输入检查的基线，调用者不能覆盖。SDK 可只读引用；node_modules 和 lib 不能跨工作树共享。

检查从 Q5 的 `098229a139e98f3fb44ae3b642ead9df3fec67f6` 中接收三仓 HEAD/dirty/锁与 `verifyOfficialInput` 行为。原 Q5 的质量 runner、上游原资产回执和 CI 门禁不属于本命令的通过范围，历史绿结果不会升级为本轮通过。原日志由项目 Q5 evidence 保留。
