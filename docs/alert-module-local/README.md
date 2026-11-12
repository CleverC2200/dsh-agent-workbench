# 预警模块本地集成说明

本分支保存本地 GEA 预警原型的源码、事件生命周期及界面实现；不是生产部署包。检测任务、执行记录、预警事件和观测历史使用 `schema.sql` 中的独立 PostgreSQL schema；卡片关闭不停止检测任务。

本地运行时由 `GEA_WARNING_HOME` 指向独立目录（未设置时使用 `D:/work_project/gea-xxl-job-test`）。目录需要 `config/metric-catalog.json`、`config/postgres.json`、`config/detection-token.txt`、可选的 `config/feishu-warning.json`、`package.json` 和 `pg` 依赖，并需将 `send-feishu-warning.py` 放在该目录。运行数据及这些本地配置不属于源码，不应提交。

XXL-JOB 本地调度中心由 `GEA_XXL_JOB_USERNAME`、`GEA_XXL_JOB_PASSWORD` 注入登录凭据；`GeaDetectionHandler.java` 是执行器接入代码，宿主与执行器需使用同一 `GEA_WARNING_HOME`。飞书发送器依赖本机 Feishu API 客户端脚本，可通过 `GEA_FEISHU_API_SCRIPTS` 配置路径；应用凭据和接收人只在本地配置。

当前实现依赖本机 PostgreSQL、XXL-JOB、Python 和 GEA 宿主，不支持直接在其他环境开箱运行。提示词对未确认的指标口径返回失败，不凭空认定预警恢复；规则、字段映射及权限需要业务确认。开发期间已验证的组件逻辑不等同于真实消息发送或生产验收。`行动建议`中的模拟卡片仅用于展示，不计入真实待决策数量。

核心生命周期检查：`node --test tests/alert-lifecycle.test.mjs`。
