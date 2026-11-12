import { metricSection, readySectionRows } from './metric-sections.mjs';
import { metricDefinition } from './metric-definitions.mjs';
import { workbenchMetricState } from './performance-rules.mjs';
export const metricCalculationVersion =
  typeof ORDER_WORKBENCH_METRIC_VERSION === 'undefined' ? 40 : ORDER_WORKBENCH_METRIC_VERSION;
export function retainableWorkbenchFacts(facts) {
  return (
    facts?.attributionVersion === 2 &&
    facts.metricCalculationVersion === metricCalculationVersion &&
    Object.values(facts.periods ?? {}).some(
      (period) =>
        Array.isArray(period?.sections) &&
        period.sections.some((section) => section.status === 'ready'),
    )
  );
}
export function compatibleWorkbenchFacts(facts) {
  return (
    facts?.complete === true &&
    facts.attributionVersion === 2 &&
    facts.metricCalculationVersion === metricCalculationVersion &&
    Object.values(facts.periods ?? {}).length > 0
  );
}
export function reusableWorkbenchFacts(facts) {
  return (
    compatibleWorkbenchFacts(facts) &&
    ['directors', 'customers', 'customerManagers'].every(
      (name) => !facts[name] || facts[name].status === 'ready',
    ) &&
    Object.values(facts.periods).every(
      (period) =>
        Array.isArray(period.sections) &&
        period.sections.every((section) => section.status === 'ready' && !Object.keys(section.metricFailures ?? {}).length),
    )
  );
}
export const metricNames = [
  '作废率',
  '改单率',
  '订单满足率',
  '准交率',
  '货龄（>60天库存占比）',
  '周转天数',
];
export const dayOffset = (day, amount) =>
  new Date(Date.parse(day + 'T00:00:00Z') + amount * 86400000).toISOString().slice(0, 10);
const finite = (value) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const sum = (rows, key) =>
  rows.length && rows.every((row) => finite(row[key]))
    ? rows.reduce((total, row) => total + Number(row[key]), 0)
    : null;
const invalid = (rows, key = 'invalid') =>
  rows.some((row) => !finite(row[key]) || Number(row[key]) !== 0);
export const metricValue = (metrics, name) => metrics?.[name]?.value ?? null;
export function stockDemandDays(row) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.stock_date)) return null;
  const offset = 'plan_month_offset' in row ? row.plan_month_offset : 0;
  if (!finite(offset) || ![0, 1].includes(Number(offset))) return null;
  return new Date(
    Date.UTC(
      Number(row.stock_date.slice(0, 4)),
      Number(row.stock_date.slice(5, 7)) + Number(offset),
      0,
    ),
  ).getUTCDate();
}
export function stockDaily(row, scope = 'national') {
  const sales =
    scope !== 'base' && 'national_plan_records' in row ? row.national_sales_plan : row.sales_plan;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(row.stock_date) ||
    !finite(sales) ||
    (scope !== 'base' && Number(row.national_plan_invalid ?? 0) !== 0) ||
    Number(sales) < 0 ||
    (scope === 'base' && (!finite(row.transfer_plan) || Number(row.transfer_plan) < 0))
  )
    return null;
  const days = stockDemandDays(row);
  if (days === null) return null;
  return (Number(sales) + (scope === 'base' ? 0.5 * Number(row.transfer_plan) : 0)) / days;
}
// Each dimension sums stock and plans independently, not an intersection of SKUs.
// A missing counterpart contributes no record; a NULL inside an existing source
// remains an error, including after SQL summaries have summed the contributions.
export function stockComponents(rows, scope = 'national') {
  if (!rows.some((row) => 'national_stock_records' in row)) {
    const numerator = sum(rows, 'inventory'),
      daily = rows.map((row) => stockDaily(row, scope));
    if (
      invalid(rows) ||
      numerator === null ||
      numerator < 0 ||
      rows.some((row) => Number(row.source_rows) !== 1) ||
      daily.some((value) => value === null)
    )
      return null;
    const denominator = daily.reduce((total, value) => total + value, 0);
    return denominator > 0 ? { numerator, denominator } : null;
  }
  const planInvalid = scope === 'base' ? 'base_plan_invalid' : 'national_plan_invalid';
  if (
    !rows.length ||
    rows.some(
      (row) =>
        !finite(row.national_stock_records) ||
        !finite(row.national_plan_records) ||
        !finite(row.national_stock_invalid) ||
        !finite(row[planInvalid]) ||
        Number(row.national_stock_invalid) !== 0 ||
        Number(row[planInvalid]) !== 0,
    )
  )
    return null;
  const stock = rows.filter((row) => Number(row.national_stock_records) > 0);
  const plans = rows.filter((row) => Number(row.national_plan_records) > 0);
  const inventory = sum(stock, 'national_inventory');
  if (!stock.length || !plans.length || inventory === null || inventory < 0) return null;
  const daily = plans.map((row) =>
    stockDaily(
      {
        ...row,
        sales_plan: row.national_sales_plan,
        transfer_plan: row.base_transfer_plan,
      },
      scope,
    ),
  );
  if (daily.some((value) => value === null)) return null;
  const demand = daily.reduce((total, value) => total + value, 0);
  return demand > 0 ? { numerator: inventory, denominator: demand } : null;
}
function scopedStockDays(rows, scope = 'national') {
  const quantities = stockComponents(rows, scope);
  return quantities ? quantities.numerator / quantities.denominator : null;
}
export function nationalStockDays(rows) {
  return scopedStockDays(rows);
}
export function computeWorkbenchMetrics(
  period,
  filter = () => true,
  { turnoverScope = 'national', ontimeFilter = filter } = {},
) {
  const rows = (name) =>
    readySectionRows(period, name).filter(name === 'ontime' ? ontimeFilter : filter);
  const orders = rows('orders'),
    stock = rows('stock'),
    ages = rows('ages'),
    changes = rows('changes');
  const result = {};
  const put = (name, value, note, unit = '%') => (result[name] = { name, value, unit, note });
  for (const [kind, name] of [
    ['1', '作废率'],
    ['2', '改单率'],
  ]) {
    const selected = changes.filter((row) => String(row.kind) === kind),
      denominator = sum(selected, 'denominator'),
      numerator = sum(selected, 'numerator');
    put(
      name,
      !invalid(selected) &&
        denominator > 0 &&
        numerator !== null &&
        numerator >= 0 &&
        (kind === '2' || numerator <= denominator)
        ? (numerator / denominator) * 100
        : null,
      metricDefinition(name, turnoverScope),
    );
  }
  const need = sum(orders, 'demand'),
    shortage = sum(orders, 'shortage');
  put(
    '订单满足率',
    !invalid(orders) && need > 0 && shortage !== null && shortage >= 0 && shortage <= need
      ? (1 - shortage / need) * 100
      : null,
    metricDefinition('订单满足率', turnoverScope),
  );
  const arrivalRows = rows('ontime'),
    byOrder = new Map();
  for (const row of arrivalRows) {
    const key = JSON.stringify([row.order_no]);
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key).push(row);
  }
  const assessed = [...byOrder.values()];
  const validArrival =
    assessed.length &&
    arrivalRows.every(
      (row) =>
        row.customer && row.order_no && Number(row.invalid) === 0 && [0, 1].includes(row.ontime),
    );
  put(
    '准交率',
    validArrival
      ? (assessed.filter((lines) => lines.every((row) => row.ontime === 1)).length /
          assessed.length) *
          100
      : null,
    metricDefinition('准交率', turnoverScope),
  );
  const total = sum(ages, 'stock_qty'),
    aged = sum(ages, 'aged_qty');
  put(
    '货龄（>60天库存占比）',
    !invalid(ages) && total > 0 && aged !== null && aged >= 0 && aged <= total
      ? (aged / total) * 100
      : null,
    metricDefinition('货龄（>60天库存占比）', turnoverScope),
  );
  put(
    '周转天数',
    scopedStockDays(stock, turnoverScope),
    metricDefinition('周转天数', turnoverScope),
    '天',
  );
  // A partial rate has its own proven numerator/denominator; never reinterpret missing rows as zero.
  const sample = (name, numerator, denominator, known, total, unit) => {
    if (
      result[name].value !== null ||
      !finite(numerator) ||
      !finite(denominator) ||
      denominator <= 0 ||
      numerator < 0 ||
      (name !== '改单率' && numerator > denominator) ||
      !finite(known) ||
      !finite(total) ||
      !Number.isSafeInteger(known) ||
      !Number.isSafeInteger(total) ||
      known <= 0 ||
      known >= total
    )
      return;
    const reason = workbenchMetricMissingReason(period, name, filter);
    result[name].value = (numerator / denominator) * 100;
    const coverage = (known / total) * 100;
    result[name].sample = { known, total, unit, coverage, reason };
    result[name].coverageNote =
      `可判定样本：${known}/${total}${unit}，候选记录覆盖${coverage.toFixed(1)}%；不是全量指标。${reason}`;
    result[name].note += '；' + result[name].coverageNote;
  };
  for (const [kind, name] of [['1', '作废率']]) {
    const selected = changes.filter((row) => String(row.kind) === kind);
    if (
      selected.length &&
      selected.every((row) =>
        ['sample_numerator', 'sample_denominator', 'sample_records', 'records'].every((key) =>
          finite(row[key]),
        ),
      )
    )
      sample(
        name,
        sum(selected, 'sample_numerator'),
        sum(selected, 'sample_denominator'),
        sum(selected, 'sample_records'),
        sum(selected, 'records'),
        '条候选商品明细',
      );
  }
  const amendmentRows = changes.filter((row) => String(row.kind) === '2');
  const amendment = result['改单率'];
  if (
    amendmentRows.length &&
    amendmentRows.every((row) =>
      ['denominator', 'sample_numerator', 'sample_records', 'records', 'unknown_quantity'].every(
        (key) => finite(row[key]),
      ),
    )
  ) {
    const denominator = sum(amendmentRows, 'denominator');
    const knownNumerator = sum(amendmentRows, 'sample_numerator');
    const unknown = sum(amendmentRows, 'records') - sum(amendmentRows, 'sample_records');
    const unknownQuantity = sum(amendmentRows, 'unknown_quantity');
    if (denominator > 0 && knownNumerator >= 0 && unknown >= 0 && unknownQuantity >= 0) {
      amendment.population = {
        denominator,
        knownNumerator,
        unknown,
        unknownQuantity,
        minimumPercent: (100 * knownNumerator) / denominator,
        maximumPercent: (100 * (knownNumerator + unknownQuantity)) / denominator,
      };
      amendment.note += `；有效商品数量分母${denominator}，已确认有效明细调整量${knownNumerator}，待判定${unknown}条明细、数量差额${unknownQuantity}`;
      if (unknown > 0) {
        amendment.value = (100 * knownNumerator) / denominator;
        amendment.provisional = true;
        amendment.coverageNote = `暂算：已确认有效明细调整量${knownNumerator} ÷ 全量有效商品数量${denominator}；${unknown}条明细待判定，不代表完整改单率。`;
        amendment.note += '；' + amendment.coverageNote;
      }
    }
  }
  if (
    orders.length &&
    orders.every((row) =>
      ['sample_demand', 'sample_shortage', 'sample_records', 'records'].every((key) =>
        finite(row[key]),
      ),
    )
  ) {
    const demand = sum(orders, 'sample_demand');
    sample(
      '订单满足率',
      demand - sum(orders, 'sample_shortage'),
      demand,
      sum(orders, 'sample_records'),
      sum(orders, 'records'),
      '个候选原单产品组',
    );
  }
  const judged = assessed.filter((lines) =>
    lines.every(
      (row) =>
        row.customer && row.order_no && Number(row.invalid) === 0 && [0, 1].includes(row.ontime),
    ),
  );
  result['准交率'].counts = {
    onTime: judged.filter((lines) => lines.every((row) => row.ontime === 1)).length,
    total: assessed.length,
    known: judged.length,
    pending: assessed.length - judged.length,
  };
  sample(
    '准交率',
    judged.filter((lines) => lines.every((row) => row.ontime === 1)).length,
    judged.length,
    judged.length,
    assessed.length,
    '张候选到货订单',
  );
  if (result['准交率'].counts.pending > 0) {
    if (result['准交率'].sample) result['准交率'].sample.value = result['准交率'].value;
    result['准交率'].value = (100 * result['准交率'].counts.onTime) / result['准交率'].counts.total;
    result['准交率'].note +=
      '；显示已确认准交数÷全部应统计已发货执行单数；缺失数据的执行单保留在分母，暂不计入准交数，补齐后重算';
  }
  for (const [id, names] of [
    ['orders', ['订单满足率']],
    ['ontime', ['准交率']],
    ['changes', ['作废率', '改单率']],
    ['stock', ['周转天数']],
    ['ages', ['货龄（>60天库存占比）']],
  ]) {
    for (const name of names) {
      const part = metricSection(period, id, name);
      if (part?.status === 'loading')
        Object.assign(result[name], {
          value: null,
          note: '正在读取所选周期数据',
          loading: true,
        });
      else if (part?.status === 'error')
        Object.assign(result[name], {
          value: null,
          note: '查询未完成：' + part.code,
        });
      else if (!(part?.rows ?? []).filter(id === 'ontime' ? ontimeFilter : filter).filter(row => id !== 'changes' || String(row.kind) === (name === '作废率' ? '1' : '2')).length)
        Object.assign(result[name], {
          value: null,
          noRows: true,
          note: '所选周期及授权范围内无来源数据',
        });
    }
  }
  if (period.start && period.end && period.start >= period.end)
    for (const name of metricNames)
      Object.assign(result[name], {
        value: null,
        loading: false,
        emptyPeriod: true,
      });
  for (const name of metricNames)
    if (result[name]?.value == null) {
      result[name].missingReason = workbenchMetricMissingReason(
        period,
        name,
        filter,
        result[name].note,
      );
      if (period.start >= period.end && !period.sections.length)
        result[name].note = result[name].missingReason;
    }
  return result;
}
export function workbenchMetricMissingReason(period, name, filter = () => true, note = '') {
  if (period?.start && period?.end && period.start >= period.end)
    return '当前周期尚无已结束日期：按已结束日期统计，暂不计算本周期指标；不是数据仍在加载。';
  const id = ['作废率', '改单率'].includes(name)
    ? 'changes'
    : name === '周转天数'
      ? 'stock'
      : name === '货龄（>60天库存占比）'
        ? 'ages'
        : name === '准交率'
          ? 'ontime'
          : 'orders';
  const part = metricSection(period, id, name);
  if (
    period &&
    period.start >= period.end &&
    Array.isArray(period.sections) &&
    !period.sections.length
  )
    return '本周期暂无已结束统计日：订单按T-1累计，当前区间起止相同，未发起空区间查询。不是仍在加载，也不代表整张源表无数据；库存指标仍需筛选内的有效快照，缺失保持未知，不用其他周期替代。';
  if (!part || part.status === 'loading')
    return '系统尚未完成读取：所选周期数据未加载完成，暂不能判定源表缺数据。';
  if (part.status !== 'ready')
    return `系统读取未成功：${part.code ?? part.status}；${part.detail ? part.detail + '；' : ''}需核对查询或字段发布，不是0。`;
  const source = part.rows.filter(filter).filter(row =>
    id !== 'changes' || String(row.kind) === (name === '作废率' ? '1' : '2'));
  if (!source.length)
    return `源数据未提供：所选周期及当前授权、分组范围的 ${id} 查询结果无记录；不代表整张表为空。`;
  if (name === '周转天数' && source.some((row) => 'national_stock_records' in row)) {
    if (!source.some((row) => Number(row.national_stock_records) > 0))
      return '源数据未提供：当前维度没有工厂仓＋工厂外租仓现存量记录；未按0库存计算。';
    if (!source.some((row) => Number(row.national_plan_records) > 0))
      return '源数据未提供：当前维度没有对应版本的月度计划记录；未按0需求计算。';
    if (
      source.some(
        (row) =>
          Number(row.national_stock_invalid) > 0 ||
          Number(row.national_plan_invalid) > 0 ||
          Number(row.base_plan_invalid) > 0,
      )
    )
      return '系统未能计算：来源内的现存量、月度需求或调拨计划缺失，或计划为负数、存在重复粒度；不是商品跨表未匹配导致的空值。';
    return '系统未能计算：当前维度的快照日期、现存量合计或计划日均需求无效；日均需求为0时不计算天数。';
  }
  if (name === '订单满足率' && source.some((row) => Number(row.missing_ship_date) > 0))
    return (
      '源数据未提供或未唯一匹配：部分来源单＋客户＋产品没有完整匹配最后拆单实际发货日期；' +
      (source.every((row) =>
        ['unmatched_order', 'missing_trace', 'missing_ship_time'].every((key) => finite(row[key])),
      )
        ? `原单/产品关联未唯一匹配${sum(source, 'unmatched_order')}组（agents_order_execute_isontime_mi.fromorderno/cust_code/new_material_code → agents_scm_execute_detail_hourly_d.cust_order_no/cust_code/material_code）；穿透记录缺失${sum(source, 'missing_trace')}组（executeorderno＋cust_code → agents_scm_order_trace_final_di）；发货时间空值或版本冲突${sum(source, 'missing_ship_time')}组（lastshipmenttime/update_time）。`
        : '') +
      '无法完整归属发货周期；未以接单日期或加载时间替代。'
    );
  if (name === '准交率' && source.some((row) => Number(row.invalid) > 0 || row.ontime == null))
    return '源数据未提供或关联冲突：到货周期内部分执行单缺系统交期且已达到已有交期+对应客户类型的18/12小时，或客户类型时限冲突、收发仓属性缺失/冲突；不能确认其为准交或逾期。';
  if (
    name === '周转天数' &&
    source.some((row) => row.source_rows === null || row.inventory === null)
  )
    return '源数据未提供或未对齐：工厂仓＋工厂外租仓的部分商品缺少同日库存或月度计划匹配；未把缺失库存、计划当作0，暂不能发布完整可发货天数。';
  const fields =
    name === '订单满足率'
      ? ['demand', 'shortage']
      : name === '准交率'
        ? ['ontime']
        : name === '周转天数'
          ? ['inventory']
          : name === '货龄（>60天库存占比）'
            ? ['stock_qty', 'aged_qty']
            : ['numerator', 'denominator'];
  const absent = fields.filter((field) => source.some((row) => row[field] == null));
  // Existing zero policies are retained; a known zero denominator is a calculation condition.
  if (absent.length && !['作废率', '改单率'].includes(name))
    return `源数据未提供：计算${name}需要的 ${absent.join('、')} 存在空值；${note}`;
  if (source.some((row) => Number(row.source_rows) > 1))
    return `系统未能计算：同一统计粒度存在重复记录，不能直接加总；${note}`;
  const total = (field) => source.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
  if (['作废率', '改单率'].includes(name)) {
    const selected = source.filter((row) => String(row.kind) === (name === '作废率' ? '1' : '2'));
    if (!selected.length)
      return name === '改单率'
        ? '当前统计周期没有可归属的有效商品数量记录：按日表order_close_time订单关单时间筛选；缺时间不以OMS新增、WMS关单或轨迹装车时间替代。'
        : '源数据未提供：agents_scm_execute_detail_hourly_d 在当前分组没有商品数量统计记录。';
    if (
      name === '改单率' &&
      selected.some(
        (row) => Number(row.invalid) > 0 || row.numerator == null || row.denominator == null,
      )
    )
      return '改单数量或有效明细标识不足：需客户要求改单量change_order_qty、D最后修改量dms_last_update_qty、调整需求量备份need_qty_origin及完整的客户、原订单、商品和订单状态；客户要求量为空或负值不计分子，真实0保留；不要求交期或改单时间。';
    if (
      selected.some(
        (row) => Number(row.invalid) > 0 || row.numerator == null || row.denominator == null,
      )
    )
      return '作废商品数量或统计范围依据不足：需dms_last_update_qty、change_order_qty或need_qty_origin，以及OMS新增时间header_addtime、作废时间canceltime、OMS最晚发车时间latestsendcardate和执行商品行标识；收发仓的工厂仓属性及仓库主数据“归属工厂提货点”关系也须可核实；归属关系取已确认的agents_scm_material_in_out_summary_d.pickup_point穿透数据，按仓库编码唯一映射，不用自身提货点；缺失或冲突仍保留未知。发货仓为*且有效数量已知大于0时，只有穿透表最新版本的客户、原订单、执行单及收货仓匹配，且发货仓完整唯一，才回补deliver_wh；不使用较旧版本覆盖最新空值。仍缺发货仓（空或*）时，取订单pickup_point，与收货仓归属工厂提货点比较；仓类取订单warehouse_classify，兼容编码及日表中文名称；两点不同即可排除短拨，同点仍须核实双方工厂仓/外租仓属性。真实0保留，缺失数量、冲突商品行或未判定短拨不当作0。';
    if (selected.reduce((sum, row) => sum + Number(row.denominator ?? 0), 0) === 0)
      return `系统未能计算：当前分组有效商品数量分母为0，不能计算${name}。`;
  }
  if (name === '订单满足率' && total('demand') === 0)
    return '系统未能计算：agents_order_execute_isontime_mi 当前分组需求量合计为0，订单满足率没有有效分母。';
  if (name === '周转天数' && source.some((row) => stockDaily(row) === null))
    return '系统未能计算：库存快照日期、月度需求计划或数量格式无效，无法换算计划日均需求。';
  if (
    name === '周转天数' &&
    source.reduce((sum, row) => sum + Number(stockDaily(row) ?? 0), 0) <= 0
  )
    return '系统未能计算：同范围月度计划日均需求合计不大于0，可发货天数没有有效分母。';
  if (name === '货龄（>60天库存占比）' && total('stock_qty') <= 0)
    return '系统未能计算：agents_scm_stock_detail_d 当前分组 current_stock 合计不大于0，货龄占比没有有效分母。';
  return `系统未能计算：${name}的有效分母、数量范围或判定条件不满足；${note || '缺失不补0，零分母不计算比率。'}`;
}
export function metricState(name, value, { base = '' } = {}) {
  return workbenchMetricState(name, value, base);
}
export function metricDelta(current, previous, name) {
  const a = metricValue(current, name),
    b = metricValue(previous, name);
  return a === null || b === null
    ? '—'
    : `${a - b >= 0 ? '+' : ''}${(a - b).toFixed(2)}${name === '周转天数' ? '天' : '%'}${current?.[name]?.sample || previous?.[name]?.sample || current?.[name]?.provisional || previous?.[name]?.provisional ? '*' : ''}`;
}

export function metricComparisonNote(current, previous, name) {
  if (current?.[name]?.provisional || previous?.[name]?.provisional)
    return '暂算值之差，不代表完整指标同比或环比。';
  if (!current?.[name]?.sample && !previous?.[name]?.sample) return '';
  return `样本差，不代表全量同比或环比。本期：${metricCoverageSummary(current?.[name])}；比较期：${metricCoverageSummary(previous?.[name])}。`;
}

export function metricCoverageSummary(metric) {
  if (metric?.provisional) return metric.coverageNote;
  const sample = metric?.sample;
  return sample
    ? `可判定样本${sample.known}/${sample.total}${sample.unit}，覆盖${sample.coverage.toFixed(1)}%`
    : metric?.value == null
      ? '无有效数据'
      : '完整可判定范围';
}
export function reportPeriods(start, end, now = new Date()) {
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const limit = end < today ? end : today;
  const monthStart = start.slice(0, 7) + '-01';
  const monthEnd = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 1))
    .toISOString()
    .slice(0, 10);
  const monthly = start === monthStart && end === monthEnd;
  const last = dayOffset(limit, -1);
  const date = new Date(last + 'T00:00:00Z');
  const weekStart = monthly ? dayOffset(last, -((date.getUTCDay() + 6) % 7)) : start;
  const inventoryEnd = end < dayOffset(today, 1) ? end : dayOffset(today, 1);
  const month = { start: monthStart, end: limit, inventoryEnd, kind: 'month' },
    week = { start: weekStart, end: limit, inventoryEnd, kind: 'week' };
  const monthBack = (period, count) => {
    const d = new Date(period.start + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() - count);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      .toISOString()
      .slice(0, 10);
    const s = d.toISOString().slice(0, 10),
      e = dayOffset(s, Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86400000));
    return { start: s, end: e < next ? e : next, kind: 'month' };
  };
  return {
    selected: monthly ? 'month' : 'week',
    month,
    previousMonth: monthBack(month, 1),
    yearMonth: monthBack(month, 12),
    week,
    previousWeek: {
      start: dayOffset(week.start, -7),
      end: dayOffset(week.end, -7),
      kind: 'week',
    },
    yearWeek: {
      start: dayOffset(week.start, -364),
      end: dayOffset(week.end, -364),
      kind: 'week',
    },
  };
}
