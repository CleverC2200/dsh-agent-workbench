import { call } from '../../../business/shared/channel.js';
import { createQueryClient } from '../../../business/shared/configured-query-client.mjs';

export const sourceNames = {
  products: '产品清单',
  annual: '年度需求',
  tunnels: '隧道产能',
  sku_capacity: '产线SKU产能',
  transfers: '调拨方向',
};
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function normalizedMonth(value) {
  if (typeof value !== 'string') return null;
  const numeric = /^(\d{4})-(0?[1-9]|1[0-2])$/.exec(value);
  if (numeric) return `${numeric[1]}-${numeric[2].padStart(2, '0')}`;
  const chinese = /^(\d{4})年(0?[1-9]|1[0-2])月$/.exec(value);
  if (chinese) return `${chinese[1]}-${chinese[2].padStart(2, '0')}`;
  const match = /^([a-z]{3})-(\d{2})$/i.exec(value);
  const index = match ? months.indexOf(match[1].toLowerCase()) : -1;
  return index < 0 ? null : `20${match[2]}-${String(index + 1).padStart(2, '0')}`;
}
export function sourceMonthValues(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('评估月份无效');
  const name = months[Number(month.slice(5)) - 1];
  return [
    month,
    name[0].toUpperCase() + name.slice(1) + '-' + month.slice(2, 4),
    `${month.slice(0, 4)}年${Number(month.slice(5))}月`,
    ...(month[5] === '0' ? [`${month.slice(0, 4)}-${Number(month.slice(5))}`] : []),
  ];
}
export function hasMpsSource() {
  return !!document.getElementById('agent-sql-config');
}
function client() {
  const element = document.getElementById('agent-sql-config');
  if (!element) throw Error('月主计划数据源尚未装载，请重新打开页面');
  const config = JSON.parse(element.textContent);
  return {
    config,
    query: createQueryClient(config, (_request, options) =>
      call(
        'sql',
        { queryId: options.queryId, parameters: options.values },
        { signal: options.signal },
      ),
    ),
  };
}
const number = (value) => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)))
    throw Error('数据源返回了无效数量');
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER)
    throw Error('数据源数量超出可靠计算范围');
  return result;
};
const text = (value) => {
  if (value == null) return '';
  if (typeof value !== 'string') throw Error('数据源返回了无效文本字段');
  return value;
};
export function productRows(rows) {
  return rows.map((row) => ({
    基地: '',
    产品编码: text(row.material_code),
    产品名称: text(row.material_name),
    大类: text(row.sub_category),
    系列: text(row.series),
    物料组: text(row.product_item),
    物料组名称: text(row.product_item_name),
    老品编码: text(row.replacement_material_code),
    老品名称: text(row.replacement_product),
  }));
}
export function annualRows(rows) {
  const records = rows.map((row) => {
    const month = normalizedMonth(row.stat_month);
    if (!month) throw Error(`年度需求月份无法识别：${text(row.stat_month)}`);
    return {
      基地: text(row.belong_base),
      月份: month,
      大类: text(row.sub_category),
      数量: number(row.missing_qty) || number(row.duplicate_rows) ? '' : number(row.demand_qty),
      源月份: text(row.stat_month),
      源记录数: number(row.source_rows),
      缺失数量: number(row.missing_qty),
      重复记录数: number(row.duplicate_rows),
    };
  });
  const keys = records.map((row) => JSON.stringify([row['基地'], row['大类'], row['月份']]));
  const counts = new Map();
  keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
  return records.map((row, index) =>
    counts.get(keys[index]) > 1 ? { ...row, 数量: '', 重复记录数: row['源记录数'] } : row,
  );
}
export async function readMasterPage(kind, month, page, signal) {
  const { config, query } = client();
  const id = kind + '.detail';
  const scope =
    kind === 'annual'
      ? { months: sourceMonthValues(month) }
      : kind === 'transfers'
        ? { period: month }
        : {};
  const count = await query.read(kind + '.count', scope, { signal, requiredColumns: ['total'] });
  const total = number(count.rows[0]?.total);
  if (!Number.isSafeInteger(total) || total < 0) throw Error('数据源返回了无效行数');
  const result = await query.read(
    id,
    { ...scope, page_size: 25, offset: page * 25 },
    {
      signal,
      requiredColumns: config.queries[id].columns,
    },
  );
  if (
    result.configVersion !== count.configVersion ||
    result.rows.length !== Math.min(25, Math.max(0, total - page * 25))
  )
    throw Error('数据源在读取期间变化，请重新同步');
  return { rows: result.rows, total, columns: config.queries[id].columns, page };
}
export async function readProducts(signal) {
  const { config, query } = client();
  const definition = config.queries['products.detail'];
  const result = await query.readAll(
    'products.detail',
    { page_size: 200, offset: 0 },
    {
      signal,
      keyFields: definition.grain,
      requiredColumns: definition.columns,
      maxRows: 10000,
    },
  );
  return { rows: productRows(result.rows), raw: result.rows };
}
export async function readAnnual(signal) {
  const { config, query } = client();
  const definition = config.queries['annual.summary'];
  const result = await query.readAll(
    'annual.summary',
    { page_size: 200, offset: 0 },
    {
      signal,
      keyFields: definition.grain,
      requiredColumns: definition.columns,
      maxRows: 2000,
    },
  );
  return annualRows(result.rows);
}
export async function readAnnualDetails(months, base, signal) {
  const { config, query } = client();
  const definition = config.queries['annual.export'];
  const result = await query.readAll(
    'annual.export',
    { months: [...new Set(months.flatMap(sourceMonthValues))], base, page_size: 200, offset: 0 },
    { signal, keyFields: definition.grain, requiredColumns: definition.columns, maxRows: 100000 },
  );
  return result.rows;
}
