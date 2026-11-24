export const historyColumns = [
  '历史期间',
  '物料组',
  '自身原始数量',
  '自身计算用数量',
  '替换品编码',
  '替换系数',
  '替换品原始数量',
  '替换品计算用数量',
  '计算用历史数量',
  '补0状态',
  '历史分类',
  '历史占比',
  '销售提报占比',
  '历史占比处理',
  '历史占比调整说明',
  '来源状态',
  '实际处理',
  '来源',
  '原因',
];
const identity = (row) => JSON.stringify([row.base, row.code]);
const uniqueRows = (rows) => [...new Map(rows.map((row) => [identity(row), row])).values()];
const statusText = (status) =>
  ({ ready: '读取完整', partial: '读取不完整', failed: '读取失败', unread: '未读取' })[status] ||
  status;
const reason = (row) =>
  [
    ...new Set([
      ...(row.historyAudit?.reasons ?? []),
      ...(row.historyAudit?.months ?? []).flatMap((month) =>
        month.reasons.map((reason) => `${month.month}：${reason}`),
      ),
      ...(row.historyAudit?.classification === '疑似新品或重新上市'
        ? ['连续12个完整历史月无实际发货，需核对产品身份']
        : []),
      ...(row.historyAudit?.classification === '短期断档数据异常'
        ? ['最近1至2个完整历史月无发货，此前有发货']
        : []),
      ...(row.historyAudit?.classification === '来源异常或其他历史异常' &&
      !row.historyAudit.months.some((month) => month.reasons.length)
        ? ['历史无发货模式不符合前两类，请核对原始历史']
        : []),
    ]),
  ].join('；');
export function historyExportRows(rows, context, period, includeMonths = true) {
  return uniqueRows(rows).flatMap((row) => {
    const common = {
      ...context,
      基地: row.base,
      产品编码: row.code,
      产品名称: row.name,
      大类: row.category,
      物料组: row.group,
    };
    return [
      {
        ...common,
        粒度: '财年历史',
        历史期间: `${period.start}至${period.end}`,
        自身原始数量: row.historyOwnQuantity,
        自身计算用数量: row.historyOwnCalculationQuantity,
        替换品计算用数量: row.historyReferenceCalculationQuantity,
        替换品编码: row.historyCode,
        替换系数: row.historyFactor === undefined ? 1 : row.historyFactor,
        替换品原始数量: row.historyReferenceQuantity,
        计算用历史数量: row.historyQuantity,
        补0状态: row.historyAudit?.zeroFilled ? '缺失数量补0' : '原始有效数量',
        历史分类: row.historyAudit?.classification,
        历史占比: row.historyShare,
        销售提报占比: row.reportShare,
        历史占比处理: row.historyAudit?.shareZeroed
          ? '最近三个月确认零发货，历史占比归0'
          : row.missing.historyShare.length
            ? '历史占比待核'
            : '按有效历史拆分',
        历史占比调整说明: [
          ...(row.coefficientFallback ?? []).filter((reason) => /^(历史SKU|最近三个)/.test(reason)),
          ...row.missing.historyShare,
        ].join('；'),
        来源状态: `${statusText(row.historyAudit.sourceStatus)}${row.historyAudit.zeroFilled ? '，缺失数量补0' : ''}`,
        实际处理:
          row.historyQuantity === null
            ? '数量或替换依据待补'
            : '保留独立有效数量，缺失数量补0；零分母占比仍待补',
        来源: 'ai_db.agents_scm_cust_deliv_daily_di.act_dl_qty_total',
        原因: reason(row),
      },
      ...(includeMonths
        ? (row.historyAudit?.months ?? []).map((month) => ({
            ...common,
            粒度: '完整历史月',
            历史期间: month.month,
            自身原始数量: month.ownQuantity,
            替换品编码: row.historyCode,
            替换系数: row.historyFactor === undefined ? 1 : row.historyFactor,
            替换品原始数量: month.referenceQuantity,
            原始历史数量: month.quantity,
            历史分类: row.historyAudit.classification,
            来源状态: statusText(month.status),
            实际处理:
              month.quantity === null ? '原始状态保留，不用于无发货分类' : '原始可确认历史用于分类',
            来源: 'ai_db.agents_scm_cust_deliv_daily_di.act_dl_qty_total',
            原因: month.reasons.join('；'),
          }))
        : []),
    ];
  });
}
