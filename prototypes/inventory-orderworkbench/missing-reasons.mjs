import { computeWorkbenchMetrics, workbenchMetricMissingReason } from './metric-model.mjs';

export function workbenchCellMissingReason(
  facts,
  { header = '', group = '', row = [], dimension = '', period = 'month' } = {},
) {
  if (!facts) return '系统尚未完成读取：当前数据尚未加载或查询失败，不能判定源表无数据。';
  const label = group + ' ' + header;
  const name =
    dimension === 'base-category-days'
      ? '周转天数'
      : dimension === 'base-category'
        ? '订单满足率'
        : /满足率/.test(label)
          ? '订单满足率'
          : /准交/.test(label)
            ? '准交率'
            : /货龄|60天/.test(label)
              ? '货龄（>60天库存占比）'
              : /可发货|周转/.test(label)
                ? '周转天数'
                : /改单/.test(label)
                  ? '改单率'
                  : /作废/.test(label)
                    ? '作废率'
                    : null;
  if (/剔除大日期/.test(label))
    return '源数据未提供：尚无同范围、同单位且可核对的大日期扣减依据，未用普通库存替代。';
  let filter = () => true;
  if (row[0] !== '合计') {
    const field = dimension.startsWith('base')
      ? 'base'
      : dimension.startsWith('item')
        ? 'item'
        : dimension === 'region-change'
          ? 'province'
          : 'category';
    if (dimension === 'director-performance') {
      const keys = new Set(
        (facts.directors?.rows ?? [])
          .filter(
            (item) =>
              item.base === row[1] &&
              Number(item.names) === 1 &&
              String(item.director)
                .split(/[,，、]/)
                .includes(row[0]),
          )
          .map((item) => JSON.stringify([item.base, item.sku])),
      );
      filter = (item) => keys.has(JSON.stringify([item.base, item.sku]));
    } else
      filter = (item) =>
        (item[field] || (field === 'province' ? item.region : null) || '未映射') === row[0];
    if (dimension.startsWith('base-category'))
      filter = (item) =>
        (item.base || '未映射') === row[0] && (item.category || '未映射') === header;
  }
  const selected = facts.periods[period];
  if (!name) {
    const stock = selected?.sections.find((section) => section.id === 'stock');
    if (/库存|计划|日均/.test(label) && stock?.status === 'ready')
      return `源数据未提供或未唯一匹配：${header}所需的库存、滚动计划字段在当前分组为空或粒度重复；不能以0替代。`;
    return '当前字段缺少可核验来源；请核对该字段的发布、关联及当前分组覆盖，未补0。';
  }
  const current = selected ? computeWorkbenchMetrics(selected, filter) : null;
  if (current?.[name]?.value == null)
    return current?.[name]?.missingReason ?? workbenchMetricMissingReason(selected, name, filter);
  if (/环比|同比|上期|去年/.test(header)) {
    const other =
      facts.periods[
        period === 'week'
          ? /同比|去年/.test(header)
            ? 'yearWeek'
            : 'previousWeek'
          : /同比|去年/.test(header)
            ? 'yearMonth'
            : 'previousMonth'
      ];
    const compared = other ? computeWorkbenchMetrics(other, filter) : null;
    return `比较期缺少可计算指标：${compared?.[name]?.missingReason ?? workbenchMetricMissingReason(other, name, filter)} 本期有值不代表环比、同比可计算。`;
  }
  return `系统未能生成当前单元格：${name}已有可计算来源，请核对展示映射；未用0掩盖。`;
}
