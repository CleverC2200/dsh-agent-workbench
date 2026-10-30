import { computeWorkbenchMetrics, workbenchMetricMissingReason } from './metric-model.mjs';
import { directorNames } from './live-presentation.mjs';

export function workbenchCellMissingReason(
  facts,
  { header = '', group = '', row = [], dimension = '', period = 'month' } = {},
) {
  if (!facts) return '系统尚未完成读取：当前数据尚未加载或查询失败，不能判定源表无数据。';
  const label = group + ' ' + header;
  if (['未映射', '归属待补全'].includes(row[0]) && /基地|品项|总监/.test(header)) {
    if (dimension === 'director-performance' && /总监/.test(header))
      return '源数据未提供或归属不唯一：当前周期 agents_scm_execute_detail_hourly_d.director 无完整责任名单；郑州按基地＋material_code匹配，其他基地按基地匹配，未用其他周期负责人替代。';
    if (dimension.startsWith('item'))
      return '源数据未提供或归属冲突：同快照 agents_scm_stock_detail_d.product_item、同周期 agents_order_execute_isontime_mi.pinxiang 未能唯一匹配该SKU；物料组不等于业务品项，未猜测归属。';
    return '源数据未提供：当前记录的 belong_base 为空，无法确定基地归属；记录仍保留在合计内。';
  }
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
  const comparedKey = /环比|同比|上期|去年/.test(header)
    ? period === 'week'
      ? /同比|去年/.test(header)
        ? 'yearWeek'
        : 'previousWeek'
      : /同比|去年/.test(header)
        ? 'yearMonth'
        : 'previousMonth'
    : null;
  const makeFilter = (key) => {
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
        const part = facts.periods[key]?.sections.find((section) => section.id === 'directors');
        const mappings = part
          ? part.status === 'ready'
            ? part.rows
            : []
          : ['month', 'week'].includes(key)
            ? (facts.directors?.rows ?? [])
            : [];
        filter = (item) =>
          (item.base || '未映射') === row[1] && directorNames(mappings, item).includes(row[0]);
      } else
        filter = (item) =>
          (item[field] || (field === 'province' ? item.region : null) || '未映射') === row[0];
      if (dimension.startsWith('base-category'))
        filter = (item) =>
          (item.base || '未映射') === row[0] && (item.category || '未映射') === header;
    }
    return filter;
  };
  const filter = makeFilter(period);
  const formulaOptions = { turnoverScope: dimension.startsWith('item') ? 'item' : 'base' };
  const selected = facts.periods[period];
  if (!name) {
    const stock = selected?.sections.find((section) => section.id === 'stock');
    if (/库存|计划|日均/.test(label) && stock?.status === 'ready')
      return `源数据未提供或未唯一匹配：${header}所需的全部库存、月度计划字段在当前分组为空或粒度重复；不能以0替代。`;
    return '当前字段缺少可核验来源；请核对该字段的发布、关联及当前分组覆盖，未补0。';
  }
  const current = selected ? computeWorkbenchMetrics(selected, filter, formulaOptions) : null;
  if (current?.[name]?.value == null)
    return current?.[name]?.missingReason ?? workbenchMetricMissingReason(selected, name, filter);
  if (/环比|同比|上期|去年/.test(header)) {
    const other = facts.periods[comparedKey];
    const compared = other
      ? computeWorkbenchMetrics(other, makeFilter(comparedKey), formulaOptions)
      : null;
    return `比较期缺少可计算指标：${compared?.[name]?.missingReason ?? workbenchMetricMissingReason(other, name, filter)} 本期有值不代表环比、同比可计算。`;
  }
  return `系统未能生成当前单元格：${name}已有可计算来源，请核对展示映射；未用0掩盖。`;
}
