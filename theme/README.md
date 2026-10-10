# 插件共享视觉资源

`tokens.css` 由 Workbench 客户端的 `apply` effect 建立，插件释放时删除该样式；不写入或重建官方 Core。只定义 `--workbench-*` 和工作台自身样式，不覆盖官方 `--dsw-*`、布局或启动色。

主题状态、暗色标记与字号轴来自官方 DSH。Manage、GEA 原生贡献页和代表性 HTML 消费同一资源。包内 HTML 与已贡献 HTML 文档由 Workbench 的 iframe 呈现，在来源窗口校验后接收只读主题/字号投影；不建立独立设置或认证权威。

表格样板构建时校验本资源摘要并内嵌。样板的本地查询交互不以业务会话、GEA 登录或模型为前置。回退只需回退插件资源和对应插件候选，不需要改官方源码或删除用户设置。

资源版本以 [tokens.css](tokens.css) 为准。业务 Document 的栏宽、模式与高度由呈现模块 [frame-presenter.css](../src/frame-presenter.css) 维护；共享主题不再包含并排布局或窄屏上下排列规则。原有公共视觉、只读主题投影及样板资源摘要校验继续保留。
