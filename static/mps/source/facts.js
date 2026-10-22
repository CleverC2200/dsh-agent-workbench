import { call } from '../../../business/shared/channel.js';
import { createQueryClient } from '../../../business/shared/configured-query-client.mjs';

const number = (value) => {
  if (value === null) return '';
  if (
    !['number', 'string'].includes(typeof value) ||
    String(value).trim() === '' ||
    !Number.isFinite(Number(value)) ||
    Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER
  )
    throw Error('事实来源返回了无效数量');
  return Number(value);
};
const text = (value) => {
  if (value === null) return '';
  if (typeof value !== 'string') throw Error('事实来源返回了无效维度');
  return value;
};
export async function readFactMonth(type, month, signal) {
  if (!['report', 'history'].includes(type)) throw Error('该事实来源尚未接入');
  return readFacts('facts.' + type, { month: month + '-01' }, signal, type, month);
}
async function readFacts(id, parameters, signal, type, month) {
  const element = document.getElementById('agent-sql-config');
  if (!element) throw Error('月主计划数据源尚未装载');
  const config = JSON.parse(element.textContent);
  const definition = config.queries[id];
  const client = createQueryClient(config, (_request, options) =>
    call(
      'sql',
      {
        queryId: options.queryId,
        parameters: options.values,
      },
      { signal: options.signal },
    ),
  );
  const rows = [],
    seen = new Set(),
    warnings = [];
  let total,
    version,
    signature,
    partial = false;
  for (let offset = 0; total === undefined || offset < total; offset += 200) {
    const result = await client.read(
      id,
      { ...parameters, page_size: 200, offset },
      {
        signal,
        requiredColumns: definition.columns,
      },
    );
    if (total === undefined) {
      total = result.totalRowCount;
      version = result.configVersion;
      signature = JSON.stringify(result.returnedColumns);
    }
    if (!Number.isSafeInteger(total) || total < 0 || total > 100000)
      throw Error('事实读取范围超过上限或缺少完整计数');
    if (
      result.totalRowCount !== total ||
      result.configVersion !== version ||
      JSON.stringify(result.returnedColumns) !== signature ||
      result.offset !== offset ||
      result.rows.length !== Math.min(200, total - offset) ||
      result.hasMorePages !== offset + result.rows.length < total
    )
      throw Error('事实分页或配置发生变化，未采用不完整结果，请重新同步');
    for (const row of result.rows) {
      const key = JSON.stringify(definition.grain.map((field) => row[field]));
      if (seen.has(key)) throw Error('事实分页出现重复业务键，未采用不完整结果');
      seen.add(key);
      rows.push(row);
    }
    partial ||= result.dataStatus === 'partial';
    warnings.push(...(result.warnings ?? []));
  }
  if (type === 'shipment')
    return { rows, metadata: { partial, warnings, total, configVersion: version, ...parameters } };
  const prefix =
    type === 'report' ? 'agents_sales_plan_demand_m.' : 'agents_scm_cust_deliv_daily_di.';
  const records = rows.map((row) => {
    const value = (name) => row[prefix + name];
    const base = text(value('belong_base'));
    const code = text(value('material_code'));
    return {
      月份: month,
      基地: base,
      产品编码: code,
      产品名称: type === 'history' ? text(value('material_name')) : '',
      大类: type === 'history' ? text(value('product_categ_name')) : '',
      系列: '',
      物料组: type === 'history' ? text(value('material_group_name')) : '',
      ...(type === 'report'
        ? {
            月初数量: base && code ? number(value('plannum_total')) : '',
            纠偏数量: base && code ? number(value('allnum_total')) : '',
          }
        : {
            数量: number(value('act_dl_qty_total')),
            含赠品数量: number(value('act_dl_qty_all_total')),
            不含税收入: number(value('income_excl_tax_local_total')),
          }),
    };
  });
  return {
    rows: records,
    metadata: { period: month, partial, warnings, total, configVersion: version },
  };
}

export async function readShipmentRange(start, end, signal) {
  const valid = (value) =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end) || start > end || start.slice(0, 7) !== end.slice(0, 7))
    throw Error('实际发货须限定同月有效截止期间');
  const result = await readFacts('facts.shipment', { start, end }, signal, 'shipment');
  const prefix = 'agents_scm_cust_deliv_daily_di.';
  return {
    ...result,
    rows: result.rows.map((row) => ({
      month: start.slice(0, 7),
      base: text(row[prefix + 'belong_base']),
      code: text(row[prefix + 'material_code']),
      name: text(row[prefix + 'material_name']),
      category: text(row[prefix + 'product_categ_name']),
      group: text(row[prefix + 'material_group_name']),
      shipped:
        row[prefix + 'act_dl_qty_total'] === null ? null : number(row[prefix + 'act_dl_qty_total']),
    })),
  };
}
