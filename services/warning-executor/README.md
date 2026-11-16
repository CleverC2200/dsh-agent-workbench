# GEA 预警执行器

XXL-JOB 负责定时调度，已登录的 GEA 客户端执行原有 Agent 检测逻辑。关闭客户端后不执行 Agent；超过等待时限向调度中心返回失败，不伪造成功。

`server.mjs` 使用 Node.js 22 或更新版本的标准库，无数据库驱动。任务、执行记录、预警及观测的读写统一由 GEA Host 调用 `PG-Warning` 数据源的 `/ai/sql/execute` 白名单接口。服务只保存调度队列及回执；业务状态不在此服务另建一份。

服务配置通过 `GEA_WARNING_EXECUTOR_CONFIG` 指向服务器上的私有 JSON 文件，包含 `adminUrl`、`username`、`password`、`accessToken`、`geaBase`、`appName`、`executorUrl`、`host`、`port`、`statePath`。配置及运行队列不能进入插件包、Git 或日志。`statePath` 用于重启后恢复调度交接记录，稳定 `runKey` 防止重复检测。

部署时仅监听 loopback，XXL-JOB 与执行器位于同一服务器；客户端通过现有可信 HTTPS 入口 `https://gea.synear.cn:4443/gea-warning/client` 访问。此路径代理到执行器 `/client`，不向外代理 `/run` 等 XXL-JOB 协议接口。每个客户端请求由 GEA 登录身份及 APS 授权核验，服务端绑定任务归属，不接受页面传入的所有者、执行器分组或 Handler。XXL-JOB 配有协议 accessToken 时按原值核验。当前调度中心的该配置为空，执行器显式使用 `protocolAuth: loopback-log`，仅接受本机请求；`/run` 还通过调度中心的已认证管理接口核对日志编号、任务、Handler、参数、地址和时间，不回退为任意请求放行。

`GET /health` 为运行状态；`POST /client` 仅支持任务所属账号的调度管理、领取及回执。操作路径固定，任务编号和日志编号去重，执行结果确认后不得改写。

本地验证：`node --test tests/warning-executor.test.mjs tests/detection-whitelist.test.mjs`。真实部署仍需核验调度中心注册、登录客户端执行和白名单写入回读。

## 飞书应用与接收人

预警默认通过同一服务查询接收人和发送通知，不再要求每台客户端准备 Python、个人飞书 token 或人员映射文件。服务端私有配置新增 `feishu.appId`、`feishu.appSecret`、`feishu.receiptDirectory`，指定应用为“思念GEA-测试”（`cli_aaf07a77f7789bfb`）。Secret 只保留在服务配置，文件权限为 `0600`；代码、安装包、频道及日志中不保存凭据。`receiptDirectory` 应位于既有可写状态目录下，与调度队列一并持久保留。

客户端沿现有 HTTPS `/gea-warning/client` 调用 `feishu-status`、`feishu-recipient` 和 `feishu-send`。服务校验 GEA 登录态与 APS 授权后，从同租户人员目录读取所选账号，以飞书通讯录的工号精确匹配在职、激活的应用内身份；不使用登录用户信息接口代替所选接收人。姓名只用于缩小搜索范围，同名、冻结、离职或分页不完整时拒绝选择。接口仅返回 GEA 账号和展示名称，不返回飞书 token、Secret 或接收人的 Open ID。

发送前还校验调度任务属于当前用户。稳定通知 UUID、服务端发送意图及消息回执共同防重：成功回读原回执；发送超时或回执损坏时保留待核实状态，不自动重发。选择人员的验证不发送消息。历史通知记录继续保留原发送方式，不将其他应用下的 Open ID 当成本应用接收人。

部署更新应备份原服务代码和配置，保留状态目录，更新源码后只重启该执行器。校验 `/health`、当前账号授权、接收人查询与调度注册；不得重启 GEA、XXL-JOB 或其他业务服务。
