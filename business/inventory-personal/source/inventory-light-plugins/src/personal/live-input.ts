import { loadDailyReportInput as readDaily } from '../../../../../inventory-aqkc/source/inventory-light-plugins/src/aqkc-report';
import { readWarehouseFacts } from '../../../../../inventory-fc/source/inventory-light-plugins/src/warehouse-input';
import { loadWarehouseCatalog } from '../../../../../inventory-fc/source/fc/src/lib/server/warehouse-catalog';
import { applyBusinessPlanning } from '../../../../../inventory-fc/source/fc/src/lib/planning';
import { queryStock, scopedDatabase } from './sql-data';
export { readSignal, clearReadCache } from '../../../../../shared/sql-reader';
export const dataMode = 'GEA_LIVE_READONLY';
export const loadDailyReportInput = (signal?: AbortSignal) => readDaily(signal, queryStock);
export const catalog = (signal?: AbortSignal) => loadWarehouseCatalog(scopedDatabase(signal));
export async function load({ warehouseId, signal }: { warehouseId: string; signal?: AbortSignal }) {
  const { base, shipped, calculationDate } = await readWarehouseFacts(
    scopedDatabase(signal),
    warehouseId,
  );
  signal?.throwIfAborted();
  return applyBusinessPlanning(
    base,
    {
      imports: [],
      rules: [],
      revision: base.ruleTrace.planVersion || base.version,
      available: false,
    },
    shipped,
    calculationDate,
  );
}
