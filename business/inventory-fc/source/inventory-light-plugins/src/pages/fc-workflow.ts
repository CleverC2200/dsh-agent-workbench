import { z } from 'zod';
import { createAgentQueries } from '../../../../../shared/agent-query';
import { agentSqlConfig } from '../../../../../shared/sql-config';
import { readConfiguredFacts, type FactInput } from '../../../../../shared/configured-facts';
import type { AgentSqlConfig } from '../../../../../shared/sql-config';
import { knownNumber } from '../../../../../shared/configured-overview';
import { parseImportedPlans, type ImportedPlan } from '../../../fc/src/lib/planning';

export type FcRow = Record<string, unknown>;
export type FcReadScope = { config: AgentSqlConfig; viewId: string; input: FactInput };
const rowSchema = z.record(z.string(), z.unknown());
export const rowKey = (row: FcRow) => JSON.stringify([row.warehouse_code, row.sku]);
export const planKey = (plan: ImportedPlan) => JSON.stringify([plan.warehouseCode, plan.sku]);
export const quantity = (value: unknown) => knownNumber(value) ?? 0;

async function readFcPlanRows(scope: FcReadScope, signal: AbortSignal) {
  const config = agentSqlConfig(scope.config);
  const queryId = 'transfer_plan.template';
  const query = config.queries[queryId];
  const filters = scope.input.filters ?? {};
  if (Object.keys(filters).some((key) => !['warehouse_code', 'sku'].includes(key)))
    throw Error('模板筛选范围无效');
  const month = scope.input.asOf.slice(0, 7) + '-01';
  const values: Record<string, unknown> = Object.fromEntries(
    Object.entries(query.parameterSpec).map(([key, raw]) => {
      const spec = raw as { name: string };
      const name = spec.name;
      if (name === 'month') return [name, month];
      if (name === 'page_size') return [name, 200];
      if (name === 'offset') return [name, 0];
      for (const field of ['warehouse_code', 'sku']) {
        const value = filters[field]?.trim();
        if (name === field) return [name, value || null];
        if (name === field + '_mode') return [name, value ? 'equal' : 'all'];
      }
      return [name, query.request.parameters[key]];
    }),
  );
  const read = (freshAfter?: number) =>
    createAgentQueries(config, undefined, { freshAfter }).readAll(queryId, values, {
      signal,
      keyFields: ['warehouse_code', 'sku'],
      requiredColumns: query.resultColumns,
      maxRows: 10000,
      atomicPages: true,
    });
  try {
    return (await read()).rows;
  } catch (error) {
    signal.throwIfAborted();
    // A cached prefix from an older source count cannot be mixed into an export.
    // Restart once with a fresh cohort; permissions/config/columns/cancellation still fail closed.
    if ((error as { code?: string }).code !== 'SOURCE_CHANGED') throw error;
    return (await read(Date.now())).rows;
  }
}

/** Only explicit download/import/submit actions enumerate their authorized filter scope. */
export async function readFcActionRows(
  scope: FcReadScope,
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
) {
  if (scope.viewId === 'plan') return readFcPlanRows(scope, signal);
  const pageSize = 200;
  const read = (page: number, readContext?: FactInput['readContext']) =>
    readConfiguredFacts(
      scope.config,
      scope.viewId,
      { ...scope.input, page, pageSize, readContext },
      { signal, detailsOnly: true },
    );
  const first = await read(1);
  if (!['available', 'empty'].includes(first.status) || first.total == null)
    throw Error('当前数据不可用，请刷新后重试');
  const total = first.total;
  if (!Number.isSafeInteger(total) || total > 10000)
    throw Error('最多处理10000行，请先按分仓或SKU筛选');
  const rows: FcRow[] = [];
  const add = (result: typeof first, page: number) => {
    if (
      result.configVersion !== first.configVersion ||
      result.snapshotDate !== first.snapshotDate ||
      result.total !== total ||
      result.rows.length !== Math.min(pageSize, total - (page - 1) * pageSize)
    )
      throw Error('读取期间数据或配置已变化，请重新操作');
    signal.throwIfAborted();
    rows.push(...result.rows.map((row: unknown) => rowSchema.parse(row)));
    onProgress?.(rows.length, total);
  };
  add(first, 1);
  const stop = new AbortController();
  const combined = AbortSignal.any([signal, stop.signal]);
  try {
    for (let page = 2; page <= Math.ceil(total / pageSize); page += 3) {
      const pages = Array.from(
        { length: Math.min(3, Math.ceil(total / pageSize) - page + 1) },
        (_, index) => page + index,
      );
      const batch = await Promise.all(
        pages.map((number) =>
          readConfiguredFacts(
            scope.config,
            scope.viewId,
            { ...scope.input, page: number, pageSize, readContext: first.readContext },
            { signal: combined, detailsOnly: true },
          ),
        ),
      );
      batch.forEach((result, index) => add(result, pages[index]));
    }
  } catch (error) {
    stop.abort();
    throw error;
  }
  signal.throwIfAborted();
  return rows;
}

export function validateFcImport(rows: Record<string, string | number>[], source: FcRow[]) {
  const byWarehouse = new Map<string, { name: string; rows: Record<string, string | number>[] }>();
  const allowed = new Map(source.map((row) => [rowKey(row), row]));
  const errors: { row: number; field: string; message: string }[] = [];
  rows.forEach((row, index) => {
    const warehouse = String(row['仓库编号'] ?? row['仓库编码'] ?? row['分仓编码'] ?? '').trim();
    const sku = String(row['SKU编码'] ?? row['产品编码'] ?? '').trim();
    const match = allowed.get(JSON.stringify([warehouse, sku]));
    if (!match) {
      errors.push({
        row: index + 2,
        field: '分仓/SKU',
        message: '不在当前有权限的分仓计划范围内，请使用下载的模板',
      });
      return;
    }
    const modern = '仓库编码' in row || '确认出货计划量' in row;
    const quantityFields = modern
      ? ['确认出货计划量', '确认调拨计划量']
      : ['本月出货计划', '本月调拨计划'];
    const missing = quantityFields.filter((field) => String(row[field] ?? '').trim() === '');
    if (missing.length) {
      errors.push(
        ...missing.map((field) => ({
          row: index + 2,
          field,
          message: '请输入明确数量；零计划填写0，空白表示未提供，不能当作0。',
        })),
      );
      return;
    }
    const group = byWarehouse.get(warehouse) ?? {
      name: String(match.warehouse_name ?? warehouse),
      rows: [],
    };
    group.rows.push(row);
    byWarehouse.set(warehouse, group);
  });
  const plans: ImportedPlan[] = [];
  for (const [code, group] of byWarehouse) {
    const parsed = parseImportedPlans(group.rows, group.name, code);
    plans.push(...parsed.plans);
    errors.push(
      ...parsed.errors.map((error) => ({
        ...error,
        row: rows.indexOf(group.rows[error.row - 2]) + 2,
      })),
    );
  }
  if (!rows.length || rows.length > 5000)
    errors.push({ row: 1, field: '工作表', message: '须包含1–5000行数据' });
  return { plans, errors };
}

/** gea-agent-fc order-net-gap-v3; imported months replace a warehouse's whole package. */
export function applyFcPlan(row: FcRow, plans: ImportedPlan[], asOf: string, cycleDays: number) {
  const month = asOf.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7);
  const warehousePlans = plans.filter((plan) => plan.warehouseCode === row.warehouse_code);
  if (!warehousePlans.some((plan) => plan.month === month || plan.month === next)) return row;
  const known = (value: unknown) => {
    const n = knownNumber(value);
    return n !== null && n >= 0 ? n : null;
  };
  const original = (primary: string, fallback: string) =>
    known(Object.hasOwn(row, primary) ? row[primary] : row[fallback]);
  const monthly = (
    period: string,
    field: 'outboundQty' | 'transferQty',
    fallback: number | null,
  ) => {
    if (!warehousePlans.some((plan) => plan.month === period)) return fallback;
    return known(
      warehousePlans.find((plan) => plan.month === period && plan.sku === row.sku)?.[field],
    );
  };
  const outbound = monthly(month, 'outboundQty', original('period_current_out', 'month_out_plan'));
  const nextOutbound = monthly(next, 'outboundQty', original('period_next_out', 'future30_qty'));
  const monthTransfer = monthly(
    month,
    'transferQty',
    original('period_current_transfer', 'warehouse_month_transfer_plan'),
  );
  const nextTransfer = monthly(next, 'transferQty', known(row.period_next_transfer));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const nextDays = new Date(Date.UTC(year, monthNumber + 1, 0)).getUTCDate();
  const daily = outbound === null ? null : Math.ceil(outbound / days);
  const nextDaily = nextOutbound === null ? null : Math.ceil(nextOutbound / nextDays);
  const remainingDays = Math.min(30, days - Number(asOf.slice(8, 10)));
  const forecastDays = 30 - remainingDays;
  const forecast =
    (remainingDays > 0 && daily === null) || (forecastDays > 0 && nextDaily === null)
      ? null
      : Math.ceil(((daily ?? 0) * remainingDays + (nextDaily ?? 0) * forecastDays) / 30);
  const available = known(row.available_qty),
    transfer = known(row.open_transfer_reported_qty);
  const remainingOrders = known(
    Object.hasOwn(row, 'calculation_order_remaining')
      ? row.calculation_order_remaining
      : row.current_order_remaining,
  );
  const net = available === null || remainingOrders === null ? null : available - remainingOrders;
  const cycle = known(row.cycle_days) ?? cycleDays;
  const target = daily === null ? null : daily * (cycle + 3);
  const gap = net === null ? null : Math.max(0, -net);
  const targetGap = net === null || target === null ? null : Math.max(0, target - net);
  const recommended =
    gap === null || targetGap === null || transfer === null
      ? null
      : Math.ceil(Math.max(0, Math.max(gap, targetGap) - transfer));
  const shipped = known(row.month_ship_positive),
    inventory = known(row.inventory_qty);
  const remaining =
    outbound === 0
      ? 0
      : outbound === null || shipped === null
        ? null
        : Math.max(0, outbound - shipped);
  const source = (period: string) =>
    warehousePlans.some((plan) => plan.month === period)
      ? '人工导入试算（整月覆盖）'
      : '分仓同步表';
  return {
    ...row,
    month_out_plan: outbound,
    period_current_out: outbound,
    future30_qty: nextOutbound,
    period_next_out: nextOutbound,
    warehouse_month_transfer_plan: monthTransfer,
    period_current_transfer: monthTransfer,
    period_next_transfer: nextTransfer,
    period_current_source: source(month),
    period_next_source: source(next),
    planned_daily_shipment: daily,
    period_current_daily: daily,
    calculation_daily: daily,
    period_next_daily: nextDaily,
    daily_plan: forecast,
    target_inventory_qty: target,
    remaining_outbound_qty: remaining,
    period_remaining_out: remaining,
    recommended_qty: recommended,
    urgent: gap === null ? null : Number(gap > 0),
    forecast_turnover_days:
      forecast !== null && forecast > 0 && inventory !== null ? inventory / forecast : null,
    target_gap_qty:
      forecast === null || available === null
        ? null
        : Math.max(0, (cycle + 3) * forecast - available),
    expected_month_end_qty:
      available === null || monthTransfer === null || outbound === null
        ? null
        : available + monthTransfer - outbound,
    order_adjusted_available_qty: net,
    plan_source: '人工导入试算',
    cycle_days: cycle,
    safety_days: cycle + 3,
    plan_calculable: Number(outbound !== null),
    calculation_status: recommended === null ? '试算要素不完整，待核实' : '人工导入试算',
    period_plan_status:
      outbound === null || nextOutbound === null || monthTransfer === null || nextTransfer === null
        ? '计划不完整'
        : '已试算',
  };
}

export function summarizeFcRows(rows: FcRow[]) {
  const completeSum = (field: string) => {
    const values = rows.map((row) => knownNumber(row[field]));
    return values.length && values.every((value) => value !== null)
      ? values.reduce<number>((total, value) => total + value!, 0)
      : null;
  };
  const demand = completeSum('daily_plan'),
    stock = completeSum('inventory_qty');
  return {
    recommended: completeSum('recommended_qty'),
    missingCount: rows.filter((row) => knownNumber(row.recommended_qty) === null).length,
    forwardTurnover: demand !== null && demand > 0 && stock !== null ? stock / demand : null,
  };
}

/** Validate the complete confirmation batch, including explicit zero reductions. */
export function validateFcSubmission(
  rows: FcRow[],
  quantities: Record<string, number>,
  reasons: Record<string, string>,
) {
  for (const row of rows) {
    const recommended = knownNumber(row.recommended_qty);
    const actual = quantities[rowKey(row)] ?? recommended;
    if (recommended === null || actual === null) throw Error('补货计算待核实：' + row.sku);
    if (!Number.isFinite(actual) || actual < 0 || actual > 1e9)
      throw Error('补货数量无效：' + row.sku);
    if (actual < recommended && !reasons[rowKey(row)]?.trim())
      throw Error('调减建议量必须填写理由：' + row.sku);
  }
}
