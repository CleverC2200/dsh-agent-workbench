# 飞书订单履约展示资源

范围仅包含订单履约卡片和飞书独立订单窗口，不改变其他页面、客户端壳、身份或 Session 归属。

卡片布局和文案唯一源为 `prototypes/inventory-orderfulfillment/sales-card-template.mjs`。本地卡片生成器直接使用该模板；构建同时导出数据型 `card-template.json`，后端只填入受控订单数据、收件人和服务端链接，不执行前端脚本。窗口源为同目录的 `sales-window`。确认、暂缓、处理人及查看范围仍由后端校验；订单编辑保持草稿，不提交 OMS。

## 构建与测试资源发布

本轮选择源码反馈，不执行客户端安装验收。根指引引用的 `docs/agents/current-development.md`、`dependency-preparation.md` 在本轮 main 基线不存在，使用现有独立构建入口；不借用其他工作树的 node_modules 或修改已安装客户端。

```sh
node scripts/build-fulfillment-sales-window.mjs
node scripts/publish-fulfillment-sales-window.mjs --bundle lib/business/inventory-orderfulfillment/sales-window --directory <4443服务器的订单展示资源目录>
```

第二条命令在有权写入该目录的测试发布环境执行，不会远程部署，也不写正式环境。构建入口不依赖完整插件或 SDK 构建。产物 manifest 登记 Workbench 所有权、order01、展示协议版本 2 和每个资源的 SHA-256；本地测试发布请使用任务目录。

首次接线需要部署支持该协议的后端，并通过 `GEA_ORDER_CONFIRMATION_PRESENTATION_DIRECTORY` 指向上述持久化目录。目录应挂载给测试实例，发布流程可写、后端只读。后端继续使用现有 4443 同源入口提供页面，原 OAuth 回调、cookie 路径、CSRF、Origin 和任务鉴权不变。无需修改使用者电脑或安装 Workbench 客户端。

发布脚本先验证完整资源包，写入不可变的 `releases/<manifest-sha256>`，最后原子替换 `active.json`。同一运行后端每次读取当前版本，不需重启；已打开窗口的脚本固定到原版本，保留旧 release 以供这些窗口继续访问。损坏资源、未知文件、跨目录文件及不兼容协议拒绝发布。后端也逐一核验哈希，外部配置出错时不退回旧内嵌页面。

未配置外部目录时，后端可使用同一 Workbench 构建产物的随包快照，不能把它当成免后端重启发布模式。接线验收需确认外部目录已启用，再只改展示文案、发布新资源，验证同一后端进程加载新窗口和卡片模板。发布后新卡片及后续卡片更新使用新模板；已经发出的飞书卡片不会因资源发布自动重发。

## 页面入口与业务权限

协议 2 的服务端只提供当前任务的受控入口 `entry?reference=...`，卡片模板在 Workbench 内追加 `view=details`、`view=edit`、`view=confirm` 等展示标识。OAuth 只校验标识的安全字符和长度，原样带回同源、固定任务的窗口；它不登记页面列表，不接受回跳 URL、路径或文件名。后端不因页面标识授予查看、处理或数据权限。

Workbench 在窗口内决定页面：订单号只显示明细，订单处理进入草稿编辑；未知页面默认只读明细。历史 `mode` 参数仍可读取，新的 `view` 优先。旧卡片将订单处理也编码为 `mode=details` 时，明细页只对有处理权限的待处理缺货订单提供主动进入“订单处理”的链接，不再自动切页。窗口读取数据不发送页面名；列表通过独立的 `includeRelated=true` 请求有权读取的关联记录。确认／暂缓继续使用原动作接口、权限、版本、CSRF 和 Origin 检查。

首次启用协议 2 需要一次后端通用入口接线，并配置外部展示目录。之后只调整页面切换、卡片文案、布局和样式，或在现有数据与动作范围内新增窗口页面，只发布 Workbench 展示资源，不重新构建或重启后端。后端兼容旧协议 1 的已发卡片和固定版本脚本；旧后端应拒绝协议 2，不能将新资源误判为已兼容。需要新增业务动作、数据字段或修改权限规则时，仍需调整对应后端接口。
