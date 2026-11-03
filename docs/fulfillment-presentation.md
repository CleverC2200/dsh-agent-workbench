# 飞书订单履约展示资源

范围仅包含订单履约卡片和飞书独立订单窗口，不改变其他页面、客户端壳、身份或 Session 归属。

卡片布局和文案唯一源为 `prototypes/inventory-orderfulfillment/sales-card-template.mjs`。本地卡片生成器直接使用该模板；构建同时导出数据型 `card-template.json`，后端只填入受控订单数据、收件人和服务端链接，不执行前端脚本。窗口源为同目录的 `sales-window`。确认、暂缓、处理人及查看范围仍由后端校验；订单编辑保持草稿，不提交 OMS。

## 构建与测试资源发布

本轮选择源码反馈，不执行客户端安装验收。根指引引用的 `docs/agents/current-development.md`、`dependency-preparation.md` 在本轮 main 基线不存在，使用现有独立构建入口；不借用其他工作树的 node_modules 或修改已安装客户端。

```sh
node scripts/build-fulfillment-sales-window.mjs
node scripts/publish-fulfillment-sales-window.mjs --bundle lib/business/inventory-orderfulfillment/sales-window --directory <4443服务器的订单展示资源目录>
```

第二条命令在有权写入该目录的测试发布环境执行，不会远程部署，也不写正式环境。构建入口不依赖完整插件或 SDK 构建。产物 manifest 登记 Workbench 所有权、order01、展示协议版本 1 和每个资源的 SHA-256；本地测试发布请使用任务目录。

首次接线需要部署支持该协议的后端，并通过 `GEA_ORDER_CONFIRMATION_PRESENTATION_DIRECTORY` 指向上述持久化目录。目录应挂载给测试实例，发布流程可写、后端只读。后端继续使用现有 4443 同源入口提供页面，原 OAuth 回调、cookie 路径、CSRF、Origin 和任务鉴权不变。无需修改使用者电脑或安装 Workbench 客户端。

发布脚本先验证完整资源包，写入不可变的 `releases/<manifest-sha256>`，最后原子替换 `active.json`。同一运行后端每次读取当前版本，不需重启；已打开窗口的脚本固定到原版本，保留旧 release 以供这些窗口继续访问。损坏资源、未知文件、跨目录文件及不兼容协议拒绝发布。后端也逐一核验哈希，外部配置出错时不退回旧内嵌页面。

未配置外部目录时，后端可使用同一 Workbench 构建产物的随包快照，不能把它当成免后端重启发布模式。接线验收需确认外部目录已启用，再只改展示文案、发布新资源，验证同一后端进程加载新窗口和卡片模板。发布后新卡片及后续卡片更新使用新模板；已经发出的飞书卡片不会因资源发布自动重发。

展示协议仍为 1 时，文案、布局和样式调整只发布该资源包。需要新增后端动作、数据字段或修改权限规则时，仍需调整并发布对应后端接口，不能由展示资源授予权限。
