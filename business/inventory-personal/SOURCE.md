# 个人库存接收来源

页面与汇总规则恢复自 Workbench ca58152db40b06df10ad08d9ec97bc6813e13f18，资源恢复自 Manage 4994608c9f2c910b978d63583837871c78406b00。原26年龄修复、历史失败和恢复引用均保留在项目 evidence/26。

当前正式来源为个人独立Consumer经公共GEA通道读取的基地日报、分仓目录和快照。分页与取消复用shared/sql-reader；基地日报映射和分仓事实读取复用现有实现，个人汇总和风险使用Manage公开纯计算。固定mock-input仅供离线测试，未进入运行bundle。日监控、优先事项、41–60与60+分类及基地31+数量沿原规则，分仓31+仍未知。真实接口与数据的Native验收尚未完成。

入口默认隐藏。标准菜单预设没有 inventory-personal，运行配置不自动添加该根。唯一运行 owner 可以在受审测试根组中明确选入 lib/business/inventory-personal；未选入时不登记新菜单或Agent。本批不改官方Core，也不恢复旧隐藏字段或旧浏览器。

未提交反馈字段使用现有WorkBench viewState按真实身份/Session地址分隔。草稿按钮调用 page draft，只通过当前Session的公开Core输入接口插入未发送文字，保留居民草稿。它不调用模型、反馈系统、通知或业务写入。刷新和切页只恢复UI意图，指标和权限不持久化。
