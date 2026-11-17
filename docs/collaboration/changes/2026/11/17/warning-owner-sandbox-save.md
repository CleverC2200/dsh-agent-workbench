<!-- collaboration-record
{"kind":"change","id":"CHANGE-20261117-owner-sandbox-save","date":"2026-11-17","title":"兼容安全沙箱的通知负责人保存","module":"产销协同预警","status":"已验证待发布"}
-->
# 兼容安全沙箱的通知负责人保存

通知负责人表单依赖原生 submit 事件，但工作台保持 allow-scripts allow-downloads 的不透明 iframe 沙箱，不允许原生表单提交，点击保存因此没有反馈。旧独立页面测试未使用同样的沙箱，未覆盖该边界。

Workbench 0.1.130 保留原生 submit 按钮语义和 form，通过按钮点击的默认操作拦截复用同一个保存函数。鼠标与隐式回车提交都在沙箱原生提交之前执行既有白名单请求，不开放 allow-forms 或同源权限。原生 required/pattern、无效字段聚焦、忙碌防重、服务端身份校验、错误保留与回读保持。

新增同样不透明沙箱的浏览器回归，旧实现稳定复现保存不动，修复后点击、回车、非法工号不写入与刷新回读通过。原有CRUD错误恢复、只读和窄屏、任务策略三项测试仍通过；不创建真实检测任务或发送通知，不改其他数据结构。Modern Web Guidance forms 核对原生语义、验证和 AJAX 默认导航拦截；无新浏览器能力或兼容性依赖。正式构建、发行与 Native 保存验收另行回填。
