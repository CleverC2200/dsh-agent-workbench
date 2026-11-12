import { createQueryClient } from '../../../business/shared/configured-query-client.mjs';
import { canonicalBaseName } from './relations.js';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const positive = (value) => {
  if (
    typeof value !== 'number' &&
    !(typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()))
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= Number.MAX_SAFE_INTEGER ? number : null;
};
export async function readUnitWeights(config, execute, codes, signal) {
  const query = createQueryClient(config, execute);
  const unique = [...new Set(codes.map(text).filter(Boolean))].sort();
  const rows = [];
  let configVersion;
  const definition = config.queries['unit-weights.detail'];
  const stop = new AbortController();
  const batchSignal = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
  batchSignal.throwIfAborted();
  for (let index = 0; index < unique.length; index += 400) {
    const batches = [
      unique.slice(index, index + 200),
      unique.slice(index + 200, index + 400),
    ].filter((batch) => batch.length);
    let failure;
    const results = await Promise.allSettled(
      batches.map(async (batch) => {
        try {
          const result = await query.readAll(
            'unit-weights.detail',
            { codes: batch, page_size: 5000, offset: 0 },
            {
              signal: batchSignal,
              keyFields: definition.grain,
              requiredColumns: definition.columns,
              maxRows: 10000,
            },
          );
          if (result.rows.some((row) => !batch.includes(text(row.material_code))))
            throw Error('件吨系数返回了请求范围外的编码');
          return result;
        } catch (error) {
          failure ??= { error };
          stop.abort(error);
          throw error;
        }
      }),
    );
    if (failure) throw failure.error;
    for (let batchIndex = 0; batchIndex < results.length; batchIndex++) {
      const result = results[batchIndex].value;
      if ((index || batchIndex) && result.configVersion !== configVersion)
        throw Error('件吨系数读取期间查询配置版本变化，请重新读取');
      configVersion = result.configVersion;
      rows.push(...result.rows);
    }
  }
  return { rows, codes: unique, configVersion, readAt: new Date().toISOString() };
}
export function unitWeightCandidate(rows, code, applicableChannels = '') {
  const selected = rows.filter((row) => text(row.material_code) === code);
  const channels = [
    ...new Set(
      applicableChannels
        .split(/[,，、]/)
        .map(text)
        .filter(Boolean),
    ),
  ];
  const missing = [];
  if (!selected.length) missing.push('无来源记录');
  if (selected.some((row) => !text(row.channel_name))) missing.push('缺来源渠道');
  if (!channels.length) missing.push('适用渠道尚未维护');
  const relevant = selected.filter((row) => channels.includes(text(row.channel_name)));
  if (channels.some((channel) => !relevant.some((row) => text(row.channel_name) === channel)))
    missing.push('适用渠道缺来源记录');
  if (relevant.some((row) => positive(row.ton_per_piece) === null)) missing.push('缺正数吨/件系数');
  const values = [
    ...new Set(
      relevant.map((row) => positive(row.ton_per_piece)).filter((value) => value !== null),
    ),
  ];
  if (values.length > 1) missing.push('系数冲突，不能平均或自行择值');
  return {
    rows: selected,
    channels,
    tonsPerPiece: !missing.length && values.length === 1 ? values[0] : null,
    missing,
  };
}

export function productWeightCandidate(rows, base, code) {
  const selected = rows.filter(
    (row) =>
      text(row.material_code) === code &&
      canonicalBaseName(row.target_base) === canonicalBaseName(base),
  );
  if (!selected.length) return null;
  const units = new Map([
    ['KG', 1e-3],
    ['千克', 1e-3],
    ['公斤', 1e-3],
    ['G', 1e-6],
    ['克', 1e-6],
    ['T', 1],
    ['吨', 1],
  ]);
  const missing = [];
  const values = selected.map((row) => {
    const weight = positive(row.net_weight);
    const scale = units.get(text(row.weight_unit).toUpperCase());
    if (weight === null) missing.push('净重缺失或不是正数');
    if (scale === undefined) missing.push('重量单位缺失或不支持');
    if (!text(row.measure_unit)) missing.push('缺计量单位');
    const tons = weight !== null && scale !== undefined ? weight * scale : null;
    return tons !== null && Number.isFinite(tons) && tons > 0 && tons <= Number.MAX_SAFE_INTEGER
      ? tons
      : null;
  });
  if (new Set(selected.map((row) => text(row.measure_unit))).size > 1)
    missing.push('同基地SKU计量单位冲突');
  if (new Set(values).size > 1) missing.push('同基地SKU净重冲突，不能平均或自行择值');
  if (values.some((value) => value === null) && !missing.length)
    missing.push('净重换算超出可靠计算范围');
  return {
    rows: selected,
    tonsPerPiece: !missing.length ? values[0] : null,
    missing: [...new Set(missing)],
    sourceTable: 'ai_db.agents_dim_product_list_mi',
  };
}
