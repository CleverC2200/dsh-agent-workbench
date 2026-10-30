# 分仓完整流程合入交接（2026-10-28）

用户已授权合入“克隆 3 个 DSH 仓库”当前代码，并授权跨对话协调。目标两仓均位于 `.runtime/inventory-pr-local-latest-20261028/repos`，分支 `codex/inventory-loading-20261028`。

## 已合入

- 原 gea-agent-fc 净需求逻辑基础上的计划/周期恢复和保存、局部导入合并、周期状态及仓库归属。
- 原 `data_service.agent_branch_plan_import` / `agent_branch_cycle_config` 适配，新增确认和回执事件表的专用接口。
- 同月多批次、提交前配置检查、快照校验、确认先落库、DMS 防重暂存、未知结果保护、回执归档及只读恢复。
- 暂存成功后经 Workbench 外层打开 DMS 返回的免登地址，固定 menu=/corder/ordermgt；保留 iframe sandbox。失败仅重试跳转。

## 与性能改动的合并

保留现有分仓目录与筛选、20分钟缓存/并发去重、快速库存、独立看板加载、有界 order_presence、fc_branch_scope、上月实际和本月日均等新列及生成器。仓库筛选 `warehouseCode` 与保存周期归属 `fcCycleWarehouse` 是独立参数，不互相替代。

周期 SQL 补丁只作用于确实计算 fc_cycle 的查询；优化后的不依赖周期的 count 保持无此参数。修复了首次合并验证发现的参数多传问题。scope-fc-cycle-rules.py 保留网关兼容的 SUBSTRING 写法。

列表默认10条/取消跨页预取交回接收对话继续处理；本次没有把 pageReadSize:50 作为最终要求。读取保存计划后为重算看板会显式枚举当前筛选范围，区别于普通列表翻页；若继续优化请保留汇总完整性和提交前全量确认校验。

## 本轮检查

- Host 入库、DMS、防重及缓存测试37项通过。
- Workbench分仓保存、批次、回执、跳转测试46项通过（含跳转失败重试不重复下单）。
- 来源读取、看板隔离、原列和分页回归35项通过。
- 离线 SQL 回归121项通过。
- 两仓官方 tsconfig 类型检查通过；完整分仓页面 esbuild 编译、定向 lint/format 和 diff 检查通过。

本轮未触发远端CI、未提交、未推送、未更新版本、未安装或重启桌面。未修改 lib、依赖、提示词、Skill 或 GEA 服务端。由接收对话统一开展 PR/CI。

## 联调证据与上线条件

合入前隔离页面实测单 S00700200（商品10000362为10件，10000363为55件）：页面确认 → 真实GEA测试入库 → DMS测试暂存 → 回执revision2 → 自动打开DMS订单管理，张鑫已登录且明细一致，实际下单1次。这是原组件/原iframe限制的隔离页面验收，库存使用固定样本；不代表当前安装桌面已经装载。证据在 `.runtime/fc-flow-alignment-20261026/acceptance-20261028/分仓页面提交跳转验收-20261028.md`。

部署需要同时启用 Host 的 dms.test 与 fcStorage.test；dataSourceCode 为 Postgres-Data-service，planningLayout 为 legacy，配置实际用户/分仓授权及 warehouse_code→warehouse_id 映射；密钥只通过 GEA_DMS_TEST_SECRET 环境提供，不进入仓库。详见两仓合入的 fc-live-flow / fc-dms-navigation 文档。旧计划表原子保存上限为18条发生变化的SKU，超过会明确拒绝；尚未实现更大批次事务保存。

## 回溯

`manifest.json` 保留落盘前后SHA256；`before/`保留目标原文件，`base/`、`source/`、`merged/`保留合并材料。每仓补丁是目标合入前到合入后的精确增量，不是覆盖整个仓库的补丁。后续另一个对话继续修改后，勿直接用备份回滚。
