import { call } from '../../../business/shared/channel.js';
import { createQueryClient } from '../../../business/shared/configured-query-client.mjs';
import { normalizedMonth, sourceMonthValues } from './master-data.js';

const text = (value) => {
  if (value === null) return '';
  if (typeof value !== 'string') throw Error('新来源返回了无效文本字段');
  return value;
};
const decimal = (value) => {
  if (value === null) return '';
  if (
    !['string', 'number'].includes(typeof value) ||
    (typeof value === 'string' && !/^-?\d+(\.\d+)?$/.test(value)) ||
    !Number.isFinite(Number(value)) ||
    (typeof value === 'number' && Math.abs(value) > Number.MAX_SAFE_INTEGER)
  )
    throw Error('新来源返回了无效数值');
  return value;
};
const quantity = (value) => {
  const parsed = decimal(value);
  if (parsed === '') return '';
  if (Math.abs(Number(parsed)) > Number.MAX_SAFE_INTEGER) throw Error('预测数量超出可靠计算范围');
  const canonical = (value) =>
    String(value)
      .replace(/^(-?)0+(?=\d)/, '$1')
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, '')
      .replace(/^-?0$/, '0');
  if (typeof parsed === 'string' && canonical(Number(parsed)) !== canonical(parsed))
    throw Error('预测数量超出可靠计算精度');
  return Number(parsed);
};
const sourceCount = (row) => {
  const count = Number(row.source_rows);
  if (!Number.isSafeInteger(count) || count < 1) throw Error('缺少来源记录计数');
  return count;
};
const monthOffset = (month, offset) => {
  const date = new Date(month + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
};
const countsBy = (rows, key) => {
  const counts = new Map();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + sourceCount(row));
  return counts;
};
const tableMonth = (value) => {
  const source = text(value);
  const compact = /^(\d{4})(0[1-9]|1[0-2])$/.exec(source);
  const slash = /^(\d{4})\/(0?[1-9]|1[0-2])\/0?1$/.exec(source);
  return (
    normalizedMonth(source) ??
    (compact
      ? `${compact[1]}-${compact[2]}`
      : slash
        ? `${slash[1]}-${slash[2].padStart(2, '0')}`
        : null)
  );
};
export function sourceTableParameters(kind, month) {
  const months = sourceMonthValues(month);
  if (kind === 'forecast')
    return { month, source_month: `${month.slice(0, 4)}/${Number(month.slice(5))}/1` };
  if (kind === 'delivery') return { months: [...months, month.replace('-', '')] };
  throw Error('未知月主计划来源');
}
export function forecastRows(rows, month) {
  sourceMonthValues(month);
  const key = (row) =>
    JSON.stringify([tableMonth(row.stat_month), row.belong_base, row.material_code]);
  const counts = countsBy(rows, key);
  return rows.flatMap((row) => {
    if (tableMonth(row.stat_month) !== month) throw Error('预测来源批次与请求月份不一致');
    const base = text(row.belong_base),
      code = text(row.material_code);
    const count = counts.get(key(row));
    const issue =
      !base.trim() || !code.trim()
        ? '缺基地或物料编码'
        : count > 1
          ? '同批次基地物料重复，未合计'
          : '';
    const current = quantity(row.current_month_forecast_qty),
      next = quantity(row.next_month_forecast_qty);
    return [current, next].map((value, offset) => ({
      月份: monthOffset(month, offset),
      基地: base,
      产品编码: code,
      产品名称: text(row.material_name),
      大类: '',
      系列: '',
      物料组: '',
      数量: issue ? '' : value,
      预测批次: month,
      源批次月份: text(row.stat_month),
      源当月预测数量: decimal(row.current_month_forecast_qty),
      源下一月预测数量: decimal(row.next_month_forecast_qty),
      源记录数: sourceCount(row),
      缺项原因: issue || (value === '' ? '预测数量缺失' : ''),
    }));
  });
}
export function forecastDimensions(rows, products) {
  return rows.map((row) => {
    const matches = products.filter(
      (p) =>
        p['产品编码'] &&
        p['产品编码'] === row['产品编码'] &&
        (!p['基地'] || p['基地'] === row['基地']),
    );
    if (matches.length !== 1)
      return {
        ...row,
        缺项原因: [
          row['缺项原因'],
          matches.length ? '产品编码对应多条主数据，分类留空' : '产品编码未匹配主数据，分类留空',
        ]
          .filter(Boolean)
          .join('；'),
      };
    return {
      ...row,
      ...Object.fromEntries(['大类', '系列', '物料组'].map((name) => [name, matches[0][name]])),
    };
  });
}
export const deliveryColumns = {
  dimension_type: '维度类型',
  stat_month: '源月份',
  belong_base: '基地',
  dimension_value: '维度值',
  product_name: '产品名称',
  dimension_act_dl_qty: '月发货数量',
  fiscal_year: '财年',
  national_dimension_fiscal_act_dl_qty: '全国维度财年发货数量',
  dimension_act_dl_qty_rate: '月发货占财年比例',
  last_year_stat_month: '上年同期月份',
  last_year_dimension_act_dl_qty: '上年同期发货数量',
  year_on_year_act_dl_qty: '同比数量差额',
  year_on_year_rate: '同比增长率',
  last_month_stat_month: '上月月份',
  last_month_dimension_act_dl_qty: '上月发货数量',
  month_on_month_act_dl_qty: '环比数量差额',
  month_on_month_rate: '环比增长率',
};
const deliveryText = new Set([
  'dimension_type',
  'stat_month',
  'belong_base',
  'dimension_value',
  'product_name',
  'fiscal_year',
  'last_year_stat_month',
  'last_month_stat_month',
]);
export function deliveryRows(rows, month) {
  sourceMonthValues(month);
  const key = (row) =>
    JSON.stringify([
      row.dimension_type,
      tableMonth(row.stat_month),
      row.belong_base,
      row.dimension_value,
    ]);
  const counts = countsBy(rows, key);
  return rows.map((row) => {
    if (tableMonth(row.stat_month) !== month) throw Error('发货指标来源月份与请求不一致');
    const complete = [row.dimension_type, row.belong_base, row.dimension_value].every(
      (value) => typeof value === 'string' && value.trim(),
    );
    return {
      月份: month,
      ...Object.fromEntries(
        Object.entries(deliveryColumns).map(([field, name]) => [
          name,
          deliveryText.has(field) ? text(row[field]) : decimal(row[field]),
        ]),
      ),
      源记录数: sourceCount(row),
      粒度状态: !complete
        ? '关键维度缺失'
        : counts.get(key(row)) > 1
          ? '业务键重复，仅保留源值'
          : '唯一',
    };
  });
}
export async function readSourceTable(kind, month, signal) {
  const parameters = sourceTableParameters(kind, month);
  const element = document.getElementById('agent-sql-config');
  if (!element) throw Error('月主计划数据源尚未装载');
  const config = JSON.parse(element.textContent);
  const client = createQueryClient(config, (_request, options) =>
    call(
      'sql',
      { queryId: options.queryId, parameters: options.values },
      { signal: options.signal },
    ),
  );
  const definition = config.queries[kind + '.detail'];
  const result = await client.readAll(
    kind + '.detail',
    {
      ...parameters,
      page_size: 200,
      offset: 0,
    },
    { signal, keyFields: definition.grain, requiredColumns: definition.columns, maxRows: 100000 },
  );
  return {
    rows: kind === 'forecast' ? forecastRows(result.rows, month) : deliveryRows(result.rows, month),
    metadata: {
      period: month,
      source:
        kind === 'forecast'
          ? 'agents_scm_sales_forecast_mi'
          : 'agents_scm_base_dimension_delivery_mi',
      total: result.rows.length,
      configVersion: result.configVersion,
      units: 'unconfirmed',
    },
  };
}
