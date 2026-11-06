<!-- collaboration-record
{
  "kind": "bug",
  "id": "BUG-20261105-base-shortage-sku-ranking",
  "date": "2026-11-05",
  "title": "缺货问数将基地SKU行数与跨基地SKU排行混用",
  "module": "基地库存",
  "category": "数据计算",
  "cause": "原始遗漏",
  "severity": "P2",
  "status": "已验证待发布"
}
-->
# 缺货问数计数与排名粒度

旧通道提供地点×SKU分页，缺少固定的跨基地SKU排行返回，模型将库存列表行数误作缺货SKU数、将地点×SKU前10作为公司前10。示例：商品A在两基地分别缺12与9，商品B缺20，正确SKU排行应A=21在前、正缺口SKU数为2；无缺口商品不进入计数。

修复：独立固定查询复用既有当前订单filtered范围，先按SKU加总再分页，原子返回正缺口数量和总量；Host校验完整返回列、同范围汇总、重复及缺页，不通过权限/异常时不回退或返回0。源/汇总两个查询保留同一规则，并登记生成入口。

回归：scripts/test_base_shortage_ranking.py、GEA tests/current-shortage-tool.test.mjs；原批次独立审计、当前用户真实GEA前两页通过。原summary/locations/detail与身份取消保护保留。历史引入提交未定位；不是对已核旧修复的回退。

2026-11-05：已验证待发布；发行版本/客户端验收在PR及发布记录回填。日报指标口径及旧订单范围需业务确认，不在本次修复中变更。
