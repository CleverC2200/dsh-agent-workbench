<!-- collaboration-record
{
  "kind": "change",
  "id": "CHANGE-20261105-ontime-suite-dsh-agent-workbench",
  "date": "2026-11-05",
  "title": "发布订单工作台数量与准交率修正",
  "module": "插件发布",
  "status": "待发布"
}
-->
# 发布订单工作台数量与准交率修正

按已合并 PR #250 发布：改单率按有效明细数量合计，准交率按已确认准交执行单数除以全部应统计已发货执行单数。保留缺失数据说明，郑州庞丽娟沿基地口径。

版本 0.1.67 → 0.1.69；基线 1165e74c3403fdce6ac2c40c5aa998bc259f0297。版本生成器及受影响单测、GitHub Required CI、固定主线构建和发布预检分别留证。未删除既有能力或缩小已有兼容范围；未发现需新增的缺陷记录。本记录为发版准备，尚未上传频道、验证安装或发布 GitHub Release。

采用用户分发的 dsh-plugin-release 1.3.0，已按安装包清单校验全部 24 个文件；未登记团队维护源，不声明团队技能已同步。发行目标为已登记 GitHub 仓库及 synear-gea 的 test/stable 插件频道；不构建桌面客户端。
