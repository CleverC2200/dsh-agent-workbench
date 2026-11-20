<!-- collaboration-record
{"kind":"change","id":"sales-plan-submit-return-cleanup-20261112","date":"2026-11-12","title":"销售预测简洁结果与提交退回恢复","module":"销售计划","status":"已发布待验收"}
-->

# 销售预测提交退回清理

已发布Workbench [0.1.105](https://github.com/CleverC2200/dsh-agent-workbench/releases/tag/v0.1.105)、GEA [0.0.282](https://github.com/CleverC2200/dsh-gea-plugin/releases/tag/v0.0.282)，配套Manage [0.6.3-company.69](https://github.com/CleverC2200/dsh-agent-manage/releases/tag/v0.6.3-company.69)。

- 提交和退回失败显示简洁结果，直接展示DMS原因，不显示错误编号；修复失败项仍标审批通过的问题。
- 审批完成后顶部加载随操作结束释放，支持连续切换节点并再次审批。
- 明确失败后的再次提交使用新请求；未知结果沿原请求核对；已有有效回执后只回读，不再POST。
- 旧版本、草稿、周期、SKU及权限阻断显示具体原因；数值等价的小数格式不再误判变化。月初数量统一取整，金额同步。
- 按用户明确要求删除版本对比按钮、专属历史选择/加载/差量与旧hook测试，保留当前版本、审批历史、退回目标及节点核验。
- 本地页面/模型133项、Host72项及补充检查通过，宽屏与390px布局已核；Standards及Spec复核无剩余阻断。
- 修复PR及固定合并提交的主线CI通过；三包预检、隔离官方安装及Host/client接收通过。
- 测试频道revision 116、正式频道revision 108均通过生产来源完整下载与SHA-256核验。
- 用户设备的真实提交、退回和DMS业务结果待验收；本轮没有生产业务写入。

相关问题：[BUG-20261112-approval-result-form](../../../../bugs/2026/11/BUG-20261112-approval-result-form.md)。
