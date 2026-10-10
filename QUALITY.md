# Workbench 质量门禁

普通开发执行 `npm run quality:fast`。它检查知识引用、Oxlint、Oxfmt、官方声明和质量反例，允许未提交修改。`lint:audit`、`format:audit` 返回全部既有债务的真实结果。

质量策略、工具版本和旧债 blob 固定到原环境改造输入，不随当前 HEAD 更新。旧债仅在文件字节匹配 `9814b3bcf1ae015a63fac9af864c165617791fc3` 时豁免。固定原始策略以 hash 校验，不执行。新鲜 main 的产品字节保持，本轮发现的额外债务会使门禁失败，不能将接线存在视为质量通过。

冻结组执行 `npm run quality:ci -- --input /absolute/candidate-input.json --core-head <registered-head>`。Core 清单只读相邻 GEA 的 `scripts/supported-cores.json`。SDK 准备与验证复用 Manage 公共接口，并传实际 manifest.core。已有只读 SDK 用 verify；首次独立 runner 才加 `--prepare-sdk --core-source <official-git-source>`，生成 runner 自己的 SDK。

该入口先核事件 SHA、三仓完整历史、包身份、HEAD、锁和源码 clean，再准备 SDK、安装本组独立依赖并执行 quality:fast、build:core、知识产物检查、test:aps 和 npm test。`--browser --prepare-browser` 准备锁定的 Playwright Chromium 并执行独立浏览器测试。Node 全量含 HTML 浏览器合同；独立 browser 套件另行执行。测试并发固定为 Node 2、browser 1。两个 Core 的 workflow matrix 分别执行入口；最终汇总拒绝 failure、skipped、cancelled 和缺失结果。

默认 workflow 的 peer SHA 与 CLI 绑定同一登记组，变更需要成组更新。私有 peers 只用 contents-read `PLUGIN_SPLIT_READ_TOKEN`，凭据不持久化。配置存在不证明远端 runner 可运行或 required-check 已阻止合入。

迁移 golden 输入保存为 `tests/fixtures/migration-history.raw`，只含既有 Dealer `67e1007aa400a8a9c65c132f144dabd5168a49df` 的原 source 和 Personal `15def488134527647a819812a4b6657ecf9772fe` 的四个原输入。每项原 Git blob、SHA-256 和整份原始字节摘要由测试 helper 校验。它只供测试，不进入插件包；保持原业务断言和拒业务读取。可选 `--dealer-history`、`--personal-history` 额外核显式只读 Git 根与 fixture 原字节相同。冷 CI 不依赖私人 LAN 或旧布局路径。

构建后源码 HEAD、锁和 peers 必须保持，只允许原 lib 与生成 static index 的派生差异，逐文件保存摘要。最终回执区分冻结源码和 prepared 产物；离线质量通过不证明 Native、真实授权、业务、模型或正式发行。
