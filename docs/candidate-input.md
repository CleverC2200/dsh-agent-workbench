# 候选输入检查

Workbench 持有三仓候选检查 CLI。它读取调用者指定的冻结输入，检查登记目标、实际包身份、三仓提交、dirty、提交内的锁和固定官方 Core SDK。它不安装依赖、不构建、不更新登记、不启动进程或访问业务。

```sh
npm run candidate:verify -- --input /absolute/path/integration-set.json --checkout "$PWD"
```

输入使用 `integration-set.json` 的 `core` 与 `repositories`。`core` 必须是支持清单登记提交的 SHA 字符串；版本与路径说明可另列字段，不能把 `core` 写成对象。项目验证 helper 还要求 `officialCorePath`。固定提交由本仓 `scripts/verify-official-input.mjs` 核验，不由调用者改定。

每个 repository 含 `repo`、绝对 `path`、完整 `head`；必须登记 Workbench、Manage、GEA 各一个。命令拒绝未登记的历史 checkout。实现者独立 checkout 需由该票冻结输入明确登记其路径和提交，不得改共享输入来掩盖失败，也不能把其他任务的集成目录当自己的可写工作树。

早期轮次有把 `core` 保存为对象的登记，不能直接传给本 CLI。核对这种输入时先读原票的检查协议；需要本 CLI 时，在本票自有证据中保存符合合同的派生输入及原登记摘要，保留原三仓路径、提交和 Core 绑定。源登记、实际 dirty 和失败回执保持，不以转换格式解除它们。

冻结核对同时读取各 `path` 下的 `package.json.name`，按现有三仓身份约定核对：`dsh-agent-workbench` 对应 `@cleverc2200/dsh-agent-workbench`，`dsh-agent-manage` 对应 `dsh-agent-manage`，`dsh-gea-plugin` 对应 `@cleverc2200/gea-dsh-prototype`。实际名称不符时返回 `CANDIDATE_PACKAGE_IDENTITY`，列出声明角色、预期包名和观察包名。互换 Manage/GEA 的路径及 HEAD 不能通过该检查。

结果只有 `stage=candidate-input`、`status=passed` 与 `runtime=not-observed`。输出提供观察时间、Core 和各仓实际路径/HEAD。它不证明工具链已安装、类型/质量/测试通过、产物装配、当前选择、Native 装载或发布。

最低输入是 Node、Git、冻结输入文件、三个干净 Git checkout、各仓已提交的 package.json 和锁、Workbench 的 tsconfig.official.json，以及该配置声明的 SDK。GEA [支持清单](../../dsh-gea-plugin/scripts/supported-cores.json) 持有当前登记 Core 来源，检查只接受清单内的完整提交；输入的 `core` 仍须与实际 SDK 同源。SDK 可只读引用；node_modules 和 lib 不能跨工作树共享。

GitHub 质量矩阵保持原官方 rc.2 和 alpha.1 两轴。清单另保留私有安全候选 `8ff14441ac932b55cf1f14b1715128eaa162b1ec` 的来源核验支持；该候选尚缺可读 GitHub 源码与实际运行验收，不能用原官方两轴通过证明其通过。

检查从 Q5 的 `098229a139e98f3fb44ae3b642ead9df3fec67f6` 中接收三仓 HEAD/dirty/锁与 `verifyOfficialInput` 行为。原 Q5 的质量 runner、上游原资产回执和 CI 门禁不属于本命令的通过范围，历史绿结果不会升级为本轮通过。原日志由项目 Q5 evidence 保留。

公开 `quality:ci` 的候选执行须显式提供 `--input <冻结输入路径>` 与 `--final-group-sha256 <原始输入字节SHA256>`。旧 `--phase input` writer 已退场，由公共 `write-hosted-group.mjs` 根据完整三仓 tuple 与实际事件生成输入。准入核输入 hash、完整历史、角色唯一、路径不碰撞、事件 SHA，以及 Manage `verifyOfficialSource` 的固定 Core 来源。`quality:ci --phase verify-input` 返回同一只读 source-only 回执，不能替代 SDK 或实际质量验收。本地和 CI 都使用实际组输入，而非修改旧组登记。
