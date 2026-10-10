# APS 经营指标来源

固定来源 dsh-agent-aps-plugin `4c7ffa6a53493b599627a2eb0bb2ae152460c494`。实际生成链是 ui-source/app/plugin-entry.tsx 与 scripts/build-ui.mjs；根 src/ 是历史本地数据库界面，不是当前产物的来源。原指标、固定 SQL、筛选及分析消费者迁入本目录，Agent 资源由 Manage 唯一维护，身份与受控执行归 GEA。

47 按固定17候选选择性恢复此真实生成入口。原八个纯计算和维度模块迁到 Manage `src/aps-compute`，页面从其公开导出消费。当前构建入口为 `scripts/build-aps-metrics.mjs`，默认生成受控读取页面；只有显式设置 `APS_BUILD_MODE=mock` 时才生成模拟声明与固定输入。该模式不修改源默认真实合同，实际候选模式核其 `build-inputs.json` 和声明。原50字面回归和模块运行时AST校验见 `scripts/check-aps-parity.mjs`。页面筛选使用当前公开 view-state，引用只加入当前官方会话未发送草稿；原17 model403、20表缺项及18/19真实验收仍未完成。
