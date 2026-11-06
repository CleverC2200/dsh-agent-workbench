import { shippableDaysState } from './performance-rules.mjs';
export const metricCalculationVersion = 23;
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
    Object.values(facts.periods).every(
      (period) =>
        Array.isArray(period.sections) &&
        period.sections.every((section) => section.status === 'ready'),
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
  const days = new Date(
    Date.UTC(Number(row.stock_date.slice(0, 4)), Number(row.stock_date.slice(5, 7)), 0),
  ).getUTCDate();
  return (Number(sales) + (scope === 'base' ? 0.5 * Number(row.transfer_plan) : 0)) / days;
}
// Nationwide stock and plans are two complete sets, not an intersection of SKUs.
// A missing counterpart contributes no record; a NULL inside an existing source
// remains an error, including after SQL summaries have summed the contributions.
export function nationalStockDays(rows) {
  if (
    !rows.length ||
    rows.some(
      (row) =>
        !finite(row.national_stock_records) ||
        !finite(row.national_plan_records) ||
        !finite(row.national_stock_invalid) ||
        !finite(row.national_plan_invalid) ||
        Number(row.national_stock_invalid) !== 0 ||
        Number(row.national_plan_invalid) !== 0,
    )
  )
    return null;
  const stock = rows.filter((row) => Number(row.national_stock_records) > 0);
  const plans = rows.filter((row) => Number(row.national_plan_records) > 0);
  const inventory = sum(stock, 'national_inventory');
  if (!stock.length || !plans.length || inventory === null || inventory < 0) return null;
  const daily = plans.map((row) =>
    stockDaily({ ...row, sales_plan: row.national_sales_plan }, 'national'),
  );
  if (daily.some((value) => value === null)) return null;
  const demand = daily.reduce((total, value) => total + value, 0);
  return demand > 0 ? inventory / demand : null;
}
export function computeWorkbenchMetrics(
  period,
  filter = () => true,
  { turnoverScope = 'national', ontimeFilter = filter } = {},
) {
  const section = (name) => period.sections.find((section) => section.id === name);
  const rows = (name) =>
    section(name)?.status === 'ready'
      ? section(name).rows.filter(name === 'ontime' ? ontimeFilter : filter)
      : [];
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
      kind === '1'
        ? '按传到OMS的单据新增日期，客户编码＋原订单号去重：锁定期内且接单超过12小时后作废订单数 ÷ O接收订单数（剔除接单后12小时以内、含恰好12小时作废的订单）；缺作废时间不计算'
        : '按日表header_addtime筛选OMS创建周期，按商品明细数量合计、不按订单或SKU种类计数：锁定期内ΣABS(客户要求改单量change_order_qty－有效商品数量) ÷ Σ有效商品数量 ×100%；有效量优先D最后修改量dms_last_update_qty，空时按已核对页面映射取备份order_qty_origin（源字段绑定仍待最终核定）；三个数量全空剔除，其余空按0、真实0有效；整单作废剔除，仅保留detailstatus=10且is_stat=1；交期距创建≤7日按创建+12小时锁定，否则确认到货-7日；以custchangetime判定锁内，不额外限定改单在创建周期内；该时间对SKU实际改量的覆盖仍待核，缺失保留未知',
    );
  }
  const need = sum(orders, 'demand'),
    shortage = sum(orders, 'shortage');
  put(
    '订单满足率',
    !invalid(orders) && need > 0 && shortage !== null && shortage >= 0 && shortage <= need
      ? (1 - shortage / need) * 100
      : null,
    '按履约源表统一的原订单发货业务归属周期，来源单＋客户＋归集产品合并：Σmin(发货量,需求量) ÷ Σ需求量 ×100%；上游exp_flag排除无效订单；不再按商品从物流表重算周期；缺需求或归并冲突不计算',
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
    '按TMS实际到货时间选周期，执行单号去重：准交执行单数 ÷ 已发货执行单数；到货优先目的地GPS围栏、其次到货确认；到货≤max(客户期望、开单确认到货、系统计算到货)+12小时（含边界）为准交；剔除同提货点且双方均工厂仓/工厂外租仓的短拨、海外/国外/港澳大区、未派车、虚拟出库1/2、指定车型及空车型、超时原因14/16；郑州庞丽娟按基地准交率；系统交期缺失但到货≤已有两交期最大值+12小时可严格确认准交；否则保留未知；短拨仓类可由仓库维表唯一补齐，冲突不覆盖',
  );
  const total = sum(ages, 'stock_qty'),
    aged = sum(ages, 'aged_qty');
  put(
    '货龄（>60天库存占比）',
    !invalid(ages) && total > 0 && aged !== null && aged >= 0 && aged <= total
      ? (aged / total) * 100
      : null,
    'Hive货龄快照：工厂仓＋工厂外租仓内 age_days≥60 的 inv_qty ÷ 同范围 inv_qty 合计；周、月均取各自截止日内最新业务日快照，不累计每日库存；非零库存缺货龄时不发布占比',
  );
  put(
    '周转天数',
    turnoverScope !== 'base' && stock.some((row) => 'national_stock_records' in row)
      ? nationalStockDays(stock)
      : !invalid(stock) &&
          sum(stock, 'inventory') !== null &&
          sum(stock, 'inventory') >= 0 &&
          stock.every(
            (row) => Number(row.source_rows) === 1 && stockDaily(row, turnoverScope) !== null,
          ) &&
          stock.reduce((total, row) => total + stockDaily(row, turnoverScope), 0) > 0
        ? sum(stock, 'inventory') /
          stock.reduce((total, row) => total + stockDaily(row, turnoverScope), 0)
        : null,
    '工厂仓＋工厂外租仓现存量 ÷ 同范围计划日均需求；按库存业务日取计划：1—16日初版、17—20日纠偏、21—26日滚动、27日至月底下月初版；分母始终为库存业务日所在月天数；' +
      (turnoverScope === 'base'
        ? '基地日均=(月度需求计划+调拨出库计划×0.5)÷当月天数'
        : '全国及品项日均=月度需求计划÷当月天数；取库存计划表对应初版、纠偏、滚动或下月字段，不以客户需求表allnum替代') +
      '；全国库存与计划独立汇总，不要求商品逐条匹配；负库存按来源原值汇总；源内缺值、负计划、负库存合计或重复计划粒度不计算',
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
        name === '改单率' ? '条候选商品明细' : '张候选订单',
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
      amendment.note += `；有效商品数量分母${denominator}，按现有时间已判定调整量${knownNumerator}，待判定${unknown}条明细、数量差额${unknownQuantity}`;
      if (unknown > 0) {
        amendment.value = (100 * knownNumerator) / denominator;
        amendment.provisional = true;
        amendment.coverageNote = `暂算：现有时间已判定调整量${knownNumerator} ÷ 全量有效商品数量${denominator}；${unknown}条明细待判定，不代表完整改单率。`;
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
    const part = section(id);
    if (part?.status === 'loading')
      for (const name of names)
        Object.assign(result[name], { value: null, note: '正在读取所选周期数据', loading: true });
    else if (part?.status === 'error')
      for (const name of names)
        Object.assign(result[name], { value: null, note: '查询未完成：' + part.code });
    else if (!rows(id).length)
      for (const name of names)
        Object.assign(result[name], {
          value: null,
          noRows: true,
          note: '所选周期及授权范围内无来源数据',
        });
  }
  if (period.start && period.end && period.start >= period.end)
    for (const name of metricNames)
      Object.assign(result[name], { value: null, loading: false, emptyPeriod: true });
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
  const part = period?.sections?.find((section) => section.id === id);
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
  const source = part.rows.filter(filter);
  if (!source.length)
    return `源数据未提供：所选周期及当前授权、分组范围的 ${id} 查询结果无记录；不代表整张表为空。`;
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
    return '源数据未提供或关联冲突：到货周期内部分执行单缺系统交期且已超过已有交期+12小时，或收发仓属性缺失/冲突；不能确认其为准交或逾期。';
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
      return `源数据未提供：agents_scm_execute_detail_hourly_d 在当前分组没有订单计数记录。`;
    if (
      name === '改单率' &&
      selected.some(
        (row) => Number(row.invalid) > 0 || row.numerator == null || row.denominator == null,
      )
    )
      return '改单数量或锁定期依据不足：需客户要求改单量change_order_qty、D最后修改量dms_last_update_qty、调整需求量备份need_qty_origin，以及OMS新增时间header_addtime、开单确认到货requireddeliverytime和实际改量对应的custchangetime；数量空值按已确认规则处理，缺失的改量时间不当作未改单。';
    if (
      selected.some(
        (row) => Number(row.invalid) > 0 || row.numerator == null || row.denominator == null,
      )
    )
      return `源数据未提供或归并冲突：agents_scm_execute_detail_hourly_d 的${name === '作废率' ? '作废时间 canceltime、' : '客户改单时间 custchangetime、'}OMS新增日期、确认交期或原订单标识不完整，无法判断锁定期并按订单去重；未用数量比率替代。`;
    if (selected.reduce((sum, row) => sum + Number(row.denominator ?? 0), 0) === 0)
      return `系统未能计算：当前分组${name === '改单率' ? '有效商品数量' : '有效订单数'}分母为0，不能计算${name}。`;
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
    return '系统未能计算：hive.dw.dwd_scm_material_age_his 当前分组 inv_qty 合计不大于0，货龄占比没有有效分母。';
  return `系统未能计算：${name}的有效分母、数量范围或判定条件不满足；${note || '缺失不补0，零分母不计算比率。'}`;
}
export function metricState(name, value, { base = '' } = {}) {
  if (value === null) return '数据不足';
  if (name === '作废率') return value < 6 ? '健康' : value <= 10 ? '预警' : '严重';
  if (name === '改单率') return value < 2 ? '健康' : value <= 5 ? '预警' : '严重';
  if (name === '订单满足率') return value > 95 ? '健康' : value >= 90 ? '预警' : '严重';
  if (name === '准交率') return value > 98.5 ? '健康' : value >= 94 ? '预警' : '严重';
  if (name === '周转天数') return shippableDaysState(value, base);
  if (name === '货龄（>60天库存占比）') return '当前范围';
  return '判定标准未定义';
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
    previousWeek: { start: dayOffset(week.start, -7), end: dayOffset(week.end, -7), kind: 'week' },
    yearWeek: { start: dayOffset(week.start, -364), end: dayOffset(week.end, -364), kind: 'week' },
  };
}
