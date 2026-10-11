import { queryStock } from './data';
import { sqlReportCopy } from './query-error.js';
import {
  selectWorkbenchTargetRows,
  targetInventoryOutput,
} from '../../aqkc/web/src/lib/cube-dashboard';
import { dailyReportSql } from '../../aqkc/web/src/lib/daily-report-sql';
import {
  buildDailyReport,
  reportNumber,
  type DailySource,
  type DailyReportInput,
} from '../../aqkc/web/src/lib/daily-report';
import type { WorkbenchSqlRow } from '../../aqkc/web/src/lib/workbench-sql-types';
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const nonnegative = (value: unknown) => {
  const n = reportNumber(value);
  return n !== null && n >= 0 ? n : null;
};
export async function loadDailyReportInput(
  signal?: AbortSignal,
  read = queryStock,
): Promise<DailyReportInput & { sourceErrors: Record<string, { code: string; message: string }> }> {
  const sources = Object.keys(dailyReportSql) as DailySource[];
  const results = await Promise.allSettled(
    sources.map((source) => read(dailyReportSql[source], signal)),
  );
  signal?.throwIfAborted();
  const rows = results.map((result) => (result.status === 'fulfilled' ? result.value : []));
  const data = Object.fromEntries(sources.map((source, index) => [source, rows[index]])) as Record<
    DailySource,
    WorkbenchSqlRow[]
  >;
  const failedSources: DailySource[] = sources.filter(
    (_, index) => results[index].status === 'rejected',
  );
  const sourceErrors = Object.fromEntries(
    results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [
            [
              sources[index],
              {
                code: String(result.reason?.cause?.code ?? result.reason?.code ?? 'QUERY_FAILED'),
                message: String(result.reason?.message ?? result.reason),
              },
            ],
          ]
        : [],
    ),
  );
  const generatedAt = new Date().toISOString();
  const selected = selectWorkbenchTargetRows(data.stock, new Date(generatedAt));
  return {
    generatedAt,
    localPreview: false,
    failedSources,
    sourceErrors,
    targetMonth: selected.scope.targetMonthLabel,
    targetVersion: selected.scope.versionLabel,
    targetRule: selected.scope.selectionRule,
    stock: selected.rows.map((row) => {
      const seasonal = [
        'safety_stock.product_categ_name',
        'safety_stock.product_label',
        'safety_stock.material_name',
      ].some((field) => text(row[field]).includes('粽子'));
      const demand = nonnegative(row['safety_stock.planned_daily_demand']);
      // Do not let the legacy numeric fallback turn missing seasonal facts into zero.
      const target =
        seasonal &&
        (demand === null ||
          (demand > 0 && nonnegative(row['safety_stock.turnover_inventory']) === null))
          ? null
          : nonnegative(targetInventoryOutput(row));
      return {
        base: text(row['safety_stock.base_name']),
        material: text(row['safety_stock.material_code']),
        name: text(row['safety_stock.material_name']),
        category: text(row['safety_stock.product_categ_name']),
        inventory: nonnegative(row['safety_stock.current_inventory']),
        target,
        demand,
        shipment30: nonnegative(row['safety_stock.last_30d_shipment_quantity']),
        snapshot: text(row['safety_stock.snapshot_time']),
      };
    }),
    age: data.age.map((row) => ({
      base: text(row.base),
      material: text(row.material),
      name: text(row.material_name),
      category: text(row.category),
      inventory: nonnegative(row.inventory),
      bands: [row.age_0, row.age_30, row.age_40, row.age_60, row.age_unknown].map(nonnegative),
      natural7: nonnegative(row.natural_7),
      natural14: nonnegative(row.natural_14),
      weightedAge: nonnegative(row.weighted_age),
      invalidQuantity: reportNumber(row.invalid_quantity) !== 0,
      snapshot: text(row.snapshot),
    })),
    pendingSnapshot: text(data.pending[0]?.['report.order_snapshot']),
    pending: data.pending
      .filter((row) => row['workbench.domain'] === 'pending_sku')
      .map((row) => ({
        base: text(row['workbench.base']),
        material: text(row['workbench.material_code']),
        quantity: nonnegative(row['workbench.order_quantity']),
        shortage: nonnegative(row['workbench.shortage_quantity']),
        allocated: nonnegative(row['workbench.allocated_quantity']),
        snapshot: text(row['report.order_snapshot']),
        inventorySnapshot: text(row['report.inventory_snapshot']),
      })),
    fulfillment: data.fulfillment.map((row) => ({
      base: text(row.base),
      material: text(row.material),
      need: nonnegative(row.need),
      shortage: nonnegative(row.shortage),
      invalidQuantity: reportNumber(row.invalid_quantity) !== 0,
      snapshot: text(row.snapshot),
    })),
  };
}
export async function loadDailyReport(selectedBases?: string[]) {
  return sqlReportCopy(buildDailyReport({ ...(await loadDailyReportInput()), selectedBases }));
}
