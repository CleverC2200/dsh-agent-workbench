# fc-aging-doris-cast

分仓货龄列表合计使用数据库支持的 DOUBLE 类型。原 DOUBLE PRECISION 能通过受控 SQL 校验，但底层 Doris 执行拒绝，导致列表读取失败。直接源查询与每日汇总查询同时修正；过滤、分页、计数、加权货龄和周转公式不变。实际网关查询已复现原错误，修正后返回完整明细且无字段拒绝；24项货龄SQL口径测试通过。

本次CI中ubuntu-latest切换到Ubuntu26；按[锁定Playwright1.58.2的系统要求](https://github.com/microsoft/playwright/blob/v1.58.2/docs/src/intro-js.md#system-requirements)，source-checks固定使用Ubuntu24.04，保持完整浏览器测试、依赖版本和成功门禁。
