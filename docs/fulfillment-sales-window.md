# 订单履约飞书卡片与订单处理页面

卡片模板由 Workbench 的 `prototypes/inventory-orderfulfillment/sales-confirmation-card.mjs` 持有；订单提交、商品增减及确认窗口源码位于同目录的 `sales-window/`。不再以 GitLab Java 资源目录作为这份前端的开发来源。

`node scripts/build-fulfillment-sales-window.mjs` 只构建此窗口，输出 `lib/business/inventory-orderfulfillment/sales-window/` 的 HTML、合并脚本、卡片模块和校验清单。订单履约模块构建也包含该步骤。清单记录资产摘要及既有后端静态资源路径，不执行上传、部署或服务端代码修改。

GEA 仍持有用户身份、订单范围、消息接收人和受控执行入口。纯卡片模板不发送消息，也不生成授权：没有宿主核验的 URL 时按钮禁用。页面数据不能指定接收人、回调地址或扩大权限。Core 无业务改动。

静态窗口仍需由可访问的服务同源承载；构建完成不代表已部署。既有 `/window/{request}/data`、`/action`、OAuth、会话 Cookie、CSRF 和订单分派校验不变。服务承载时使用清单中的 HTML/JS，卡片发送端需消费同一模板及其受控入口；本仓不会自动替换已部署的 Java 卡片发送器。

兼容既有后端时，“订单处理”的受控 URL 使用已有的 `mode=details`：认证读取成功后，待处理且缺货/满足率不足或未知的订单打开草稿编辑页。`mode=edit` 仅供已支持该模式的服务或本地预览使用。已结束任务不可编辑。没有新增匿名业务读取或写入接口。

标题及操作：满足订单为“订单待确认”；缺货或满足率未知为“订单待处理”，仅显示“暂缓发货”“订单处理”，不显示“查看明细”按钮。沿用蓝色标题、左右 4:1 布局。

商品增减仅编辑当前窗口草稿，不修改通知快照。缺货提示明确为原订单缺货，不冒充剩余库存；未知数量保留横线。尚无真实改单、可售商品目录及车型规则接口，实际提交保持禁用，只允许调整原订单中可识别的 SKU，不生成虚构商品、价格、库存或计算结果。

定向验证：`node --test tests/fulfillment-sales-confirmation.test.mjs tests/fulfillment-sales-window.test.mjs`。本地样例预览不代表 OAuth、飞书回调或 OMS 已完成真实端到端验收。
