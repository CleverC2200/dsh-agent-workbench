import { forecastCoverage } from "./fc-feedback";
import { database as sourceDatabase, EMPTY_PLANNING } from "./data.ts";
import { loadWarehouseCatalog } from "../../fc/src/lib/server/warehouse-catalog.ts";
import { loadWarehouseSnapshot } from "../../fc/src/lib/server/warehouse-snapshot.ts";
import { loadBaseResourceSnapshot } from "../../fc/src/lib/server/base-resources.ts";
import { projectWarehousePage } from "../../fc/src/lib/workbench-page.ts";
import { summarizeSnapshot } from "../../fc/src/lib/domain.ts";
import {
  buildPlanTemplateRows,
  parseImportedPlans,
  applyBusinessPlanning,
} from "../../fc/src/lib/planning.ts";
import { LocalPlanning } from "./local-planning.ts";
import {createFcDatabase} from "./fc-transfer.ts";
const database = createFcDatabase(sourceDatabase);
const previews = new LocalPlanning();
const facts = new Map<string, Promise<any>>();
export function clearFacts() {
  facts.clear();
}
export function clearPreviews() {
  previews.clear();
}
export const catalog = () => loadWarehouseCatalog(database);
const planning = {
  query: async (sql: string) => {
    if (sql.includes("to_regclass"))
      return {
        rows: [
          { order_fulfillment: true, imported_plans: null, cycle_config: null },
        ],
      };
    throw Error("此能力需要 GEA 持久化支持，可交给对话区继续处理");
  },
};
const loadFacts = async (filters: any) => {
  const now = new Date(),
    calculationDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  const catalogPromise = catalog();
  const shippedPromise = catalogPromise.then(async (directory) => {
    const warehouse = directory.warehouses.find(row => row.id === filters.warehouseId);
    if (!warehouse) throw Error("GEA 未返回该分仓映射");
    const shipped = await database.query(
      `SELECT material_code AS sku, CASE WHEN COUNT(*) FILTER (WHERE metric_value IS NULL)>0 THEN NULL ELSE SUM(metric_value) END AS shipped_qty FROM data_service.agents_scm_branch_operation_fact WHERE pickup_point=$1 AND metric_group='branch_activity' AND metric_name='actual_shipped_qty' AND period_month=$2::date GROUP BY material_code ORDER BY material_code`,
      [warehouse.pickupPointCode, calculationDate.slice(0, 7) + "-01"],
    );
    return { warehouse, shipped };
  });
  const [base, {warehouse, shipped}] = await Promise.all([
    loadWarehouseSnapshot(filters.warehouseId, database, now, planning),
    shippedPromise,
  ]);
  return {
    base,
    warehouse,
    calculationDate,
    shipped: new Map(
      shipped.rows.map((row: any) => [
        String(row.sku),
        row.shipped_qty == null ? null : Number(row.shipped_qty),
      ]),
    ),
  };
};
async function source(warehouseId: string) {
  let value = facts.get(warehouseId);
  if (!value) {
    value = loadFacts({ warehouseId });
    facts.set(warehouseId, value);
    value.catch(() => {
      if (facts.get(warehouseId) === value) facts.delete(warehouseId);
    });
  }
  return value;
}
export async function applyLocalPreview(input: any) {
  const { warehouse } = await source(input.warehouseId);
  previews.update(warehouse, input);
  return {
    previewApplied: true,
    status: "local-only",
    warehouseId: warehouse.id,
  };
}
export const load = async ({ warehouseId }: any) => {
  const { base, shipped, calculationDate } = await source(warehouseId);
  const preview = previews.get(warehouseId);
  const result = applyBusinessPlanning(
    base,
    preview ?? {
      ...EMPTY_PLANNING,
      revision: base.ruleTrace.planVersion || base.version,
    },
    shipped,
    calculationDate,
  );
  const coverage = forecastCoverage(result);
  return {
    ...result,
    metrics: { ...result.metrics, forecastTurnoverDays: coverage.value },
    forecastCoverage: coverage,
    dataSource: "GEA SQL data_service 分仓库存标准表",
    localPreview: preview
      ? {
          status: "local-only",
          revision: preview.revision,
          importCount: preview.imports.length,
          ruleCount: preview.rules.length,
        }
      : null,
    migrationCapabilities: {
      localPlanningImported: false,
      cycleConfigurationImported: false,
    },
  };
};
export {
  loadBaseResourceSnapshot,
  projectWarehousePage,
  summarizeSnapshot,
  buildPlanTemplateRows,
  parseImportedPlans,
  applyBusinessPlanning,
};

export { database };

export {loadReplenishmentDetail} from "../../fc/src/lib/server/replenishment-detail.ts";
export {mergeDmsAdjustments} from "../../fc/src/lib/dms-export.ts";
