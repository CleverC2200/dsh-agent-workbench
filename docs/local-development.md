# 本地准备与检查

实际工具链版本读取 package.json 的 packageManager；依赖采用本仓 package-lock.json。先核本票固定三仓和官方 SDK，再在自己的工作树按锁安装，node_modules/lib 不跨工作树共享。官方 SDK 可只读引用。固定官方提交与材料要求由 [verify-official-input.mjs](../scripts/verify-official-input.mjs) 核验；类型映射查 [tsconfig.official.json](../tsconfig.official.json)。当前只支持登记的官方输入，本地 SDK 配置不构成发行依赖或发行授权。

普通开发使用 [质量门禁](../QUALITY.md) 的 `npm run quality:fast`，允许未提交修改；全量 audit 保留旧债的真实红结果。`npm run quality:ci` 只用于冻结候选和 CI，接票01输入检查与 Manage 的公共 SDK 准备入口。

```sh
npm ci --ignore-scripts --prefer-offline
npm run check:knowledge
npm run check:knowledge -- --compare-ref <本票基线SHA>
npm run typecheck:official
```

`check:knowledge` 读取 [agent-knowledge.json](../agent-knowledge.json)，核活跃本地链接、已声明路径、文档中 npm/pnpm 脚本与 Node 脚本。历史引用只核存在，不递归旧命令。`quality:fast` 首先对本 checkout 执行此检查，使用当前跟踪的真实导出目标；`quality:ci` 在 `build:core` 后再次核构建产物。`exports:true` 要求导出目标已存在，缺目标会失败，不生成假产物。`--compare-ref` 使用当前目标仓库的 TypeScript，核已修改 TS/TSX 的去注释 AST、公共导出、声明输出和法律/工具指令。该模式用于纯注释改动，真实逻辑变化会失败。

候选冻结后按 [candidate:verify](candidate-input.md) 核干净三仓。默认 CI 固定兼容组与显式最终组的 `--final-group-sha256`、只读 `--phase verify-input` 见该合同；source-only 不证明 SDK、质量、兼容或业务授权。普通增量引用或行为测试不要求干净工作树；不要为通过候选输入检查清除自己的在途改动。

运行含 HTML/浏览器的 Node harness 前，在本仓原锁安装下准备 Chromium（`npm exec -- playwright install chromium`），并让准备与测试共用 `PLAYWRIGHT_BROWSERS_PATH`。普通纯 Node 定向行为测试可直接执行：

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
