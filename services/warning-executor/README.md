# GEA 预警执行器

XXL-JOB 负责定时调度，已登录的 GEA 客户端执行原有 Agent 检测逻辑。关闭客户端后不执行 Agent；超过等待时限向调度中心返回失败，不伪造成功。

`server.mjs` 使用 Node.js 22 或更新版本的标准库，无数据库驱动。任务、执行记录、预警及观测的读写统一由 GEA Host 调用 `PG-Warning` 数据源的 `/ai/sql/execute` 白名单接口。服务只保存调度队列及回执；业务状态不在此服务另建一份。

服务配置通过 `GEA_WARNING_EXECUTOR_CONFIG` 指向服务器上的私有 JSON 文件，包含 `adminUrl`、`username`、`password`、`accessToken`、`geaBase`、`appName`、`executorUrl`、`host`、`port`、`statePath`。配置及运行队列不能进入插件包、Git 或日志。`statePath` 用于重启后恢复调度交接记录，稳定 `runKey` 防止重复检测。

部署时仅监听 loopback，XXL-JOB 与执行器位于同一服务器；客户端通过现有可信 HTTPS 入口的 `/gea-warning/client` 访问。此路径代理到执行器 `/client`，不向外代理 `/run` 等 XXL-JOB 协议接口。每个客户端请求由 GEA 登录身份及 APS 授权核验，服务端绑定任务归属，不接受页面传入的所有者、执行器分组或 Handler。XXL-JOB 协议使用现有 accessToken。

`GET /health` 为运行状态；`POST /client` 仅支持任务所属账号的调度管理、领取及回执。操作路径固定，任务编号和日志编号去重，执行结果确认后不得改写。

本地验证：`node --test tests/warning-executor.test.mjs tests/detection-whitelist.test.mjs`。真实部署仍需核验调度中心注册、登录客户端执行和白名单写入回读。
