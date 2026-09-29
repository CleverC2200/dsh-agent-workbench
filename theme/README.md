# 共享主题资源 1.0.0

这里是原生对话、输入框、工作台壳共用样式的唯一编辑位置。它是开发期 CSS 资源，不是插件；不注册服务，不保存主题或字号。

将资源同步到本项目隔离的 DSH 源码，再构建宿主：

```sh
node scripts/sync-theme.mjs --core ../deepseek-harness
node scripts/sync-theme.mjs --core ../deepseek-harness --check
```

宿主提交生成的 `workbench-theme.css` 和含版本、SHA-256 的 `workbench-theme.json`。运行时由 ui-theme 打包并管理样式生命周期；没有工作台插件也会加载。集成前执行 `--check`，禁止单改生成副本。同步脚本要求显式指定目标，没有默认写入位置。

主题状态与字号仍属于 DSH ui-theme。它的 presenter 设置 body 暗色标记、字号轴和系统窗口主题标记；所有布局只消费变量。资源用明确的 html/body 优先级抵抗上游样式加载顺序变化，仍允许主题 API 的内联 token 覆盖。宿主状态、代码配色和品牌字体保留上游规则。

| 消费者 | 资源 |
| --- | --- |
| 原生对话 | `--dsw-alias-label-primary`、`--dsw-alias-bg-base`、原有正文字号轴 |
| 原生输入框 | `--dsw-specific-input-major`、字号轴、`--dsw-alias-state-business-primary` 焦点色 |
| 工作台壳 | DSH 语义颜色变量、`--workbench-font-size`、`--workbench-font-family` |

浅色沿用工作台规范的红色与中性面板。暗色使用对应的可读色阶；辅助文字为满足对比度加深。默认字号遵循宿主 14px，用户设置在 12–17px 内变化，不额外固定 12px。业务指标、页面数据和 iframe 内部样式不在此资源中。

恢复时成对回退工作台资源提交与宿主适配提交，并重建；没有需要迁移或删除的用户设置。
