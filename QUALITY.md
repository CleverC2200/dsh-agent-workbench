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

旧债仅在文件字节匹配固定 Git 提交 `9814b3bcf1ae015a63fac9af864c165617791fc3` 的 blob 时豁免。Q1 原始 policy `b42c62e72310d31a088b7394a964492efc1f217a:scripts/quality.mjs` 以固定原字节 fixture 读取；其 SHA-256、原配置 hash 和已安装工具版本必须一致。缺固定输入、改基线、弱化配置、工具错误都拒绝。没有更新基线的命令。新文件或修改后的旧债必须通过真实工具。

维护范围是 src、scripts、tests、business、static、samples、theme 与 workflow。JS/TS 由 Oxlint correctness 检查；Oxfmt 另检查 CSS、HTML、JSON/JSONC/YAML。根配置参与格式检查，根 npm 锁由 npm 验证。显式参数只接受维护范围内存在的支持文件，目录、失效路径和排除资源拒绝。根/嵌套 ignore 与嵌套工具配置不能弱化规则。

排除独立依赖/构建输出 node_modules、dist、根 lib、.runtime/.scratch；原样 `static/{category,mps}/source/{vendor.js,vendor.css,data.js}` 仍由既有 SOURCE.json/hash 校验负责，生成的 `static/{category,mps,regional}/index.html` 检查 authored 源。`static/regional/prompt.json` 是运行时 Prompt 资源，保留原字节，独立于代码 formatter；Skill/历史 Markdown 也不作代码格式迁移。

Oxlint 此版本没有 HTML 内联 JS 语义 parser。Oxfmt 检查 HTML/嵌入脚本格式，原 html-author 构建与 HTML/浏览器行为测试保留；这些能力不能称为 HTML lint 全覆盖。

原迁移 golden 测试保留固定 Dealer `67e1007aa400a8a9c65c132f144dabd5168a49df` 和 Personal `15def488134527647a819812a4b6657ecf9772fe`。二者不在本仓历史中，使用显式 `WORKBENCH_DEALER_HISTORY_ROOT` / `WORKBENCH_PERSONAL_HISTORY_ROOT` Git 根，仅 `git show` 原对象，不运行旧插件或恢复 adapter。Personal 的四个输入与票26原 snapshot 字节一致，原 snapshot 保留。

Node 全测并发2，浏览器全测并发1，原测试 scope 和超时预算保持。fixture 只在原公开边界提供 Core inputActions、离线固定业务输入与查询响应；实际 Core JSONL writer 锁断言仍须真实平台 flock addon，不能以 mock 或正常退出代替。

开发 `build:core` / `build` 需要完整 Git 历史。静态作者固定数据仍保留 SOURCE.json 原 hash，读取固定 `9b4863692cb29a3edc8a2358e98feb7846526d1b` 原 initializer 核原字节，再对当前 AST 的节点、literal、运算符与顺序作严格对照；唯一审查过的固定数据别名是 category 的 w8→_w8。数字、键、顺序、字符串或运算符变化、原 metadata 漂移、缺历史均拒绝。这是开发构建校验，Git 历史不会执行为旧 adapter；npm 包原 files 范围只交付产物，普通包消费者不运行此开发脚本，也不需要 Git。

本地 workflow/CLI 验证不证明远端提交可达、token/runner 可用或远端 required-check 已生效；这些由后续远端票验收。SDK、Node、浏览器离线检查不证明 Native、模型、业务或发行验收。Manage 的真实 dependency audit 红结果和 CodeQL 服务配置缺口仍独立保留。

Browser 检查使用本仓锁定的 Playwright Chromium。已有浏览器缓存通过 `PLAYWRIGHT_BROWSERS_PATH` 显式指定。可显式指定独立目录，不能把系统 Chrome 当作已准备输入。直接运行 Node 中的 HTML harness 或 `test:browser` 前，先在同一环境执行 `npm exec -- playwright install chromium`。

固定质量 policy 来自 b42c62e72310d31a088b7394a964492efc1f217a 的 scripts/quality.mjs，原始 SHA256 为 4410fd6709c89064e955446665890fadc0df1e60f1f9932f7387830c29fdbfab。原字节保存在 scripts/fixtures/quality-policy-b42.raw，仅作为开发期只读数据核验，不执行、不进入插件包。缺失或修改会失败；旧债仍固定到 9814b3bcf1ae015a63fac9af864c165617791fc3，不随当前 HEAD 更新。

本地 source/assets 分开的 browser fixture 可用 `WORKBENCH_BROWSER_ASSET_ROOT` 指向同任务已核源码对应的真实构建树；它只读取 lib 和三个既有生成的 static index。源码与资产 SHA、构建输入及只读范围须分别记录。
