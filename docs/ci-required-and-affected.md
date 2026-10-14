# 必需检查与受影响测试

本轮按用户授权移除 GitHub 的全量测试执行。普通 PR、main push 和手动兼容检查均使用必需检查与受影响集合，不另建定时全量任务。本地完整测试命令保留为显式工具，本轮不执行本地全量构建。

## 输入与选择

各仓 `scripts/ci-test-policy.json` 持有必跑文件、可选测试池和动态消费规则。Workbench 的 `scripts/ci-test-plan.mjs` 负责共享选择，公共 quality CLI 在 SDK 准备前调用它。

- 先由现有 reader 核冻结三仓、实际事件、Core、包身份、原锁和源码。测试选择不能授予运行权限。
- PR 使用实际 base SHA，push 使用 before SHA。手动运行沿已提交的 own baseline；完整基线必须可从本 checkout 查询。其他仓与本仓当前已提交的 peer baseline 比较，联合输入的差异单独记录。
- 明确标记 exclusive 的工程配置规则使用必需合同集合，普通动态消费规则补充静态路径追踪。其余改动沿 authored import 和固定文件引用找测试。未映射的运行源码立即拒绝，不回退到全量，也不截断选中的文件。
- 必需文件缺失、非法路径或基线不可读均拒绝。`quality-test-plan.json` 保存实际文件、改动、选择理由、策略摘要和 `fullSuite: not-run`，没有受影响集成测试不表示全量通过。

## 准备与隔离

Core 下载内容与产物缓存分别保存。下载缓存只恢复；SDK 缓存只枚举 Git 登记包的具体产物目录，不递归搜索 node_modules；保存为最多一分钟的可选步骤，上传失败不影响实际检查判定。恢复产物后仍核 Core、原锁、Node、平台、架构、构建脚本和完整产物清单，冻结安装仍执行。缓存改变、缺文件、额外文件或链接替换不能获得通过；缓存不持有用户 Home、登录、Session 或凭据。

GEA 仅在选中 Profile 测试时准备真实 flock、Workbench 页面构建和冻结 source Profile 输入。窗口准入合同会遍历 Core 的完整依赖树，因此它仍需要 Core Web 产物，但无需真实 Profile 和浏览器。纯静态与权限、取消合同不触发 Profile 准备。原锁所需的 GenUI/Sidebar 固定依赖仍独立准备，不能通过跳过 link 输入改变锁的消费协议。每个实际 Profile 的 Home、Session、登录、进程、窗口预算与完整复核仍独立保留。

Workbench 和 Manage 使用同一选择记录。Manage 的固定资源能力与 Windows 归档合同、安全审计保持独立结果。浏览器只为选中的浏览器集合准备。

GEA 的选中测试最多同时执行两个文件；文件运行在独立进程中，Profile 与窗口 fixture 使用独立临时目录、Home 和随机 loopback 端口。每个文件内部的用例顺序与断言保持原样，避免一次启动过多真实 Profile。

## 结果与十分钟目标

质量汇总继续拒绝失败、取消、缺失和必需任务跳过。普通 source 事件按 PR/分支取消过期运行；手动冻结运行按 run ID 隔离。原失败和原输入保留。

十分钟是 PR 的实测验收目标，不能用提前超时失败、截断受影响集合或未执行的全量结果代替。冷准备、缓存命中、实际测试文件与端到端时间须分别记录。CI 通过不证明正式客户端、Native、真实业务、模型或发行验收。
