# Workbench 质量门禁

固定工具为 Node 24、npm 11.11.0、Oxlint 1.87.0、Oxfmt 0.72.0。依赖采用本仓 npm 锁；FC 业务 leaf 采用自身 pnpm 11.27.0 和原锁。每个工作树独立安装，不共享 node_modules/lib。

```sh
npm ci --ignore-scripts --prefer-offline --no-audit --no-fund
npm run quality:fast
npm run lint:audit
npm run format:audit
npm run test:quality
```

`quality:fast` 串行运行 lint、format:check、typecheck:official 和公开 CLI 反例，可检查未提交修改。原 Node、浏览器、类型和构建命令保留。全量 audit 包含旧债，返回真实非零；增量通过不表示全仓没有债务。

旧债仅在文件字节匹配固定 Git 提交 `9814b3bcf1ae015a63fac9af864c165617791fc3` 的 blob 时豁免。Q1 原始 policy 对象 `b42c62e72310d31a088b7394a964492efc1f217a:scripts/quality.mjs` 的 SHA-256、原配置 hash 和已安装工具版本必须一致；缺对象、改基线、弱化配置、工具错误都拒绝。没有更新基线的命令。新文件或修改后的旧债必须通过真实工具。

维护范围是 src、scripts、tests、business、static、samples、theme 与 workflow。JS/TS 由 Oxlint correctness 检查；Oxfmt 另检查 CSS、HTML、JSON/JSONC/YAML。根配置参与格式检查，根 npm 锁由 npm 验证。显式参数只接受维护范围内存在的支持文件，目录、失效路径和排除资源拒绝。根/嵌套 ignore 与嵌套工具配置不能弱化规则。

排除独立依赖/构建输出 node_modules、dist、根 lib、.runtime/.scratch；原样 `static/{category,mps}/source/{vendor.js,vendor.css,data.js}` 仍由既有 SOURCE.json/hash 校验负责，生成的 `static/{category,mps,regional}/index.html` 检查 authored 源。`static/regional/prompt.json` 是运行时 Prompt 资源，保留原字节，独立于代码 formatter；Skill/历史 Markdown 也不作代码格式迁移。

Oxlint 此版本没有 HTML 内联 JS 语义 parser。Oxfmt 检查 HTML/嵌入脚本格式，原 html-author 构建与 HTML/浏览器行为测试保留；这些能力不能称为 HTML lint 全覆盖。

候选冻结后才运行 CI admission：

```sh
npm run quality:ci -- --input /absolute/job-root/candidate-input.json
```

该入口检查实际事件 SHA（CI 必填）、完整历史、三仓 clean/HEAD/锁，调用登记 Manage 的唯一 `scripts/prepare-official-sdk.mjs` 验证固定 Core，消费票01 candidate:verify，再按锁安装、执行同一 quality:fast 和完整 Node 测试。`--browser` 加原浏览器测试；`--prepare-browser` 明确准备 Chromium。SDK 首次准备使用 `--prepare-sdk --core-source <official Git URL or read-only Git checkout>`，只创建 job-root/official-latest-standard；已有共享 SDK 不授予写权限。

hosted workflow 使用实际 PR head/push SHA、full history、contents:read 和不持久化凭据。Manage/GEA 是脚本与 workflow 中的固定 peer 提交；私有 checkout 要求已配置的 contents-read `PLUGIN_SPLIT_READ_TOKEN`，不创建凭据、不写远端。fork scope 在 peer/SDK 准备前拒绝。最终 aggregate 仅接受 scope 和 gates 均 success，failure/skip/cancel/缺输入不会通过。

本地 workflow/CLI 验证不证明远端提交可达、token/runner 可用或远端 required-check 已生效；这些由后续远端票验收。SDK、Node、浏览器离线检查不证明 Native、模型、业务或发行验收。Manage 的真实 dependency audit 红结果和 CodeQL 服务配置缺口仍独立保留。
