# 必需检查与受影响测试

本轮按用户授权移除 GitHub 的全量测试执行。普通 PR、main push 和手动兼容检查均使用必需检查与受影响集合，不另建定时全量任务。本地完整测试命令保留为显式工具，本轮不执行本地全量构建。

## 输入与选择

各仓 `scripts/ci-test-policy.json` 持有必跑文件、可选测试池和动态消费规则。Workbench 的 `scripts/ci-test-plan.mjs` 负责共享选择，公共 quality CLI 在 SDK 准备前调用它。

- 先由现有 reader 核冻结三仓、实际事件、Core、包身份、原锁和源码。测试选择不能授予运行权限。
- PR 使用实际 base SHA，push 使用 before SHA。手动运行沿已提交的 own baseline；完整基线必须可从本 checkout 查询。其他仓与本仓当前已提交的 peer baseline 比较，联合输入的差异单独记录。
- 明确标记 exclusive 的工程配置规则使用必需合同集合，普通动态消费规则补充静态路径追踪。Workbench 不把整个 scripts 目录视为 exclusive；构建和来源校验脚本继续沿真实依赖找已有回归，动态构建入口另有具体规则。直接修改测试或其固定输入也保留消费者追踪，包括原始字节 fixture。未映射的运行源码及本仓测试 fixture 立即拒绝，不回退到全量，也不截断选中的文件。
- 业务核心按 policy 常驻，工程工具回归按实际改动选择。撤下固定集合前须闭合源码、动态入口、配置和 peer 输入的选择关系。
- 必需文件缺失、非法路径或基线不可读均拒绝。`quality-test-plan.json` 保存实际文件、改动、选择理由、策略摘要和 `fullSuite: not-run`，没有受影响集成测试不表示全量通过。
- 调用方可用 `testOwners` 登记由其他测试进程执行的辅助文件。共享选择器沿该执行关系传播依赖，将选中辅助文件归并为直接执行的 owner；`files` 与 `reasons` 只列直接执行文件，`executedBy` 在同一计划记录实际归并的辅助文件及其 owner。两端必须是明确现存的池内测试，owner 必须直接执行，自指、环或继续转交均拒绝。Manage 的归属由其 `preset-test-lanes.mjs` 单独维护，入口拒绝仍留在直接集合中的 Host helper。
- 调用方另可用 `alwaysRunScripts` 显式登记其必需检查中无条件执行的 Node 测试脚本，例如 Manage 的 `check:static` 调用 `test:knowledge` 与 `test:ci-inputs`。选择器只接受本仓 package.json 中明确的 `node --test <逐文件清单>`，拒绝通配符、动态参数、shell 串联、缺失文件和池内重复执行；沿这些实际消费者追踪源码与 fixture，并在 `alwaysRun`、`alwaysRunReasons` 单独记录。它不把 Node 文件加入 Vitest 集合，也不将声明记为执行通过；调用方原必需检查仍必须执行并阻断失败。没有消费者的测试和 fixture 继续拒绝。

## 准备与隔离

Core 下载内容与产物缓存分别保存。Workbench 的 npm/pnpm 下载缓存保留原恢复步骤；下载生产端的大小、内容与 main 分支限制由共享工具独立验证后再接入。SDK 在准备和核验成功后、产品检查前保存，后续无关测试失败不会丢掉已验证的冷准备。SDK 缓存枚举 Git 登记包的具体产物目录，包含 native JavaScript 封装和类型，不递归搜索 node_modules；每次保存为最多一分钟的可选步骤，上传失败不影响实际检查判定。恢复产物后仍核 Core、原锁、Node、平台、架构、构建脚本和完整产物清单，冻结安装仍执行。缓存改变、缺文件、额外文件或链接替换不能获得通过；缓存不持有用户 Home、登录、Session 或凭据。

GEA 仅在选中 Profile 测试时准备真实 flock、Workbench 页面构建和冻结 source Profile 输入。窗口准入合同会遍历 Core 的完整依赖树，因此它仍需要 Core Web 产物，但无需真实 Profile 和浏览器。纯静态与权限、取消合同不触发 Profile 准备。原锁所需的 GenUI/Sidebar 固定依赖仍独立准备，不能通过跳过 link 输入改变锁的消费协议。每个实际 Profile 的 Home、Session、登录、进程、窗口预算与完整复核仍独立保留。

Workbench 和 Manage 使用同一选择记录。Manage 能力入口消费同一份选中文件，普通批次排除能力文件；完整独立能力验收入口保留。Windows 归档与安全审计保持独立结果。

浏览器需求沿实际 import、require 和执行依赖确定，普通文本或文件后缀不触发安装。policy 的 browserFixtures 仅登记使用自有替身的明确测试文件，文件缺失、直接消费真实浏览器或 Profile 时拒绝豁免。各仓 workflow 管理浏览器下载缓存恢复；没有实际消费者时不安装浏览器。

GEA 按冻结的完整必需及受影响集合分片。单片在已准备、构建并通过检查的生产者中执行原 tests 阶段，不导出准备物；多片继续由各自 VM 接收同轮固定准备物。单片原始执行回执与多片回执由同一最终核验汇总。仅当全部 Core 都在生产者执行、选中集合已完整验明时，空 worker job 才明确记为不适用；不能豁免失败或缺失的测试。Linux 片内显式同时执行三个文件，普通入口及 macOS 默认保持两个文件；文件仍运行在独立进程中，Profile 与窗口 fixture 使用独立临时目录、Home 和随机 loopback 端口，各验证层次保留必要行为与断言，完整 Profile 仅覆盖需要真实 Host、身份、Session 或更新恢复的风险。机器回执按同一 Core/平台计划核完整选中集合，每个文件恰好执行一次；漏片、重复、片外文件、失败、取消、跳过、todo、旧输入和非终结结果均拒绝通过，空组不启动 Node 自动发现。600 秒按真实 workflow 端到端墙钟验收，包含准备、构建、检查、测试、产物传输和最终汇总，排队另记；in-gate 只证明当前门禁判定时的结果，不证明 workflow 已完成，结束后须对同一 run/attempt 用 completed 再核完整时长。功能与性能分别记录，超预算或时间未知均不能宣称十分钟达标。

## 结果与十分钟目标

质量汇总继续拒绝失败、取消、缺失和必需任务跳过。普通 source 事件按 PR/分支取消过期运行；手动冻结运行按 run ID 隔离。原失败和原输入保留。

Workbench 的最终汇总只读取任务结果，使用浅 checkout；选择基线和源码校验阶段仍保留所需完整历史。quality 与 compatibility 都归档 `quality-prepared.json`，保留该次实际构建产物摘要与源码回执绑定。

十分钟是 PR 的实测验收目标，不能用提前超时失败、截断受影响集合或未执行的全量结果代替。冷准备、缓存命中、实际测试文件与端到端时间须分别记录。CI 通过不证明正式客户端、Native、真实业务、模型或发行验收。

冻结产品来源、历史修复分支及路径白名单统一由 [CI 来源规则](../scripts/ci-source-policy.mjs) 维护。各仓保留自己的冻结 peer 快照与事件 adapter；Manage/GEA 在取得明确的 Workbench checkout 后才加载规则，联合验证使用已核 tuple 中的实际路径。普通架构改动继续走正常门禁，历史例外不扩张。
