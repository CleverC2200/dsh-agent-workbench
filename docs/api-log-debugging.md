# 接口日志、重放与批量调试

普通入口仍是工作台的“接口日志”。Native 面板和直接日志页面使用同一组件与样式；GEA Host 持有身份、样本、运行记录和请求执行。权限和 Agent 页暂未接入，本轮只交付接口调试。

单次重放和批量重发使用原捕获样本，保留原正文、请求 ID 与幂等键。每条可重发写记录须单独确认；未登记、禁止重发、失效或被清空的样本明确跳过，不选择更新的样本代替。传输失败与取消保留捕获日志；已发送写请求的结果可能未知，停止不表示撤销业务操作。

批次串行执行。单次重放和批量之间互斥；停止、离开页面、注销和身份代际变化会取消所属运行。Host 使用 opaque pageScope 隔离同一用户重新登录前后的记录访问，页面不自行建立登录状态。进程内保留最近20个结束批次，同一身份下其他窗口的运行可以查看进度。

日志仍脱敏凭据，模型请求／响应正文不保存。日志大小、流式正文省略和既有受控请求额度保持各自规则，调试运行不授予业务权限。

## 定向检查与 CI

先按当前仓锁和候选输入准备自己的依赖与官方 SDK。浏览器使用本仓锁定的 Playwright Chromium。

~~~sh
npm exec -- playwright install chromium
npm run test:api-log
node --test tests/ci-test-plan.test.mjs
npm run typecheck:official
~~~

测试从相邻 GEA 候选读取 Host 源码，不使用历史源码路径或系统 Chrome。GEA 的 api-log.test.mjs、api-log-replay.test.mjs 验 Host 行为，api-log-web.test.mjs 验真实隔离 Profile 的普通入口。后者需要 GEA 当前运行验证输入。

当前 CI 测试策略显式绑定本仓页面、日志合同与相邻 GEA 日志／Business／RPC 变化。迁入的组件测试使用 .browser.mjs，Host 测试使用 .test.mjs，由现有质量 CLI 选择并准备必要浏览器或 Profile。CI 选择反例核对两仓源码变化均选中对应测试。

源码／组件测试、远端 CI、Native 客户端装载和真实业务结果分别报告。隔离 HTTP fixture 通过不能代替真实业务验收。
