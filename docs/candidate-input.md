# 候选输入检查

Workbench 持有三仓候选检查 CLI。它读取调用者指定的冻结输入，检查登记目标、三仓提交、dirty、提交内的锁和固定官方 Core SDK。它不安装依赖、不构建、不更新登记、不启动 Host/客户端或访问业务。

```sh
npm run candidate:verify -- --input /absolute/path/integration-set.json --checkout "$PWD"
```

输入沿用项目 `integration-set.json` 的 `core` 与 `repositories`。每个 repository 含 `repo`、绝对 `path`、完整 `head`；必须登记 Workbench、Manage、GEA 各一个。命令拒绝未登记的历史 checkout。实现者独立 checkout 需由该票冻结输入明确登记其路径和提交，不得改共享输入来掩盖失败，也不能把其他任务的集成目录当自己的可写工作树。

结果只有 `stage=candidate-input`、`status=passed` 与 `runtime=not-observed`。输出提供观察时间、Core 和各仓实际路径/HEAD。它不证明工具链已安装、类型/质量/测试通过、产物装配、当前选择、Native 装载或发布。

最低输入是 Node、Git、冻结输入文件、三个干净 Git checkout、各仓已提交的 package.json 和锁、Workbench 的 tsconfig.official.json，以及该配置声明的官方 SDK。官方 Core 固定在原输入检查的基线，调用者不能覆盖。SDK 可只读引用；node_modules 和 lib 不能跨工作树共享。

检查从 Q5 的 `098229a139e98f3fb44ae3b642ead9df3fec67f6` 中接收三仓 HEAD/dirty/锁与 `verifyOfficialInput` 行为。原 Q5 的质量 runner、上游原资产回执和 CI 门禁不属于本命令的通过范围，历史绿结果不会升级为本轮通过。原日志由项目 Q5 evidence 保留。

## 显式最终组输入

默认 CI 与生成输入的命令保留原固定 peer cuts。最终组在人工冻结原输入文件后，显式传其原字节 SHA-256；这只声明待核源码，不创造兼容性、业务授权或远端发布权限，也不更新任何 peer SHA。

```sh
npm run quality:ci -- --phase verify-input --input /absolute/frozen-group.json --final-group-sha256 <原文件SHA256>
```

此只读 phase 与实际 quality 使用同一 [reader](../scripts/candidate-input.mjs)。输出 stage=candidate-source-only，核实际唯一三仓路径、package 身份、HEAD、干净/full history、提交内锁、固定 Core Git/原锁/工具链，以及 CI 实际事件 SHA。未知参数、缺值、错字节 hash、重复/未知仓、realpath 冲突、错 HEAD/Core、dirty/缺材料均拒绝，未安装或准备。输出仍明确 SDK/quality/compatibility/runtime 未验；不授予业务权限。

源码 admission 不要求 SDK outputs。固定 Core Git 必须可读；当新的私有 SDK checkout 尚未存在时，可用 --core-source 指定已有本地固定 Git source（可以没有任何 SDK outputs）。只有 URL 且没有可核 Git 时不构成实际 Core proof，先取得固定源码；默认 compat 的 URL cold preparation 协议保持。

真正完整门禁仍用同一 quality:ci，省略 --phase verify-input，保留 --input 和 --final-group-sha256；适用的 --prepare-sdk/--prepare-history 等原参数按原用途提供。原文件在每次准备/命令效果前须保持原字节，变更即失败；不能用已验 hash继续处理新内容。准备后完整 candidate:verify 仍核 SDK，显式最终组还核实际 Workbench exports/活跃引用，随后运行原质量/构建/测试。直接完整候选检查可给 candidate:verify 同样的 --final-group-sha256；缺 SDK 仍拒绝，不以 source-only通过替代它。

Workbench 持有共享源码 reader，Manage 显式模式从相邻 Workbench 当前接口加载；默认固定旧 peer 不要求此新 export。SDK source核验复用 Manage 唯一 owner 的 verifyOfficialSource。文件 hash只绑定本次字节，不证明这些源码已兼容、构建、装载或业务授权；这些阶段各需实际回执。
