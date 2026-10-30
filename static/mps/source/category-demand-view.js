import { buildCategoryDemand } from './category-demand.js';

export function createCategoryDemand(react, { table, downloadCsv, categories, useMpsPart }) {
  const h = react.createElement;
  const columns = [
    '大类',
    '月份',
    '历史平均环比',
    '环比链',
    '① 环比法',
    '同期平均占比',
    '② 占比法',
    '加权',
    '大类预估需求数量',
  ];
  return function CategoryDemand({ draft, active }) {
    const result = react.useMemo(() => buildCategoryDemand(draft, categories), [draft]);
    const rows = result.rows.map((row, index) => ({
      大类: row.category,
      月份: `${row.month}（M+${(index % 4) + 1}）`,
      历史平均环比: row.mom ?? '',
      环比链: row.chain ?? '',
      '① 环比法': row.momMethod ?? '',
      同期平均占比: row.share ?? '',
      '② 占比法': row.shareMethod ?? '',
      加权: row.weighted ?? '',
      大类预估需求数量: row.quantity ?? '',
    }));
    const summary = result.bases.map((basis) => ({
      大类: basis.category,
      ...Object.fromEntries(
        result.rows
          .filter((row) => row.category === basis.category)
          .map((row, index) => [
            `M+${index + 1}`,
            row.quantity === null
              ? ''
              : new Intl.NumberFormat('zh-CN', {
                  maximumFractionDigits: 0,
                  useGrouping: false,
                }).format(row.quantity),
          ]),
      ),
      人工调整: '权限与调整合同待确认',
    }));
    useMpsPart(react, 'category-demand', result, '大类逐月需求计算', active);
    return h(
      react.Fragment,
      {},
      h(
        'section',
        { 'aria-label': '逐月测算', className: 'dc-card dc-results' },
        h(
          'div',
          { className: 'dc-card-head' },
          h('h3', {}, '逐月测算（到大类预估需求数量）'),
          h(
            'span',
            { className: 'dc-card-note' },
            `${result.rows.filter((row) => row.quantity !== null).length} / ${rows.length} 项可计算 · 单位：件`,
          ),
          h(
            'button',
            { onClick: () => downloadCsv(`大类逐月测算-${draft.month}.csv`, columns, rows) },
            '下载测算明细',
          ),
        ),
        table(columns, rows),
        h(
          'div',
          { className: 'dc-card-foot' },
          'M+1、M+2按（环比法＋占比法）÷2÷计划达成率；M+3、M+4按上月需求×年度分月环比延展。同比与环比为系数；缺三年完整历史、零分母或依赖数据时留空。展示取整数，计算及下载保留原精度。',
        ),
      ),
      h(
        'section',
        { 'aria-label': '大类预估需求数量', className: 'dc-card dc-results' },
        h(
          'div',
          { className: 'dc-card-head' },
          h('h3', {}, '大类预估需求数量'),
          h('span', { className: 'dc-card-note' }, 'M+1为评估月份；M+4只到大类，人工调整尚未接入'),
        ),
        table(['大类', 'M+1', 'M+2', 'M+3', 'M+4', '人工调整'], summary),
      ),
    );
  };
}
