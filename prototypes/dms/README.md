# DMS 回写演示（模拟）

唯一来源见 SOURCE.json：登记 GEA b71fbe049809385c2af82f135b2ef2c10a8b6a39 的 demos/dms、mock-dms.ts 与工作流投影。47从原36固定dirty ZIP选择性恢复。Workbench保留原按钮、字段与内存模拟器，报文纯计算迁到Manage；工作流复用当前Workbench已有实现，消费共享主题1.1.1与现有business/shared/channel.js。

构建入口为 node scripts/build-dms-prototype.mjs；产物 lib/prototypes/dms 由现有 v2 装配加载，页面 ID inventory-dms。旧 demos/dms 是独立静态页，没有已登记页面 ID 或持久 Session；SOURCE.json 提供一次性入口映射，不增加旧运行时入口。原始字节保存在项目 evidence/36/original。

用户模拟品类终审、回写、对账和重复回执；Agent 只读目录未声明按钮写动作。上下文明确 DMS_MOCK / simulated / realWriteback=false。只有 PLANE_NUM 对应 plan_id 是已核外部字段，其余为模拟结构。

刷新、重置、切类型会清空内存，新对话保留挂载页面内存。类型和场景选择通过当前范围内的view合同恢复，不保存模拟回执或完成状态。旧持久会话和用户数据不修改。异常与未知保持可见，UNKNOWN 先对账；M 一笔，Z ADD/CUT 两笔，重复回执不重复入库或改完成时间。

本项目中只做隔离源码和离线验证；原生安装、启用、实际页面引用授权及组合恢复另行验收。没有 DMS 凭据、真实连接、业务写或发布授权。
