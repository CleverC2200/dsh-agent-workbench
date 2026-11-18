import { dayOffset, metricNames, metricCalculationVersion, metricPeriodEnd } from './metric-model.mjs';
import { metricSnapshot } from './metric-components.mjs';
import { metricContract } from './metric-definitions.mjs';
import { workbenchEvidence, workbenchMetricDetail } from './live-presentation.mjs';
import { orderMetricGroups } from './metric-groups.mjs';

export function metricDetailsRequest(facts, key, selection, card = {}) {
  if (!metricNames.includes(key)) throw Error('未知指标');
  if (!facts?.periods?.month) throw Error('本期数据尚未返回，请稍后再查看明细');
  if (facts.metricCalculationVersion !== metricCalculationVersion)
    throw Error(`${key}数据口径已更新，请刷新看板后再查询明细`);
  const label =
    key === '周转天数'
      ? '可发货天数'
      : key === '订单满足率'
        ? '满足率'
        : key === '货龄（>60天库存占比）'
          ? '60天及以上货龄占比'
          : key;
  const window = (period) =>
    !period || period.start >= metricPeriodEnd(period, key)
      ? '尚无已结束日期'
      : `${period.start} 至 ${dayOffset(metricPeriodEnd(period, key), -1)}`;
  const comparisonPeriod = (period) =>
    period?.start && metricPeriodEnd(period, key) && period.start < metricPeriodEnd(period, key)
      ? { start: period.start, endExclusive: metricPeriodEnd(period, key) }
      : null;
  const base = facts.base ?? '';
  const scope = base ? 'base' : 'national';
  const current = metricSnapshot(facts.periods.month, key, {
    base,
    turnoverScope: facts.turnoverScope ?? scope,
  });
  const config =
    typeof ORDER_WORKBENCH_APS_CONFIG === 'undefined' ? undefined : ORDER_WORKBENCH_APS_CONFIG;
  const contract = { ...metricContract(key, config, scope), version: metricCalculationVersion };
  const parameters = {
    metric: key,
    start: facts.periods.month.start,
    endExclusive: metricPeriodEnd(facts.periods.month, key),
    base,
    expectedVersion: metricCalculationVersion,
  };
  const compactMetric = (value) => {
    if (!value) return null;
    const { formula, note, coverageNote, sample, ...components } = value;
    return {
      ...components,
      ...(sample ? { sample: { known: sample.known, total: sample.total, unit: sample.unit, coverage: sample.coverage } } : {}),
    };
  };
  const evidence = workbenchEvidence({
    ...facts,
    periods: Object.fromEntries(Object.entries(facts.periods).map(([name, period]) => [
      name, { ...period, end: metricPeriodEnd(period, key), metrics: { [key]: period.metrics[key] } },
    ])),
  });
  evidence.metricContracts = { [key]: contract };
  for (const period of Object.values(evidence.periods)) {
    period.metrics = { [key]: compactMetric(period.metrics[key]) };
  }
  const reasons = [];
  const reasonReference = reason => {
    if (!reason) return reason;
    if (!reasons.includes(reason)) reasons.push(reason);
    return `原因${reasons.indexOf(reason)}`;
  };
  const loadedPeriods = Object.fromEntries(Object.entries(evidence.periods).map(([name, period]) => [
    name, { start: period.start, endExclusive: period.endExclusive, ...period.metrics[key],
      missingReason: reasonReference(period.metrics[key].missingReason),
      population: undefined, periodBasis: undefined, cancellationBoundary: undefined, countMeaning: undefined },
  ]));
  const baseGroups = Object.fromEntries(
    ['month', 'week', 'previousMonth', 'previousWeek', 'yearMonth', 'yearWeek'].filter(name => facts.periods[name]).map(name => {
      const period = facts.periods[name];
      const groups = orderMetricGroups(period, key, {
        base, turnoverScope: facts.turnoverScope ?? scope, dimensions: ['base'],
      });
      groups.contract = { ...metricContract(key, config, groups.calculationScope ?? scope), version: metricCalculationVersion };
      groups.contract.queryBase = base;
      if (groups.availability === 'available') groups.pagination = {
        page: 1, pageSize: groups.rows.length, totalGroups: groups.rows.length, hasMore: false,
        meaning: '页面已加载快照的完整基地分组，不是数据库明细分页或指标排名。',
      };
      return [name, {
        ...groups,
        start: period.start, endExclusive: metricPeriodEnd(period, key),
        total: compactMetric(groups.total),
        rows: groups.rows.map(row => ({ ...row, current: compactMetric(row.current) })),
      }];
    }),
  );
  const groupFields = ['value', 'numerator', 'denominator', 'pending', 'target', 'status', 'missingReason'];
  const comparisonDifference = (current, name, baseLabel, year) => {
    const comparisons = { month: ['previousMonth', 'yearMonth'], week: ['previousWeek', 'yearWeek'] };
    const other = baseGroups[comparisons[name]?.[year ? 1 : 0]];
    const previous = baseLabel === '合计' ? other?.total : other?.rows.find(row => row.base === baseLabel)?.current;
    return Number.isFinite(current.value) && Number.isFinite(previous?.value) ? current.value - previous.value : null;
  };
  const groupValues = (current, name, baseLabel) => [
    ...groupFields.map(field => (field === 'missingReason' ? reasonReference(current[field]) : current[field]) ?? null),
    current.sample?.known ?? null, current.sample?.total ?? null, current.sample?.coverage ?? null,
    current.known ?? null, current.late ?? null, current.provisional,
    comparisonDifference(current, name, baseLabel, false), comparisonDifference(current, name, baseLabel, true),
  ];
  const inlineGroups = {
    columns: ['base', ...groupFields, 'sampleKnown', 'sampleTotal', 'sampleCoverage', 'known', 'late', 'provisional', 'periodDifference', 'yearDifference'],
    periods: Object.fromEntries(Object.entries(baseGroups).map(([name, groups]) => [name, {
      start: groups.start, endExclusive: groups.endExclusive,
      availability: groups.availability, reason: groups.reason,
      rows: groups.rows.map(row => [row.base, ...groupValues(row.current, name, row.base)]),
      total: groups.total ? ['合计', ...groupValues(groups.total, name, '合计')] : null,
      reconciliation: groups.reconciliation,
      pagination: groups.pagination,
      sampleUnit: groups.total?.sample?.unit,
      quantityUnit: groups.total?.quantityUnit,
      pendingUnit: groups.total?.pendingUnit,
    }])),
    scopeNote: Object.values(baseGroups).find(groups => groups.scopeNote)?.scopeNote,
    contract: (() => {
      const grouped = Object.values(baseGroups).find(groups => groups.availability === 'available')?.contract;
      return grouped && { scope: grouped.scope, version: grouped.version, revision: grouped.revision,
        formula: grouped.formula === contract.formula ? '同页面指标口径' : grouped.formula,
        periodBasis: grouped.periodBasis };
    })(),
    reasons,
  };
  const request = {
    text:
      `请使用 operations-order-kpi-details skill，在右侧生成“${label}指标明细”表格。\n当前报告：${selection.label}；本期月累计：${window(facts.periods.month)}；本周：${window(facts.periods.week)}。\n` +
      `本次为卡片点击，保持原有完整展示：本期和本周分别列各基地明细、全国合计、同比及同比差，附分子、分母、待确认、单位和状态，不得缩减为仅全国汇总。以下数据由当前页面同一快照及现有groups计算函数生成，不必再调用gea_page、gea_evidence_read或summary重读同一数据。同版本且availability=available的基地分组直接使用，不重复查询；availability=unavailable、版本不一致、用户要求重新核算或缺必要数据时，才补查对应周期的groups。加载中或缺失的数值不当成0。回答内容、维度和调用要求遵循operations-order-kpi-details Skill；已有数据复用不得删减任何要求。完整回答按五段输出：结论、指标公式、公式字段值、明细表格、证据限制；保留版本及revision、样本/全量和分页说明。严格按Skill展示缺值：表格中null或undefined的计数及数量写“未提供”，指标值写“不可计算”或来源状态；不得直接把null写入单元格。原因编号须按reasons展开为对应中文原因，不以原因0等编号代替解释。读取时间：${facts.readAt ?? '未提供'}；口径版本：${metricCalculationVersion}；范围：${base || '全国'}。\n页面指标快照：${JSON.stringify(loadedPeriods)}\n页面基地分组：${JSON.stringify(inlineGroups)}\n页面指标口径：${JSON.stringify({formula: contract.formula, periodBasis: contract.periodBasis, version: contract.version, revision: contract.revision})}\n` +
      '按Skill核对本期、上期同长度及去年同期；环比分别使用previousMonth和previousWeek。同比必须使用页面 yearMonth（月累计）或 yearWeek（本周）的同长度同期，已有数据直接使用，缺必要数据才查询，沿用相同 metric、base、view、版本和授权范围。补查按contract.grouping.supported使用queries.groups对应的gea_order_kpi view=groups和dimensions，读取groups.contract与每行目标状态；detailsQueryId为空不代表分组未发布。先按维度值过滤并对齐各周期，再分别判断该行分子、分母和待判定；未映射或异常分组单独列示，不得阻断其他分组。环比与同比差直接引用periodDifference及yearDifference（均为本期减对应比较期；率用百分点，天数用天），不得反向相减。合计取groups.total，准交率不相加各组张数；可发货天数的基地与全国计划范围不同，须按scopeNote分别说明，不强行对齐。仅该行确实缺同期数据、分母为0或口径冲突时标记不可计算，有有效同期分子分母必须输出同比差值。' +
      `点击的是${base ? base + '基地汇总卡' : '全国汇总卡'}的本期值，主周期为本期月累计，本周另列。按本次current、contract和queries回答，数值、单位、样本及待判定状态保持原意；旧会话、Skill和知识库不覆盖当前代码口径。明细未发布不等于底表无数据；剔除数未发布不写0。不从汇总编造明细，单页不推断全国分布或原因。独立询问这六项指标时使用gea_order_kpi，其他问题继续使用已授权Cube和知识库。`,
    context: {
      pageId: 'inventory-orderworkbench',
      instance: 'default',
      consumerCode: 'order',
      source: facts.source ?? 'gea-governed-sql',
      mock: false,
      period: { ...selection },
      filters: { dimension: scope, base },
      metricDetails: {
        trigger: 'metric-card',
        skill: 'operations-order-kpi-details',
        metric: key,
        label,
        primaryPeriod: 'month',
        metricCalculationVersion,
        current: {
          ...current,
          target: card.target ?? current.target,
          status: card.status ?? current.status,
        },
        definition: workbenchMetricDetail({ ...facts, selected: 'month' }, key),
        contract,
        baseGroups,
        comparisonPeriods: {
          month: {
            current: comparisonPeriod(facts.periods.month),
            previous: comparisonPeriod(facts.periods.previousMonth),
            year: comparisonPeriod(facts.periods.yearMonth),
          },
          week: {
            current: comparisonPeriod(facts.periods.week),
            previous: comparisonPeriod(facts.periods.previousWeek),
            year: comparisonPeriod(facts.periods.yearWeek),
          },
        },
        queries: {
          groups: { tool: 'gea_order_kpi', parameters: { ...parameters, view: 'groups' } },
          summary: { tool: 'gea_order_kpi', parameters: { ...parameters, view: 'summary' } },
          details: {
            tool: 'gea_order_kpi',
            parameters: { ...parameters, view: 'details', page: 1 },
            scope: '明细分页不代替完整汇总；availability不为available时不编造原始明细。',
          },
        },
      },
      evidence,
    },
  };
  if (request.text.length > 10000) request.text = request.text.replace(
    `页面指标快照：${JSON.stringify(loadedPeriods)}`,
    '页面指标快照：各期分子分母、样本和待确认见下方页面基地分组的total行（按columns读取）；完整快照另存evidence.periods，不得省略内容。',
  );
  if (request.text.length > 10000) request.text = request.text.replace(
    `页面基地分组：${JSON.stringify(inlineGroups)}`,
    '页面基地分组：完整分组保存在metricDetails.baseGroups，按Skill读取后完整回答，不得省略基地或比较期。',
  );
  request.text += '\n本次卡片从ai_db取数，Agent保留gea_order_kpi并从Cube取数。页面快照和基地分组只作为对账证据，不能替代Cube结果；请按本次queries和comparisonPeriods先读取Cube对应周期及分组，再按原Skill完整回答，并核对分子、分母、待确认数量和周期。不以知识库或Cube旧声明覆盖当前contract。';
  request.context.metricDetails.agentSource = 'Cube';
  request.context.metricDetails.cardSource = 'ai_db';
  request.context.metricDetails.agentPrompt = request.text;
  request.displayText = `请生成${base ? base + '基地' : '全国'}${label}指标明细，按原Skill完整展示基地明细、合计及环比同比。\n本期：${window(facts.periods.month)}；本周：${window(facts.periods.week)}。`;
  request.context.metricDetails.displayText = request.displayText;
  return request;
}
