import { createAgentQueries, type ConfiguredExecution } from './agent-query';
import type { AgentSqlConfig } from './sql-config';

export type ChainLayer = 'base' | 'branch' | 'customer';
export type TreeRow = Record<string, any> & { node_key: string; node_name: string };
export const layerLabels: Record<ChainLayer, string> = {
  base: '基地',
  branch: '分仓',
  customer: '渠道',
};
export const treeRisks = [
  '全部',
  '缺货',
  '库存偏低',
  '库存偏高',
  '滞库',
  '预警',
  '无目标',
  '待核实',
  '正常',
];
const shift = (day: string, count: number) => {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
export const treeNumber = (value: unknown): number | null =>
  value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export function treeRatio(numerator: unknown, denominator: unknown) {
  const n = treeNumber(numerator),
    d = treeNumber(denominator);
  return n === null || d === null || d <= 0 ? null : n / d;
}

export function categoryTreeReader(config: AgentSqlConfig, execute?: ConfiguredExecution) {
  const client = createAgentQueries(config, execute);
  return async (
    layer: ChainLayer,
    input: {
      date: string;
      level: 'category' | 'organization' | 'sku';
      category?: string;
      organization?: string;
      page?: number;
      search?: string;
      risk?: string;
      snapshot?: string;
    },
    signal: AbortSignal,
  ) => {
    const id = `category-tree.${layer}`;
    const query = client.config.queries[id];
    if (!query) throw Error('品类下钻查询未装载，请更新全链库存插件');
    let snapshot = input.snapshot;
    if (!snapshot) {
      const result = await client.read(
        layer === 'customer' ? 'source.dealer-stock-date' : 'source.health-date',
        { as_of: input.date },
        { signal },
      );
      snapshot = result.rows[0]?.day?.slice(0, 10);
    }
    if (!snapshot) return { rows: [] as TreeRow[], hasNext: false, snapshot: undefined };
    const values: Record<string, any> = {};
    for (const [key, spec] of Object.entries(query.parameterSpec) as [string, any][]) {
      let value = structuredClone(query.request.parameters[key]);
      if (['month', 'order_start'].includes(spec.name)) value = input.date.slice(0, 7) + '-01';
      if (spec.name === 'stock_month') value = snapshot.slice(0, 7) + '-01';
      if (['stock_date', 'stat_date'].includes(spec.name)) value = snapshot;
      if (['order_end_exclusive', 'shipment_end_exclusive'].includes(spec.name))
        value = shift(input.date, 1);
      if (spec.name === 'rolling_start') value = shift(input.date, -29);
      if (spec.name === 'batch_rolling_start') value = shift(snapshot, -29);
      if (spec.name === 'batch_end_exclusive') value = shift(snapshot, 1);
      if (spec.format === 'YYYYMMDD') value = value.replaceAll('-', '');
      if (spec.format === 'YYYYMM') value = value.slice(0, 7).replace('-', '');
      values[spec.name] = value;
    }
    Object.assign(values, {
      level: input.level,
      parent_category: input.category ?? null,
      parent_organization: input.organization ?? null,
      tree_search:
        input.level === 'sku' && input.search?.trim()
          ? `%${input.search.trim().replace(/[\\%_]/g, '\\$&')}%`
          : null,
      tree_risk: input.level === 'sku' && input.risk ? input.risk : null,
      page_size: 11,
      offset: ((input.page ?? 1) - 1) * 10,
    });
    // Push exact parent restrictions into existing sources before their heavy joins.
    // Unknown buckets retain the outer NULL/blank normalization.
    if (input.category && input.category !== '未分类') {
      if (layer === 'branch') values.category = input.category;
      else if (layer === 'base') {
        values.category_mode = 'equal';
        values.category = input.category;
      }
    }
    if (input.organization && input.organization !== '未归属') {
      if (layer === 'base') {
        values.bases_enabled = true;
        values.bases = [input.organization];
        values.order_bases_enabled = true;
        values.order_bases = [input.organization];
      } else if (layer === 'branch') values.warehouse_code = input.organization;
    }
    const result = await client.read(id, values, { signal, requiredColumns: query.resultColumns });
    return {
      rows: result.rows.slice(0, 10) as TreeRow[],
      hasNext: result.rows.length > 10,
      snapshot,
    };
  };
}

/** Sum company layers only; channel quantities retain their own date and scope. */
export function categorySummary(category: string, layers: Partial<Record<ChainLayer, TreeRow[]>>) {
  const row = (layer: ChainLayer) => layers[layer]?.find((r) => r.node_key === category);
  const value = (layer: ChainLayer, field: string) =>
    layers[layer] === undefined ? null : row(layer) ? treeNumber(row(layer)![field]) : 0;
  const sum = (field: string) => {
    const base = value('base', field),
      branch = value('branch', field);
    return base === null || branch === null ? null : base + branch;
  };
  const base = row('base');
  const ranks = Object.values(layers)
    .flatMap(
      (rows) =>
        rows?.filter((r) => r.node_key === category).map((r) => treeNumber(r.risk_rank)) ?? [],
    )
    .filter((n): n is number => n !== null);
  return {
    node_key: category,
    node_name: category,
    inventory: sum('inventory'),
    base_inventory: value('base', 'inventory'),
    branch_inventory: value('branch', 'inventory'),
    customer_inventory: value('customer', 'inventory'),
    age_qty: sum('age_qty'),
    age_sum: sum('age_sum'),
    overaged: sum('overaged'),
    gap: base?.gap ?? null,
    turnover_qty: base?.turnover_qty,
    daily: base?.daily,
    target_turnover_qty: base?.target_turnover_qty,
    target_daily: base?.target_daily,
    risk_rank: ranks.length ? Math.min(...ranks) : null,
    source_date: [row('base')?.source_date, row('branch')?.source_date].filter(Boolean).sort()[0],
    latest_date: [row('base')?.latest_date, row('branch')?.latest_date]
      .filter(Boolean)
      .sort()
      .at(-1),
  };
}
