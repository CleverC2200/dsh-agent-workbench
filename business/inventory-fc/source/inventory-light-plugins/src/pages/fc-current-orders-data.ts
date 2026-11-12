import { z } from 'zod';
import { createAgentQueries } from '../../../../../shared/agent-query';
import { unpackAtomicPage } from '../../../../../shared/atomic-page';
import type { AgentSqlConfig } from '../../../../../shared/sql-config';

const numeric = z
  .union([
    z.number().finite(),
    z
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .transform(Number),
  ])
  .nullable();
export const lineSchema = z.object({
  warehouse_code: z.string().min(1),
  order_no: z.string().min(1),
  customer_code: z.string().nullable(),
  sku: z.string().nullable(),
  material_name: z.string().nullable(),
  ordered: numeric,
  demand: numeric,
  allocated: numeric,
  shipped: numeric,
  remaining: numeric,
  shortage: numeric,
  order_status: z.string().nullable(),
});
export const orderSchema = lineSchema.omit({ sku: true, material_name: true }).extend({
  warehouse_name: z.string().nullable(),
  customer_name: z.string().nullable(),
  requested_at: z.string().nullable(),
  created_at: z.string().nullable(),
  sku_count: numeric,
  satisfaction: numeric,
});
export type Order = z.infer<typeof orderSchema>;
export type Line = z.infer<typeof lineSchema>;
const orderTotalsSchema = orderSchema.pick({
  sku_count: true,
  demand: true,
  allocated: true,
  remaining: true,
  shortage: true,
});
export type Page<T> = {
  rows: T[];
  total: number;
  version: string | undefined;
  totals: z.infer<typeof orderTotalsSchema> | null;
};
export type ReadState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: Page<T> }
  | { kind: 'failed'; message: string };
export const orderKey = (row: Order) =>
  JSON.stringify([row.warehouse_code, row.order_no, row.customer_code]);

export async function readPage<T>(
  config: AgentSqlConfig,
  queryId: string,
  values: Record<string, unknown>,
  schema: z.ZodType<T>,
  page: number,
  pageSize: number,
  signal: AbortSignal,
): Promise<Page<T>> {
  const definition = config.queries[queryId];
  const result = await createAgentQueries(config).read(
    queryId,
    { ...values, page_size: pageSize, offset: (page - 1) * pageSize },
    { signal, requiredColumns: definition.resultColumns },
  );
  const unpacked = unpackAtomicPage(result, page, pageSize);
  const summaryColumns = z
    .record(z.string(), z.string())
    .optional()
    .parse(definition.scopeSummaryColumns);
  const totals = summaryColumns
    ? orderTotalsSchema.parse(
        Object.fromEntries(
          Object.entries(summaryColumns).map(([field, alias]) => [
            field,
            result.rows[0]?.[alias] ?? null,
          ]),
        ),
      )
    : null;
  return {
    rows: z.array(schema).parse(unpacked.rows),
    total: unpacked.total,
    totals,
    version: z.string().optional().parse(result.configVersion),
  };
}

export type OrderFilters = {
  warehouse_code: string | null;
  warehouse_search_pattern: string | null;
  customer_code: null;
  search_pattern: string | null;
  shortage_only: boolean;
};

async function readAllPages<T>(
  config: AgentSqlConfig,
  queryId: string,
  values: Record<string, unknown>,
  schema: z.ZodType<T>,
  key: (row: T) => string,
  signal: AbortSignal,
) {
  const rows: T[] = [];
  const seen = new Set<string>();
  const first = await readPage(config, queryId, values, schema, 1, 50, signal);
  if (first.total > 100000) throw Error('导出超过10万条，请缩小筛选范围');
  let current = first;
  for (let page = 1; ; page++) {
    signal.throwIfAborted();
    if (current.total !== first.total || current.version !== first.version)
      throw Error('导出期间订单或查询配置发生变化，请刷新后重新导出');
    for (const row of current.rows) {
      const id = key(row);
      if (seen.has(id)) throw Error('订单分页出现重复记录，未导出，请刷新后重试');
      seen.add(id);
      rows.push(row);
    }
    if (rows.length === first.total) return rows;
    if (!current.rows.length || rows.length > first.total)
      throw Error('订单明细读取不完整，未导出，请刷新后重试');
    current = await readPage(config, queryId, values, schema, page + 1, 50, signal);
  }
}

const exportHeaders = [
  '分仓编码',
  '分仓名称',
  '客户订单号',
  '客户编码',
  '客户名称',
  '订单日期',
  '产品编码',
  '产品名称',
  '需求量（件）',
  '分仓已占用（件）',
  '已发货量（件）',
  '剩余需求量（件）',
  '缺货量（件）',
];

export async function readOrderExport(
  config: AgentSqlConfig,
  filters: OrderFilters,
  selection: { kind: 'selected'; keys: Set<string> } | { kind: 'all'; excluded: Set<string> },
  signal: AbortSignal,
) {
  const all = await readAllPages(
    config,
    'branch-current-orders.page',
    filters,
    orderSchema,
    orderKey,
    signal,
  );
  const orders = all.filter((row) =>
    selection.kind === 'selected'
      ? selection.keys.has(orderKey(row))
      : !selection.excluded.has(orderKey(row)),
  );
  if (selection.kind === 'selected' && orders.length !== selection.keys.size)
    throw Error('所选订单已变化或不在当前权限范围，请刷新后重新选择');
  if (!orders.length) throw Error('没有可导出的订单');
  const exported: unknown[][] = [];

  for (let at = 0; at < orders.length; at += 4) {
    const groups = await Promise.all(
      orders.slice(at, at + 4).map(async (order) => {
        const lines = await readAllPages(
          config,
          'branch-current-orders.lines',
          {
            warehouse_code: order.warehouse_code,
            order_no: order.order_no,
            customer_code: order.customer_code,
          },
          lineSchema,
          (row) => JSON.stringify([row.warehouse_code, row.order_no, row.customer_code, row.sku]),
          signal,
        );
        if (
          lines.some(
            (line) =>
              line.warehouse_code !== order.warehouse_code ||
              line.order_no !== order.order_no ||
              line.customer_code !== order.customer_code,
          )
        )
          throw Error('订单明细归属不一致，未导出');
        if (
          order.sku_count !== null &&
          new Set(lines.filter((line) => line.sku !== null).map((line) => line.sku)).size !==
            order.sku_count
        )
          throw Error('订单SKU明细与列表数量不一致，请刷新后重新导出');
        for (const field of ['demand', 'allocated', 'shipped', 'remaining', 'shortage'] as const) {
          const total = lines.every((line) => line[field] !== null)
            ? lines.reduce((sum, line) => sum + (line[field] ?? 0), 0)
            : null;
          const expected = order[field];
          if (
            (total === null) !== (expected === null) ||
            (total !== null &&
              expected !== null &&
              Math.abs(total - expected) > Math.max(1, Math.abs(expected)) * 1e-8)
          )
            throw Error('订单数量在导出期间发生变化，请刷新后重新导出');
        }
        return lines.map((line) => [
          order.warehouse_code,
          order.warehouse_name ?? '-',
          order.order_no,
          order.customer_code ?? '-',
          order.customer_name ?? '-',
          order.created_at?.slice(0, 10) ?? '-',
          line.sku ?? '-',
          line.material_name ?? '-',
          line.demand ?? '-',
          line.allocated ?? '-',
          line.shipped ?? '-',
          line.remaining ?? '-',
          line.shortage ?? '-',
        ]);
      }),
    );
    exported.push(...groups.flat());
    if (exported.length > 100000) throw Error('导出超过10万条，请缩小筛选范围');
  }
  signal.throwIfAborted();
  return {
    rows: [exportHeaders, ...exported],
    orderCount: orders.length,
    lineCount: exported.length,
  };
}
