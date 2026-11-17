<!-- collaboration-record
{"kind":"bug","id":"BUG-20261117-owner-sandbox-save","date":"2026-11-17","title":"安全沙箱阻断通知负责人保存","module":"产销协同预警","status":"已修复","category":"交互","cause":"原始遗漏","severity":"P1"}
-->
# 安全沙箱阻断通知负责人保存

通知负责人表单依赖原生 submit 事件，但工作台保持 allow-scripts allow-downloads 的不透明 iframe 沙箱，不允许原生表单提交，点击保存因此没有反馈。旧独立页面测试未使用同样的沙箱，未覆盖该边界。

Workbench 0.1.130 保留原生 submit 按钮语义和 form，通过按钮点击的默认操作拦截复用同一个保存函数。鼠标与隐式回车提交都在沙箱原生提交之前执行既有白名单请求，不开放 allow-forms 或同源权限。原生 required/pattern、无效字段聚焦、忙碌防重、服务端身份校验、错误保留与回读保持。

新增同样不透明沙箱的浏览器回归，旧实现稳定复现保存不动，修复后点击、回车、非法工号不写入与刷新回读通过。原有CRUD错误恢复、只读和窄屏、任务策略三项测试仍通过；不创建真实检测任务或发送通知，不改其他数据结构。Modern Web Guidance forms 核对原生语义、验证和 AJAX 默认导航拦截；无新浏览器能力或兼容性依赖。正式构建、发行与 Native 保存验收另行回填。

已通过 [PR366](https://github.com/CleverC2200/dsh-agent-workbench/pull/366) 合并，固定源`7ce6014e993e72068315700c2b10a4e9d8ae5701`；[Workbench0.1.130](https://github.com/CleverC2200/dsh-agent-workbench/releases/tag/v0.1.130) 与 [GEA0.0.310](https://github.com/CleverC2200/dsh-gea-plugin/releases/tag/v0.0.310) 已发布。test141/stable133组合及实际来源下载、固定构建回执、三包预检、隔离安装Host加载核验通过。130项受影响回归与57项GEA回归通过，CI对应候选已通过。

正式客户端安装重启后，负责人原值保存返回清单、刷新仍显示14条；受控回读确认清单内容不变且保存版本推进。此前309的Native保存无反馈边界由本修复关闭。原登录配置、Core与其他开发工作树保持；没有创建执行真实检测任务、发送通知或操作DMS。真实定时检测不作为本轮实测结果。
