# 三个数据看板的加载优化（2026-11-02）

本次按源码反馈实施，目标为当前 `D:/dsh-agent-workbench`。开始时 HEAD 为 `b8693bc5857f16f7a0143e84ee03b066008869eb`，已有订单工作台周期说明的未提交修改予以保留，并兼容月/周分区尚未返回的情况。未发布插件或修改正式运行目录；本票依赖、源码构建和 Host 均隔离在 `.runtime/dashboard-speed`。

## 已实施

| 页面 | 改动 | 数据边界 |
| --- | --- | --- |
| 客户库存 | 当前客户页复用本次完整校验过的索引，消除同范围重新取数；计划、地址、负责人各自完成后更新 | 刷新重新读取；身份/Session 生命周期失效后禁止复用；重复客户键拒绝；页数据独立复制，卡片和列表使用同一批事实 |
| 订单履约 | 完整订单事实就绪后即可显示明细，随后补充追踪与缺货；当前 SKU 页不等待全部卡片输入 | 每组查询完成自身分页检查后才使用；跨组核配置版本和来源计数；晚到冲突撤销当前读取并清除展示；缺失不补零 |
| 订单工作台 | 同一次加载内复用相同查询和业务参数；当前周期优先；界面进度按帧合并；SKU 键和计数并行 | 不跨身份或加载共享业务事实；失败不作为缓存；完整结果到达后取消排队的局部更新；SKU 快照与页配置版本相同才使用 |
| 公共读取层 | 原 SQL 和命名查询共用页面内调度器；首屏/可见详情先于后台读取 | 保持原命名查询并发上限，原 SQL 页面统一受四个槽位约束；取消的排队请求不发送；优先级不进入业务参数或权限协议 |

公共构建同时复制调度器，保证独立导出的 configured-query 入口能解析其内部依赖。三个页面保留原布局、计算公式、GEA 通道、Consumer 和行列权限。没有以列表分页作为指标的完整分母。

## 效果证据

以本次开始的 HEAD 和当前作者源运行相同确定性夹具：

| 场景 | 修改前 | 修改后 |
| --- | --- | --- |
| 客户库存四个来源完成并读取首个客户页 | 5 次来源读取 | 4 次来源读取 |
| 工作台六个周期与元数据，空集合夹具 | 39 次命名查询 | 37 次命名查询 |
| 上述工作台夹具中的负责人读取 | 7 次 | 5 次 |
| 同一绘制帧内连续 30 次进度通知 | 每次立即处理 | 合并为 1 次界面更新 |

这些是本地确定性夹具中的请求/更新次数，不是生产耗时或固定提升百分比。相同客户夹具的最终行值一致，工作台六个周期均保留；SQL 汇总与明细等价、未知值、拒列、计数变化、取消和恢复测试继续检查原口径。

订单履约的构建页回归故意挂起缺货查询：订单明细先出现，切至品项后 SKU 页请求也能启动；释放后继续检查完整指标。工作台 Chromium 回归挂起库存读取：已校验的满足率卡片先出现，比较周期未就绪时周期标题正确显示“加载中”，身份变化清除旧值。

用户扫码后，使用新构建 Host 真实读取；最终一轮先重启 Host 清除进程内缓存，保留资源快照和登录，不清数据库或网关缓存：

| 页面 | 阶段可用 | 完整刷新完成 |
| --- | --- | --- |
| 客户库存 | 库存事实 17.12 秒 | 补充信息完成 33.17 秒 |
| 订单履约 | 汇总 1.50 秒；订单明细 4.69 秒 | 7.67 秒 |
| 订单工作台 | 已保存报告 5.85 秒 | 实时事实刷新 47.75 秒 |

这是单轮观察值，起点为页面连接后的加载流程；导航、建 Session 和 iframe 装载的额外等待另记在 `elapsedMs`。工作台计时包括报告读取，恢复的是既有报告，不能把它当作实时事实首屏。当前无历史报告的早显示行为由受控夹具验证，本轮真实数据没有覆盖该分支。工作台多条网关查询在 8～14.7 秒，仍有明显的服务端读取瓶颈；这些是完整网关调用时间，不能直接当作数据库执行耗时。

前一轮暖缓存下客户库存完整读取 0.83 秒、履约 1.89 秒，明确单列，不与上述首次访问混算，也不由此推导线上改善百分比。三个页面无浏览器未捕获异常；真实事实读取成功。性能脚本只记录阶段、调用类别、时长和状态，不保存业务行、SQL 参数或身份；工作台自动报告保存被脚本阻止，保存错误不作为查询失败或保存验收结果。没有更改后台报告来制造性能成绩。

额外切换履约“品项”页，真实 SKU 页在 4.60 秒就绪、6.58 秒完成补充，未发生浏览器未捕获异常；该测试主页面已命中暖缓存，不纳入首次加载表。

## 本地诊断

`business/shared/dashboard-timing.js` 仅在本地 Performance 时间线上保存阶段名称和耗时，不写入业务数据、身份或网络遥测。浏览器控制台可读取：

```js
performance.getEntriesByType('measure')
  .filter(entry => entry.name.startsWith('dashboard:'))
  .map(({ name, duration, startTime }) => ({ name, duration, startTime }));
```

阶段覆盖客户库存就绪、履约汇总/订单就绪、SKU 当前页及补充完成、工作台已保存报告/当前周期展示和必要数据加载完成，并区分取消、失败、部分成功及历史报告复用。工作台计时包括读取已保存报告，避免漏掉事实查询之前的等待。每个页面阶段只保留最近一次记录；读取 startTime 区分不同加载。耗时截至代码执行该阶段，不是浏览器屏幕绘制或数据库执行时长。

## 验证与材料

三页独立作者构建通过；定向 Node 回归、Chromium 浏览器回归、固定版本 lint/format、共享 SQL 读取层 TypeScript 检查和 source-only 知识引用检查留在本票 `.runtime/dashboard-speed`。构建产物单独保留，根 `lib` 不夹带相邻 Manage 当前资源与旧编译快照之间的无关差异。

随后复制三仓 HEAD 和当前修改到本票独立源码快照，按锁文件准备依赖。Manage 完整构建、Workbench `--target core`（含 Host、client、声明及业务页面）和 GEA `--target host,client` 构建通过；只读 SDK 为 Core `0.2.0-rc.2`，HEAD `a0c0d2ff884b1808eccb9bb254a1659281364d7d`。独立 Home/profile 启动实际 Host，用户扫码授权后通过真实 GEA 通道读取三个页面；旧的已发布客户端未作为本次代码的验收目标。

收尾时主工作区另出现并行修改：`business/inventory-orderworkbench/queries.mjs`、`prototypes/inventory-orderworkbench/metric-model.mjs`、`tests/orderworkbench-reconciliation.test.mjs` 调整货龄来源及计算版本。本票未修改、覆盖或纳入本轮冻结构建与验收；不能将本轮结论直接推广为该并行变更的验收结果。

定向 Node 回归 302 项、Chromium 回归 15 项通过。补充工作台报告阶段计时后，相关 Node 回归 21 项及新构建工作台 Chromium 回归再次通过。材料包括 `source-inputs.json`、`local-*-build.log`、`affected-tests-final.log`、`browser-tests-final.log` 和 `live-results*.json`，均在本票运行目录。

本地首次生成新资源摘要时发现相邻 Manage 在 Windows 上并发提交相同资源快照会返回 `EPERM rename`。目标摘要目录已生成，重启独立 Host 后所有资源启用成功。该跨仓冷启动问题尚未修复，失败启动不计入页面性能结果，也不宣称首次安装验收通过。

新增/扩展的关键回归入口：

- `tests/customer-inventory-data-source.test.mjs`
- `tests/configured-query-performance.test.mjs`
- `tests/dashboard-loading.test.mjs`
- `tests/fulfillment-live-dom.test.mjs`
- `tests/orderworkbench-data.test.mjs`
- `tests/orderworkbench-reference.test.mjs`
- `tests/orderworkbench-loading.browser.mjs`

Windows 定向构建统一按 LF 核共享主题摘要；既有控制夹具剥离 import 时兼容 CRLF。履约浏览器外观基准使用当前作者准备流程、共享主题、同一授权夹具行和既有滚动容器；运行时已移除的作者问题示例不作为现有外观基准。

## 未实施的数据库及跨仓方案

已查阅 [TanStack 请求瀑布指南](https://tanstack.com/query/latest/docs/framework/react/guides/request-waterfalls)、[Doris 物化视图最佳实践](https://doris.apache.org/docs/3.x/query-acceleration/materialized-view/async-materialized-view/use-guide/)和 [MDN Server-Timing](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Server-Timing)。

GEA 已有身份 epoch 内缓存和同时请求合并，本次没有另建缓存权威或更改缓存期限。工作台仍返回全部必要周期；本次先消除重复读取，未把已有同比/环比改成缺失或关闭。SKU 快照日期仍经受控入口解析；没有为了少一次桥请求而缓存跨加载的未确认快照。

本次已使用用户授权的独立本地构建 Host 验证真实业务读取，但尚无数据库审计凭据。历史 `SELECT VERSION()` 的 `5.7.99` 是兼容协议版本，不能用于确认 Doris 版本及物化视图能力。因此没有执行生产 DDL、开启 SQL 缓存、更改刷新策略或发布新的资源表。物化视图、预聚合及分区裁剪需取得实际 Doris 版本、执行计划/Profile、刷新时效和相同授权范围的结果等价证据后决定。Server-Timing 涉及 GEA/Gateway 服务端分段，本次只加入页面阶段测量。

根树最初缺少 `lib/configured-facts.d.mts`；独立完整构建后知识导出和官方 TypeScript 检查通过。`quality:fast` 的 lint/format 包装器在 Windows 调用无扩展名 `.bin/oxlint`、`.bin/oxfmt` 时报 ENOENT，同版本工具直接执行的定向检查通过；因此不宣称完整 `quality:fast` 通过。自动影响计划初期遇到夹具拒绝，后续定向 preflight 已通过。以上验证不代表 Native 装载、客户端安装包或线上提速验收。
