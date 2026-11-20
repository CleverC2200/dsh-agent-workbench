import { growthAnomaly } from 'dsh-agent-manage/mps-compute/category-demand';

export function growthSourceAnomalies(rows) {
  const number = (value) => (value === '' || value == null ? null : Number(value));
  return rows.flatMap((row) =>
    [
      ['同比', '同比增长率', '上年同期发货数量'],
      ['环比', '环比增长率', '上月发货数量'],
    ].flatMap(([metric, field, baseline]) => {
      const rawRate = number(row[field]);
      const denominator = number(row[baseline]);
      const reason = growthAnomaly(rawRate, denominator);
      return reason
        ? [
            {
              month: row['月份'],
              metric,
              dimension: row['维度类型'],
              base: row['基地'],
              category: row['维度值'],
              quantity: row['月发货数量'],
              denominator,
              rawRate,
              reason,
              handling: '保留源值供核对',
            },
          ]
        : [];
    }),
  );
}
const columns = [
  '评估版本',
  '月份',
  '指标',
  '维度类型',
  '基地',
  '大类或维度值',
  '当前数量',
  '基期数量',
  '原增长率',
  '采用增长率',
  '计算倍率',
  '采用月份',
  '异常原因',
  '处理说明',
];
export function createGrowthAnomalyReport(react, { table, downloadCsv }) {
  const h = react.createElement;
  return function GrowthAnomalyReport({ draft, anomalies }) {
    if (!anomalies.length) return null;
    const rows = anomalies.map((row) => ({
      评估版本: draft.name,
      月份: row.month,
      指标: row.metric,
      维度类型: row.dimension ?? '全国大类测算',
      基地: row.base ?? '',
      大类或维度值: row.category,
      当前数量: row.quantity,
      基期数量: row.denominator,
      原增长率: row.rawRate,
      采用增长率: row.usedRate,
      计算倍率: row.appliedRatio,
      采用月份: row.samples?.join('、') ?? '',
      异常原因: row.reason,
      处理说明: row.handling,
    }));
    return h(
      'details',
      { className: 'dc-card', 'aria-label': '同比环比异常报告' },
      h('summary', null, `同比环比异常报告（${rows.length}条）`),
      h(
        'button',
        {
          type: 'button',
          onClick: () => downloadCsv(`${draft.month}-同比环比异常.csv`, columns, rows),
        },
        '下载同比环比异常报告',
      ),
      rows.length > 25 &&
        h('p', { className: 'dc-muted' }, '预览前25条，下载包含当前范围全部异常。'),
      table(columns, rows.slice(0, 25)),
    );
  };
}
