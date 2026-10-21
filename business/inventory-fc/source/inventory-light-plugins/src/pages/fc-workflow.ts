import { z } from 'zod';
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

/** Only explicit download/import/submit actions enumerate their authorized filter scope. */
export async function readFcActionRows(scope: FcReadScope, signal: AbortSignal) {
  const read = (page: number, readContext?: FactInput['readContext']) =>
    readConfiguredFacts(
      scope.config,
      scope.viewId,
      { ...scope.input, page, pageSize: 100, readContext },
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
      result.rows.length !== Math.min(100, total - (page - 1) * 100)
    )
      throw Error('读取期间数据或配置已变化，请重新操作');
    rows.push(...result.rows.map((row: unknown) => rowSchema.parse(row)));
  };
  add(first, 1);
  const stop = new AbortController();
  const combined = AbortSignal.any([signal, stop.signal]);
  try {
    for (let page = 2; page <= Math.ceil(total / 100); page += 3) {
      const pages = Array.from(
        { length: Math.min(3, Math.ceil(total / 100) - page + 1) },
        (_, index) => page + index,
      );
      const batch = await Promise.all(
        pages.map((number) =>
          readConfiguredFacts(
            scope.config,
            scope.viewId,
            { ...scope.input, page: number, pageSize: 100, readContext: first.readContext },
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

/** Reuse the source calculation policy; an import is a local trial, never a database write. */
export function applyFcPlan(row: FcRow, plans: ImportedPlan[], asOf: string, cycleDays: number) {
  const plan = plans.find(
    (item) => planKey(item) === rowKey(row) && item.month === asOf.slice(0, 7),
  );
  if (!plan) return row;
  const days = new Date(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)), 0).getDate();
  const daily = plan.outboundQty / days;
  const target = Math.round(daily * (cycleDays + 3));
  const available = quantity(row.available_qty),
    transfer = quantity(row.open_transfer_reported_qty);
  return {
    ...row,
    month_out_plan: plan.outboundQty,
    warehouse_month_transfer_plan: plan.transferQty,
    planned_daily_shipment: daily,
    calculation_daily: daily,
    daily_plan: daily,
    target_inventory_qty: target,
    remaining_outbound_qty: Math.max(0, plan.outboundQty - quantity(row.month_ship_positive)),
    recommended_qty: Math.max(0, target - available - transfer),
    forecast_turnover_days: daily > 0 ? (available + transfer) / daily : null,
    plan_source: '人工导入试算',
    cycle_days: cycleDays,
    safety_days: 3,
  };
}
