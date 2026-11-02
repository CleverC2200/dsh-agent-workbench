import { createAgentQueries, type ConfiguredExecution } from './agent-query';
import { agentSqlConfig, type AgentSqlConfig } from './sql-config';
import { readConfiguredTargetScope } from './configured-target-scope';

const date = (value: string) => {
  const parsed = new Date(value + 'T00:00:00Z');
  if (
    !/^20\d{2}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw Error('INVALID_PERIOD');
  return parsed;
};
const number = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean')
    return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const shift = (asOf: string, months: number) => {
  const d = date(asOf),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
};
const failure = (error: unknown) => {
  if (error === null || typeof error !== 'object') return {};
  return Object.fromEntries(
    ['failure', 'returnedColumns', 'rejectedColumns'].flatMap((key) =>
      key in error ? [[key, Reflect.get(error, key)]] : [],
    ),
  );
};
const errorCode = (error: unknown) =>
  error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'METRIC_READ_FAILED';

/** Both dialogue entry points read the installed page SQL; comparisons require returned facts. */
export async function readBaseInventoryMetrics(
  fallback: AgentSqlConfig,
  input: { asOf: string; base?: string; category?: string; compare: boolean },
  options: { signal: AbortSignal; execute: ConfiguredExecution },
) {
  const config = agentSqlConfig(fallback);
  date(input.asOf);
  const client = createAgentQueries(config, options.execute);
  const period = async (asOf: string) => {
    const end = date(asOf);
    end.setUTCDate(end.getUTCDate() + 1);
    const baseValues = {
      start: asOf.slice(0, 7) + '-01',
      month: asOf.slice(0, 7) + '-01',
      stock_month: asOf.slice(0, 7) + '-01',
      as_of: asOf,
      end_exclusive: end.toISOString().slice(0, 10),
      bases_enabled: !!input.base,
      bases: input.base ? [input.base] : [''],
      category_mode: input.category ? 'equal' : 'all',
      category: input.category ?? null,
      group_level: 'category',
      page_size: 200,
      offset: 0,
    };
    const read = async (id: string, overrides: Record<string, unknown> = {}) => {
      const query = config.queries[id];
      const values = Object.fromEntries(
        Object.entries<{ name: string }>(query.parameterSpec).map(([key, spec]) => {
          const name = String(spec.name);
          return [
            name,
            name in overrides
              ? overrides[name]
              : name in baseValues
                ? Reflect.get(baseValues, name)
                : structuredClone(query.request.parameters[key]),
          ];
        }),
      );
      return id.endsWith('.groups')
        ? client.readAll(id, values, {
            signal: options.signal,
            requiredColumns: query.resultColumns,
            keyFields: id === 'inventory.groups' ? ['base', 'category'] : ['category'],
            maxRows: 50000,
          })
        : client.read(id, values, { signal: options.signal, requiredColumns: query.resultColumns });
    };
    const stock = async () => {
      try {
        const snapshot = await read('source.stock-date');
        const snapshotDate = snapshot.rows[0]?.day;
        if (typeof snapshotDate !== 'string' || !snapshotDate.startsWith(asOf.slice(0, 7)))
          return { status: 'unavailable', reason: 'NO_SNAPSHOT_IN_PERIOD', rows: [] };
        const targetScope = await readConfiguredTargetScope(client, asOf, options.signal);
        const result = await read('inventory.groups', {
          stock_date: snapshotDate,
          month: targetScope.targetMonth,
          inventory_version: targetScope.inventoryVersion,
        });
        if (
          result.configVersion !== snapshot.configVersion ||
          result.configVersion !== targetScope.configVersion
        )
          throw Object.assign(Error('QUERY_CONFIG_CHANGED'), { code: 'QUERY_CONFIG_CHANGED' });
        const groups = new Map<string, Array<{ inventory: number | null; daily: number | null }>>();
        for (const row of result.rows) {
          const category = typeof row.category === 'string' ? row.category : '';
          const values = groups.get(category) ?? [];
          values.push({ inventory: number(row.inventory), daily: number(row.stock_avg_30d_sale) });
          groups.set(category, values);
        }
        const sum = (values: Array<number | null>) =>
          values.every((value) => value !== null)
            ? values.reduce<number>((total, value) => total + (value ?? 0), 0)
            : null;
        return {
          status: result.rows.length ? 'available' : 'empty',
          snapshotDate,
          rows: [...groups].map(([category, rows]) => {
            const inventory = sum(rows.map((row) => row.inventory));
            const daily = sum(rows.map((row) => row.daily));
            return {
              category: category || null,
              inventoryQty: inventory,
              dailyShipment30Qty: daily,
              turnoverDays:
                inventory !== null && inventory >= 0 && daily !== null && daily > 0
                  ? inventory / daily
                  : null,
            };
          }),
        };
      } catch (error) {
        options.signal.throwIfAborted();
        return { status: 'error', reason: errorCode(error), ...failure(error), rows: [] };
      }
    };
    const orders = async () => {
      try {
        const result = await read('orders.groups', {
          pickup_type_mode: 'equal',
          pickup_type: '工厂',
          exp_flag: '否',
          positive_orders_only: true,
        });
        return {
          status: result.rows.length ? 'available' : 'empty',
          rows: result.rows.map((row: Record<string, unknown>) => ({
            category: row.category,
            fulfillmentRate: number(row.fulfillment_rate),
          })),
        };
      } catch (error) {
        options.signal.throwIfAborted();
        return { status: 'error', reason: errorCode(error), ...failure(error), rows: [] };
      }
    };
    const [inventory, fulfillment] = await Promise.all([stock(), orders()]);
    return {
      asOf,
      periodStart: baseValues.start,
      periodEndExclusive: baseValues.end_exclusive,
      inventory,
      fulfillment,
    };
  };
  const current = await period(input.asOf);
  const previous = input.compare
    ? await Promise.all([period(shift(input.asOf, -1)), period(shift(input.asOf, -12))])
    : [];
  return {
    scope: {
      base: input.base ?? '当前授权范围',
      category: input.category ?? '全部品类',
      unit: '件',
    },
    definitions: {
      turnover: '基地实物库存÷同范围近30日日均动销；不使用计划周转替代',
      fulfillment: '所属业务月的已发货订单数量满足率；保留实际数据覆盖',
      comparisons:
        '同一范围、同一指标、同一月内截止日；只有两期均有数值才可计算。空结果、读取失败、未发布资源分别报告；未查询不能称无历史。历史订单为当前来源状态，不还原过去时点状态。库存快照截止日不一致时不作同比环比。',
    },
    current,
    monthOverMonth: previous[0] ?? null,
    yearOverYear: previous[1] ?? null,
    comparisonPolicy: {
      missingMetric: '不可计算，逐项保留原因',
      fulfillmentChange: '两期满足率之差×100，单位百分点',
      turnoverChange: '两期周转天数之差；相对变化须对照期大于0',
      inventoryComparable: '两期都必须取得各自截止日的快照；快照延迟时不自动给出同比环比',
    },
  };
}
