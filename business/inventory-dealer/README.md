# 经销商库存

页面来源、受控读取链路和原业务规则以 [SOURCE.md](SOURCE.md) 为准。当前页面经 GEA Host 受控 SQL 读取；只有来源、客户、快照、计划月和完整分页都核实时，页面证据才支持对应范围的结论。模拟输入用于离线测试，不能作为运行数据回退。

页面 `inventory-dealer` 与 Consumer `dealer-inventory-replenishment` 保持原标识。页面可见、Manage 资源启用和 GEA 服务端授权分别判断。Workbench 按实际 Core Session 保存筛选、分页与未提交补货草稿；SAP 报价和正式订单提交仍有能力缺口，导出只是未提交文件。

原票 16 的真实客户、行权限、数据并发、模型引用、原生恢复与设备验收仍待补测。源码或离线证据不自动关闭这些条件。早期模拟阶段说明按原字节保存在[历史 README](../../docs/history/inventory-dealer-readme-before-live-read.md)。
