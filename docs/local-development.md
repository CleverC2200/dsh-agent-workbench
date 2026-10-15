# 本地准备与检查

实际工具链版本读取 package.json 的 packageManager；依赖采用本仓 package-lock.json。先核本票固定三仓和官方 SDK，再在自己的工作树按锁安装，node_modules/lib 不跨工作树共享。官方 SDK 可只读引用。固定官方提交与材料要求由 [verify-official-input.mjs](../scripts/verify-official-input.mjs) 核验；类型映射查 [tsconfig.official.json](../tsconfig.official.json)。当前只支持登记的官方输入，本地 SDK 配置不构成发行依赖或发行授权。

创建后续任务的自有工作树时，使用该任务冻结提交中的 [Codex 原生环境](../.codex/environments/environment.toml)。setup 只检查已安装工具；在 Actions 中先运行工具检查，再按任务需要运行准备依赖和定向检查。配置中的完整质量验收需另行满足冻结输入，不随创建工作树或准备依赖自动执行。

准备依赖前，按本票输入将固定 Core SDK 放在 package 与类型配置声明的相对路径，并提供同级 GEA 的登记支持清单。可以只读引用既有已准备 SDK 与 GEA；SDK 验证失败时，交由该输入的 owner 在自有 checkout 准备后再继续。原生 Action 只在当前工作树冻结安装，不准备 Core、相邻仓或内嵌业务依赖。已有任务继续使用自己的冻结输入。

类型检查 Action 使用 `typecheck:official`，核心构建使用同一份 `tsconfig.official.json`。完整质量 Action 需在其执行环境中设置 `DSH_QUALITY_INPUT` 为本票冻结组 JSON 的绝对路径，并设置 `DSH_QUALITY_INPUT_SHA256` 为该文件原始字节的 SHA256。它将两项输入显式传入现有 `quality:ci`，同时运行 browser 阶段；所需 Core、三仓及浏览器输入仍须按本票准备，缺少输入时拒绝执行，不借用历史登记。

日常综合门禁与冻结 CI 入口见 [质量门禁](../QUALITY.md)。

```sh
npm ci --ignore-scripts --prefer-offline
npm run check:knowledge
npm run check:knowledge -- --compare-ref <本票基线SHA>
npm run typecheck:official
```

`check:knowledge` 读取 [agent-knowledge.json](../agent-knowledge.json)，核活跃本地链接、已声明路径、文档中 npm/pnpm 脚本与 Node 脚本。历史引用只核存在，不递归旧命令。`exports:true` 要求导出目标已存在，它不生成假产物。`--compare-ref` 使用当前目标仓库的 TypeScript，核已修改 TS/TSX 的去注释 AST、公共导出、声明输出和法律/工具指令。该模式用于纯注释改动，真实逻辑变化会失败。

候选冻结后按 [candidate:verify](candidate-input.md) 核干净三仓。普通增量引用或行为测试不要求干净工作树；不要为通过候选输入检查清除自己的在途改动。

定向行为测试可使用 Node 直接执行：

```sh
node --test tests/official-entry.test.mjs tests/workbench-recovery.test.mjs tests/workbench-original.test.mjs tests/payload-focus-metadata.test.mjs
```

官方 Core 支持范围、固定提交和 SDK 约束由同组 GEA [支持清单](../../dsh-gea-plugin/scripts/supported-cores.json) 与本仓 [官方输入检查](../scripts/verify-official-input.mjs) 维护；两版均要求登记提交和 tracked source clean。实际声明来源读取 `tsconfig.official.json` 的 paths，类型检查与运行接收分别按本票输入留证。静态页面引用的双版草稿发布规则见 [页面桥](page-interaction.md)。

构建调用 package.json 的 `build:core` 或 `build`。具体装配顺序由 [build.mjs](../scripts/build.mjs) 维护。`build:core` 仅跳过 FC/AQKC 的独立构建，其余已接收页面仍参与，不能把它当成纯壳或单一样板构建；两种构建均需本票登记的相邻 Manage 资源及各参与作者源的固定依赖。构建写本仓 lib，应由当前工作树单独串行执行。构建先显式核固定官方 Core，声明编译统一使用 `tsconfig.official.json`，避免本地 file 依赖复制出的 SDK 类型和宿主公开声明分离。

共享开发 CLI 位于 [check-agent-knowledge.mjs](../scripts/check-agent-knowledge.mjs)。Manage/GEA 传自己的 `--root` 和 `--config`，不会复制一份同义规则。配置字段是 entries、paths、scripts、exports、peers、history 与可选 commandRoots。peers 为允许引用的外部 checkout 根；其链接只核存在，不递归把 peer 命令当本仓命令。history 为本仓历史文件或目录。commandRoots 按本仓文档相对路径登记允许使用的外部命令根，并读取其真实 package.json scripts；未登记命令拒绝。npm/pnpm 的 run 与紧凑脚本写法均检查，install/exec 等包管理器内置动作保留自身语义。此检查不运行文档中的命令、不安装依赖、不访问业务，也不判断全部自然语言真伪。

浏览器、Native、真实业务/模型和发布验证按原票范围及有效窗口办理。离线检查不证明这些阶段已完成。

资源目录的原 `description` 由 Manage 唯一维护。Workbench 在提示词与 Skill 列表显示它；Skill 入口使用 Manage 当前官方标准组合。选择资源沿官方 Session、工作区与 InputHub 插入 Skill 草稿，已有草稿拒绝覆盖。

## rc.2 定向检查输入

[候选输入检查源码](../tests/candidate-input.test.mjs) 的 rc.2 分支默认读取同组 `../../official-0.2.0-rc.2`；checkout 布局不同则用 `DSH_RC2_CORE_CHECKOUT` 显式指定已登记的官方源码绝对路径。检查要求与支持清单匹配的 rc.2 固定提交，不会把 alpha 输入作为 rc.2 通过。

需要快速核对本票源码时，运行 `node scripts/task-status.mjs --input <本票integration-set.json绝对路径>`。命令只读显式输入和登记 checkout，输出来源文件摘要、实际 HEAD、与输入是否一致、tracked/untracked 改动和观察时间；失败的 checkout 保留错误，其余仓继续观察。它不修改输入、安装依赖或证明候选准入、装载及业务授权，冻结验证仍使用原 `candidate:verify` 合同。

## 恢复开发前检查当前执行记录

在恢复派工、构建或写远端前，显式运行同一只读 CLI 的恢复模式：

```sh
node scripts/task-status.mjs --input <本票三仓输入JSON绝对路径> --check-resume --owner <当前执行者标识>
```

`--input` 继续使用包含三仓 `repo`、绝对 `path` 和完整 `head` 的本票输入。恢复模式额外要求输入内有 `task` 标识和 `execution` 文件指针，例如 `"execution": "./execution.json"`。该指针相对输入文件解析；不要另复制一份旧执行快照充当当前记录。未传 `--check-resume` 时仍只观察源码，dirty/HEAD 不同继续正常输出，也不读取执行记录或联网。

当前 owner 在本票专属输出中维护一份小型 execution 记录。它投影已有的人类授权与交接，不是新的授权依据；来源路径和预期原始字节摘要记录投影所依据的版本，CLI 不判断授权内容的真实性或范围。不能用 owner 自报替换当前记录，也不能用本工具替代已有业务交付检查。

```json
{
  "task": "本票标识，与输入相同",
  "owner": "当前执行者标识",
  "state": "in-progress",
  "inputSha256": "本票输入原始字节的64位SHA256",
  "authorization": {
    "path": "./human-authorization.md",
    "sha256": "依据版本原始字节的64位SHA256"
  },
  "handoff": {
    "path": "./handoff.md",
    "sha256": "交接版本原始字节的64位SHA256"
  },
  "stopMarkers": ["./STOP", "./HANDED_OFF"],
  "pullRequests": []
}
```

记录内的文件指针相对 execution 文件解析。`authorization`、`handoff` 各自以 `{path, sha256}` 绑定已有来源版本，不由检查命令生成。每次调用均要求当前原始字节与预先登记的 SHA256 相同；来源在调用前已变而 execution 未更新也会拒绝。摘要相同仅表示版本一致，不验证人类语义，也不授予权限。由当前 owner 按有效授权与交接维护投影，CLI 不会自动刷新摘要。

`stopMarkers` 必须显式列出本票停止/交接标记，任何一个存在都拒绝。只有当前 owner 相同且 `state` 为 `in-progress` 才能通过；已转交、暂停、完成、缺失或未知状态均拒绝。输入原始字节 SHA256 变化后，由 owner 依据有效任务输入更新投影，检查命令不会自动重绑。

`pullRequests` 必须显式提供数组，建 PR 前可为空。空数组只表示本票没有登记 PR，不说明仓库不存在其他 PR。有登记时每项为：

```json
{
  "repo": "dsh-agent-workbench",
  "repository": "CleverC2200/dsh-agent-workbench",
  "number": 123,
  "head": "与本票对应仓head相同的40位SHA",
  "base": "登记PR预期base的40位SHA",
  "headRef": "本票分支名",
  "baseRef": "main"
}
```

CLI 核三仓实际包名、完整 HEAD 和 tracked/untracked dirty；对每个登记 PR 仅调用 `gh api --method GET`，逐项核实时 PR 编号、open 状态、head/base SHA、分支和目标仓。它不 fetch、不更新远端、不派发或重跑 CI。缺少 `gh`、查询失败、返回缺字段或漂移都拒绝。查询结束后重新观察三仓源码；执行期间发生的 input、execution、依据或 handoff 字节变化，以及查询结束前新出现的停止标记也会拒绝。

退出码 0 表示本次观察通过，非 0 表示拒绝或输入/查询未知。JSON 含观察时间、输入和执行记录摘要、逐仓结果、PR 结果及拒绝原因。PR 实时回执只保留编号、状态、head/base 的 SHA、分支和仓库名，不携带 PR 正文、用户资料或整份仓库对象。该检查不创建锁，也不会自动拦截 Codex。通过只描述本次观察；后续写入仍须遵守既有授权、交接与原写入口的 expected-head 校验，不能把旧回执当作未来写入许可。
