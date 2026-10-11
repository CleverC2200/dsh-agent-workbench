import { forecastCoverage } from './fc-feedback';
import { database as sourceDatabase, EMPTY_PLANNING } from './data.ts';
import { loadWarehouseCatalog } from '../../fc/src/lib/server/warehouse-catalog.ts';
import { readWarehouseFacts } from './warehouse-input';
import { loadBaseResourceSnapshot } from '../../fc/src/lib/server/base-resources.ts';
import { projectWarehousePage } from '../../fc/src/lib/workbench-page.ts';
import { summarizeSnapshot } from '../../fc/src/lib/domain.ts';
import {
  buildPlanTemplateRows,
  parseImportedPlans,
  applyBusinessPlanning,
} from '../../fc/src/lib/planning.ts';
import { LocalPlanning } from './local-planning.ts';
import { createFcDatabase } from './fc-transfer.ts';
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
const loadFacts = (filters: any) => readWarehouseFacts(database, filters.warehouseId);
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
    status: 'local-only',
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
    dataSource: 'GEA SQL data_service 分仓库存标准表',
    localPreview: preview
      ? {
          status: 'local-only',
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

export { loadReplenishmentDetail } from '../../fc/src/lib/server/replenishment-detail.ts';
export { mergeDmsAdjustments } from '../../fc/src/lib/dms-export.ts';
