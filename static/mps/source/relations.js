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

export async function readPlanRelations(config, execute, months, signal) {
  const first = await readRelations(config, execute, months[0], signal);
  const query = createQueryClient(config, execute);
  const definition = config.queries['transfers.detail'];
  const later = await Promise.all(
    months.slice(1).map(async (month) => {
      const result = await query.readAll(
        'transfers.detail',
        { period: month, page_size: 200, offset: 0 },
        {
          signal,
          keyFields: definition.grain,
          requiredColumns: definition.columns,
          maxRows: 10000,
        },
      );
      if (result.configVersion !== first.configVersion)
        throw Error('求解来源配置版本变化，请重新评估');
      if (result.rows.some((row) => row.stat_period !== month))
        throw Error('调拨来源月份与求解月份不一致');
      return result.rows;
    }),
  );
  return {
    ...first,
    sources: { ...first.sources, transfers: [...first.sources.transfers, ...later.flat()] },
  };
}

const emptySourceField = (value) => value == null || (typeof value === 'string' && !value.trim());
const capacityMissing = (source) => [
  ...(emptySourceField(source.series) ? ['缺产线源系列'] : []),
  ...(emptySourceField(source.combined_series) ? ['缺组合系列'] : []),
  ...(emptySourceField(source.production_category) ? ['缺产线生产品类'] : []),
];

const text = (value) => (typeof value === 'string' ? value.trim() : '');
export function canonicalBaseName(value) {
  const name = text(value).replace(/基地$/, '');
  return { 四川: '西南', 广州: '华南', 湖州: '华东' }[name] ?? name;
}
export const physicalTunnelKey = (base, unit, tunnel) => JSON.stringify([base, unit, tunnel]);
export function tunnelCapacityConflicts(tunnels, skus) {
  return [
    ['standard_daily_output_ton', '标准日产吨数'],
    ['standard_daily_output_pc', '标准日产件数'],
  ].flatMap(([field, label]) => {
    const values = (rows) => [
      ...new Set(
        rows
          .map((row) => row[field])
          .filter(
            (value) =>
              value != null && String(value).trim() !== '' && Number.isFinite(Number(value)),
          )
          .map(Number),
      ),
    ];
    const sourceValues = values(tunnels),
      skuValues = values(skus);
    return new Set([...sourceValues, ...skuValues]).size > 1
      ? [{ field, sourceValues, skuValues, reason: `两表同物理隧道${label}冲突，待核` }]
      : [];
  });
}
export function matchTunnelCapacity(capacity, tunnels) {
  const base = text(capacity.belong_base),
    unit = text(capacity.workshop),
    tunnel = text(capacity.tunnel_no);
  const candidates = tunnels.filter(
    (row) => text(row.belong_base) === base && text(row.tunnel_no) === tunnel,
  );
  const sources = candidates.filter((row) => text(row.production_unit) === unit);
  const candidateKeys = [
    ...new Set(
      candidates.map((row) =>
        physicalTunnelKey(text(row.belong_base), text(row.production_unit), text(row.tunnel_no)),
      ),
    ),
  ];
  const status =
    !base || !unit || !tunnel
      ? 'missing-key'
      : sources.length
        ? 'matched'
        : candidateKeys.length > 1
          ? 'multiple'
          : 'unmatched';
  return {
    status,
    sourceIndexes: status === 'matched' ? sources.map((row) => tunnels.indexOf(row)) : [],
    candidateResourceKeys: candidateKeys,
    conflicts: status === 'matched' ? tunnelCapacityConflicts(sources, [capacity]) : [],
    resourceKey: status === 'matched' ? physicalTunnelKey(base, unit, tunnel) : null,
    missing:
      status === 'matched'
        ? []
        : [
            status === 'missing-key'
              ? '缺基地、车间或隧道号，未建立产能关系'
              : status === 'multiple'
                ? '生产单位与车间未匹配，同基地隧道存在多个候选生产单位'
                : '生产单位与车间未匹配',
          ],
  };
}
const repeated = (source) =>
  Number(source.source_rows) > 1 ? ['来源业务字段重复，保留重复条数'] : [];

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
      const tunnelMatch = matchTunnelCapacity(capacity, sources.tunnels);
      sku.push({
        month,
        product,
        capacity,
        tunnelMatch,
        missing: [
          ...missing,
          ...capacityMissing(capacity),
          ...repeated(capacity),
          ...tunnelMatch.missing,
          ...tunnelMatch.conflicts.map((row) => row.reason),
        ],
      });
    }
  }
  for (const capacity of sources.sku_capacity) {
    if (used.has(capacity)) continue;
    const tunnelMatch = matchTunnelCapacity(capacity, sources.tunnels);
    sku.push({
      month,
      product: null,
      capacity,
      tunnelMatch,
      missing: [
        ...(!capacity.material_code?.trim() ? ['缺产线物料编码'] : []),
        '无产品记录',
        ...capacityMissing(capacity),
        ...repeated(capacity),
        ...tunnelMatch.missing,
        ...tunnelMatch.conflicts.map((row) => row.reason),
      ],
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
      ...repeated(source),
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
        ...(emptySourceField(source.sap_category) ? ['缺SAP品类'] : []),
        ...(emptySourceField(source.old_category) ? ['缺老大类'] : []),
        ...(emptySourceField(source.production_category) ? ['缺调拨生产品类'] : []),
      ],
      pending: !source.transfer_direction?.trim() ? ['调拨方向待确认'] : [],
    };
  });
  return { sku, lines, transfers };
}
