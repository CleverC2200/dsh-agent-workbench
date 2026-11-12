<!-- collaboration-record
{
  "kind": "bug",
  "id": "BUG-20261106-inventory-cache-reconnect",
  "date": "2026-11-06",
  "title": "库存页重连提前清除有效缓存",
  "module": "库存管理",
  "category": "功能逻辑",
  "cause": "原始遗漏",
  "severity": "P2",
  "status": "已验证待发布"
}
-->
# 库存页重连提前清除有效缓存

普通页面连接更新误触发light-refresh，推进Host缓存freshAfter，尚未到期的完整结果被强制绕过。

三页真实Native入口回归：普通session-changing/changed保留freshAfter；显式刷新仍推进时点。

修复提交：deb171ee。目标版本：Workbench0.1.73，配套GEA0.0.245。91项定向回归、9项浏览器回归及官方类型/构建/质量检查通过。普通重连仍取消旧请求；身份、Consumer及字段权限规则保持。未改SQL、指标或同步脚本。客户端发布后验收另记。

历史核对：保留前版单仓合并首屏、跨仓隔离、完整分页、同批次和拒权取消回归；无功能/API/测试删除。缓存时长变更由用户明确指定。
