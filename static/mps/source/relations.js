import { createQueryClient } from '../../../business/shared/configured-query-client.mjs';

export async function readRelations(config, execute, month, signal) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('评估月份无效');
  const query = createQueryClient(config, execute);
  const kinds = ['products', 'sku_capacity', 'tunnels', 'transfers'];
  const results = await Promise.all(
    kinds.map((kind) => {
      const definition = config.queries[kind + '.detail'];
      return query.readAll(
        kind + '.detail',
        {
          ...(kind === 'transfers' ? { period: month } : {}),
          page_size: 200,
          offset: 0,
        },
        {
          signal,
          keyFields: definition.grain,
          requiredColumns: definition.columns,
          maxRows: 10000,
        },
      );
    }),
  );
  if (results.some((result) => result.configVersion !== results[0].configVersion))
    throw Error('数据源配置版本不一致，请重新读取');
  const sources = Object.fromEntries(kinds.map((kind, index) => [kind, results[index].rows]));
  return {
    sources,
    records: relationRecords(sources, month),
    configVersion: results[0].configVersion,
  };
}

export function relationRecords(sources, month) {
  const byCode = new Map();
  sources.sku_capacity.forEach((row) => {
    if (typeof row.material_code !== 'string' || !row.material_code.trim()) return;
    const rows = byCode.get(row.material_code) ?? [];
    rows.push(row);
    byCode.set(row.material_code, rows);
  });
  const used = new Set(),
    sku = [];
  for (const product of sources.products) {
    const missing = [];
    if (!product.material_code?.trim()) missing.push('缺产品编码');
    if (!product.series?.trim()) missing.push('缺产品系列');
    if (!product.sub_category?.trim()) missing.push('缺产品分类');
    const matches = byCode.get(product.material_code) ?? [];
    if (!matches.length) {
      sku.push({ month, product, capacity: null, missing: [...missing, '无候选产线'] });
      continue;
    }
    for (const capacity of matches) {
      used.add(capacity);
      sku.push({ month, product, capacity, missing: [...missing] });
    }
  }
  for (const capacity of sources.sku_capacity) {
    if (used.has(capacity)) continue;
    sku.push({
      month,
      product: null,
      capacity,
      missing: [...(!capacity.material_code?.trim() ? ['缺产线物料编码'] : []), '无产品记录'],
    });
  }
  const productCodes = new Set(
    sources.products.map((row) => row.material_code).filter((code) => code?.trim()),
  );
  const lines = sources.tunnels.map((source) => ({
    month,
    source,
    missing: [
      ...(!source.series?.trim() ? ['缺源系列'] : []),
      ...(!source.production_category?.trim() ? ['缺生产品类'] : []),
    ],
  }));
  const transfers = sources.transfers.map((source) => {
    if (source.stat_period !== month) throw Error('调拨源月份与评估月份不一致');
    return {
      month,
      source,
      missing: [
        ...(!source.material_code?.trim() ? ['缺调拨物料编码'] : []),
        ...(!productCodes.has(source.material_code) ? ['无产品记录'] : []),
        ...(!source.series?.trim() ? ['缺源系列'] : []),
        ...(!source.target_base?.trim() ? ['缺目标基地'] : []),
      ],
      pending: !source.transfer_direction?.trim() ? ['调拨方向待确认'] : [],
    };
  });
  return { sku, lines, transfers };
}
