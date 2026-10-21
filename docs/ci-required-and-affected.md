# 必需检查与受影响测试

PR 与 main push 由 `.github/workflows/source-quality.yml` 按实际 Git 差异选择检查。纯说明文档只完成适用性判断与必需状态汇总；包内 Prompt、Skill、资源声明及其资产走资源检查；代码与未知输入保留工程检查。`candidate-quality` 拒绝失败、取消、缺失或非预期跳过的适用检查。冷分类与资源检查只需本仓；代码检查核固定 peer 后复用共享 `sourceChecks` 计划，按适用需求准备材料和运行检查。

`scripts/source-quality.mjs --phase plan|check|final` 是冷目录入口，不要求安装依赖。`plan` 从事件文件读取 PR 的 base/head 或 push 的 before/after，校验检出 HEAD，PR 按 merge-base 比较，push 按实际推送区间比较。未提供差异范围时保守选择代码检查；已提供的基线无法解析或 HEAD 不符时拒绝继续。输出 `mode=docs|resources|code` 与 `engineering`、`dependency-review`、`codeql`，供 workflow 选择适用 job；`final` 重算分类并核实际结果，不修改分支保护。

资源检查覆盖变更资源组的 JSON、JS/Python 语法、Skill 元数据、相对文件引用与声明的打包字节摘要。Skill 删除或改名时同时核包内 Prompt/能力声明的 Skill 引用。资源组中的依赖清单和锁仍按代码处理。Markdown 双空格换行不再参与差分空白阻断。CodeQL 开关独立于资源分类；已有 CodeQL 的仓在资源中新增、修改或删除 JavaScript/TypeScript 源码时仍需执行现有扫描。Python 资源执行语法检查，现有 CodeQL 语言配置不覆盖 Python。工程检查的具体集合由 workflow 维护。

日常代码路径通过 `affected-plan|affected-prepare|affected-check` 消费同一计划。非联合路径执行适用的知识、lint、format、类型和选中测试；需要联合消费者时进入既有联合 quality 入口。显式冻结三仓入口仍由 `.github/workflows/quality.yml` 的手动 `workflow_dispatch` 提供，alpha compatibility 保持独立。日常绿灯只证明实际选择和执行的范围，不能表示客户端或业务验收通过。

本地未提交修改使用[开发构建入口](../../dsh-gea-plugin/docs/development-builds.md)的轻预检与影响计划。源码 CI 使用提交差异；本地计划明确标识当前工作树，两者不互作冻结执行回执。

下文描述选择和联合执行合同；实际检查与准备需求以本次计划及回执为准。

本轮按用户授权移除 GitHub 的全量测试执行。手动三仓与兼容检查使用必需检查与受影响集合，不另建定时全量任务。本地完整测试命令保留为显式工具，本轮不执行本地全量构建。

## 输入与选择

各仓 `scripts/ci-test-policy.json` 持有必跑文件、可选测试池和动态消费规则。Workbench 的 `scripts/ci-test-plan.mjs` 负责共享选择，公共 quality CLI 在 SDK 准备前调用它。

- 先由现有 reader 核冻结三仓、实际事件、Core、包身份、原锁和源码。测试选择不能授予运行权限。
- 同一选择器返回 `applicability: docs | source`。仅当三仓合并差分非空、全部属于根导航文档或 `docs/` Markdown，且运行源码和测试没有实际导入、读取或执行消费时，才适用 docs。Prompt、Skill、预设、业务资源、未知文件及空差分均走 source。被真实消费者读取的 README 仍走 source。
- docs 的测试文件集合为空，仍执行实际源码准入、知识引用及适用的文本检查；省去 SDK、消费者依赖、页面构建和浏览器准备。前置 scope 用相同 reader 与选择器观察源码，后续执行重算相同计划，不能用旧计划代替当前准入。
- PR 使用实际 base SHA，push 使用 before SHA。手动运行沿已提交的 own baseline；完整基线必须可从本 checkout 查询。其他仓与本仓 diffBase 中已提交的 peer baseline 比较，捕捉本票更新 peer baseline 带入的改动；历史 baseline 不可读时拒绝。实际候选准入仍绑定 HEAD 的 peer baseline 或显式联合输入。
- 明确标记 exclusive 的工程配置规则使用必需合同集合，普通动态消费规则补充静态路径追踪。Workbench 的 scripts 规则不排除真实消费者；修改测试及固定原始字节 fixture 也继续追踪消费者。未映射的运行源码或本仓测试 fixture 立即拒绝，不回退到全量，也不截断选中的文件。
- 业务核心按 policy 常驻，工程工具回归按实际改动选择。撤下固定集合前须闭合源码、动态入口、配置和 peer 输入的选择关系。
- 必需文件缺失、非法路径或基线不可读均拒绝。`quality-test-plan.json` 保存实际文件、改动、选择理由、策略摘要和 `fullSuite: not-run`，没有受影响集成测试不表示全量通过。
- 调用方可用 `testOwners` 登记由其他测试进程执行的辅助文件。共享选择器沿该执行关系传播依赖，将选中辅助文件归并为直接执行的 owner；`files` 与 `reasons` 只列直接执行文件，`executedBy` 在同一计划记录实际归并的辅助文件及其 owner。两端必须是明确现存的池内测试，owner 必须直接执行，自指、环或继续转交均拒绝。Manage 的归属由其 `preset-test-lanes.mjs` 单独维护，入口拒绝仍留在直接集合中的 Host helper。
- Node、Vitest 与 CommonJS 文件统一进入各仓现有测试池，调用方按实际 runner 分组执行同一计划。desktop 测试沿相同消费关系与 owner 归并，不另声明一套常驻工程测试协议。

Workbench 的日常 lint/format 通过已有 CLI 的 `--changed` 检查本票差分、未提交修改及新增维护文件。Git ignore 不能隐藏新增代码。包、锁、工具配置或质量脚本变更会扩大到全部维护文件，显式 audit 仍检查全部旧债。普通 source 常驻官方入口与恢复行为，工程反例按相应脚本、配置、fixture 和真实消费关系选择；完整手动测试入口保留。

## 准备与隔离

Core 下载内容与产物缓存分别保存。Workbench 的下载缓存保留恢复入口；缓存生产者须另有实际回执，不能仅由 restore 宣称已变热。SDK 核验成功后在产品检查前保存，后续无关测试失败仍可复用该次已验证准备。SDK 缓存枚举 Git 登记包的具体产物目录，包含 native JavaScript 封装和类型，不递归搜索 node_modules；保存为最多一分钟的可选步骤，上传失败不影响实际检查判定。恢复产物后仍核 Core、原锁、Node、平台、架构、构建脚本和完整产物清单，冻结安装仍执行。缓存改变、缺文件、额外文件或链接替换不能获得通过；缓存不持有用户 Home、登录、Session 或凭据。

Workbench 的 `build` 需求来自选中测试对本仓 lib 或生成 HTML 的实际消费。无需这些产物时保留官方 noEmit 类型检查，省去页面构建及无关 APS 安装；需要产物时由同次声明构建完成类型分析，构建前仍核 stamp 一致及固定官方输入。基础检查失败后不进入构建。构建后的知识检查只核导出目标，源知识引用在此前检查。FC 依赖仅供实际 FC 测试或 storage 构建使用，不因其他 business 路径改动安装。需要页面产物时当前仍采用原 build:core 装配范围，尚未拆成逐页面构建。

相邻 SQL 配置的动态页面和计算消费者由既有 policy 明确登记。直连执行器的原 Python 单测归属 `tests/agent-sql-direct.test.mjs`，按 `scripts/requirements-sql.txt` 通过 uv 运行；只有该 owner 入选时 workflow 准备 uv，普通 Node 检查不增加 Python 阶段。配置生成器的实际重新生成仍是显式操作，CI 不运行该写入口。

GEA 仅在选中 Profile 测试时准备真实 flock、Workbench 页面构建和冻结 source Profile 输入。窗口准入合同会遍历 Core 的完整依赖树，因此它仍需要 Core Web 产物，但无需真实 Profile 和浏览器。纯静态与权限、取消合同不触发 Profile 准备。原锁所需的 GenUI/Sidebar 固定依赖仍独立准备，不能通过跳过 link 输入改变锁的消费协议。每个实际 Profile 的 Home、Session、登录、进程、窗口预算与完整复核仍独立保留。

Workbench 和 Manage 使用同一选择记录。Manage 能力入口消费同一份选中文件，普通批次排除能力文件；完整独立能力验收入口保留。Windows 归档与安全审计保持独立结果。

浏览器需求沿实际 import、require 和执行依赖确定，普通文本或文件后缀不触发安装。policy 的 browserFixtures 仅登记使用自有替身的明确测试文件，文件缺失、直接消费真实浏览器或 Profile 时拒绝豁免。没有浏览器消费者时不恢复浏览器缓存。

GEA 按冻结的完整必需及受影响集合分片。单片在已准备、构建并通过检查的生产者中执行原 tests 阶段，不导出准备物；多片继续由各自 VM 接收同轮固定准备物。单片原始执行回执与多片回执由同一最终核验汇总。仅当全部 Core 都在生产者执行、选中集合已完整验明时，空 worker job 才明确记为不适用；不能豁免失败或缺失的测试。Linux 片内显式同时执行三个文件，普通入口及 macOS 默认保持两个文件；文件仍运行在独立进程中，Profile 与窗口 fixture 使用独立临时目录、Home 和随机 loopback 端口，各验证层次保留必要行为与断言，完整 Profile 仅覆盖需要真实 Host、身份、Session 或更新恢复的风险。机器回执按同一 Core/平台计划核完整选中集合，每个文件恰好执行一次；漏片、重复、片外文件、失败、取消、跳过、todo、旧输入和非终结结果均拒绝通过，空组不启动 Node 自动发现。600 秒按真实 workflow 端到端墙钟验收，包含准备、构建、检查、测试、产物传输和最终汇总，排队另记；in-gate 只证明当前门禁判定时的结果，不证明 workflow 已完成，结束后须对同一 run/attempt 用 completed 再核完整时长。功能与性能分别记录，超预算或时间未知均不能宣称十分钟达标。

## 结果与十分钟目标

质量汇总继续拒绝失败、取消、缺失和必需任务跳过。普通 source 事件按 PR/分支取消过期运行；手动冻结运行按 run ID 隔离。原失败和原输入保留。

Workbench 的 dependency review 仅适用于同一计划中本仓 package manifest 或 npm 锁发生变化的 PR，沿 Manage 已有 action 检查 high 及以上依赖风险。最终汇总在适用时要求真实成功；无关源码与文档记为不适用。该轻量检查不代替其他仓已有安全检查，也不证明安装或发行完成。

十分钟是 PR 的实测验收目标，不能用提前超时失败、截断受影响集合或未执行的全量结果代替。冷准备、缓存命中、实际测试文件与端到端时间须分别记录。CI 通过不证明正式客户端、Native、真实业务、模型或发行验收。

历史业务修复的固定源码与分支分派已封存，Git 保留原授权、输入和失败记录。当前事件由各仓已有 peer 快照及事件 reader 绑定，统一进入普通质量检查与当前选择计划。
