import { warehouseIdFromPickupCode, type WarehouseOption } from '../warehouse.ts';
import { getDatabase } from './database.ts';

export type CatalogDatabase = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
};
export type WarehouseSource = WarehouseOption & {
  warehouseName: string;
  region: string;
  pickupPointCode: string;
  branchPickupPoint: string;
};
export type WarehouseCatalog = {
  warehouses: WarehouseSource[];
  issues: Array<{ name: string; reason: string }>;
};

// Verified naming differences between the plan pickup-point and stock warehouse.
// These are name aliases, not a fixed list of branches or guessed code mappings.
const STOCK_NAME_ALIASES: Record<string, string> = {
  上海配送中心: '上海分仓',
  武汉配送中心: '武汉分仓',
};
const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export async function loadWarehouseCatalog(
  database: CatalogDatabase = getDatabase(),
): Promise<WarehouseCatalog> {
  const [plans, inventory] = await Promise.all([
    database.query(`/* warehouse_catalog:plans */
      SELECT DISTINCT branch_pickup_point, branch_name
      FROM data_service.agents_scm_branch_plan
      WHERE plan_snapshot_date = (SELECT MAX(plan_snapshot_date) FROM data_service.agents_scm_branch_plan)
      ORDER BY branch_pickup_point, branch_name
    `),
    database.query(`/* warehouse_catalog:inventory */
      WITH scopes AS (
        SELECT DISTINCT COALESCE(NULLIF(BTRIM(pickup_point), ''), NULLIF(BTRIM(self_pickup_point), '')) AS pickup_code, warehouseid,
          NULLIF(BTRIM(warehouse_name), '') AS warehouse_name
        FROM data_service.agents_scm_branch_inventory_snapshot
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM data_service.agents_scm_branch_inventory_snapshot)
          AND warehouse_classify = '20'
      )
      SELECT DISTINCT pickup_code, warehouseid, warehouse_name
      FROM scopes
      WHERE pickup_code IS NOT NULL AND warehouse_name IS NOT NULL
      ORDER BY pickup_code, warehouse_name
    `),
  ]);
  const codesByName = new Map<string, Set<string>>();
  const namesByCode = new Map<string, Set<string>>();
  for (const row of inventory.rows) {
    const name = clean(row.warehouse_name);
    const code = clean(row.pickup_code);
    if (!name || !/^[A-Z0-9]{1,16}$/.test(code)) continue;
    const codes = codesByName.get(name) ?? new Set<string>();
    codes.add(code);
    codesByName.set(name, codes);
    const names = namesByCode.get(code) ?? new Set<string>();
    names.add(name);
    namesByCode.set(code, names);
  }
  const issues: WarehouseCatalog['issues'] = [];
  const candidates: WarehouseSource[] = [];
  const seen = new Set<string>();
  const seenPickupCodes = new Set<string>();
  const conflictingPickupCodes = new Set<string>();
  const addCandidate = (candidate: WarehouseSource) => {
    // A source can publish both its code and its display-name form. They are the
    // same physical branch; keep the first (code form is ordered first) instead
    // of later discarding both as a duplicate warehouse ID.
    if (conflictingPickupCodes.has(candidate.pickupPointCode)) return;
    if (seenPickupCodes.has(candidate.pickupPointCode)) {
      const existing = candidates.find(
        (item) => item.pickupPointCode === candidate.pickupPointCode,
      );
      const aliasesSamePhysicalWarehouse =
        existing &&
        (existing.warehouseName === candidate.warehouseName ||
          STOCK_NAME_ALIASES[candidate.warehouseName] === existing.warehouseName ||
          STOCK_NAME_ALIASES[existing.warehouseName] === candidate.warehouseName);
      if (aliasesSamePhysicalWarehouse) return;
      const index = candidates.findIndex(
        (item) => item.pickupPointCode === candidate.pickupPointCode,
      );
      if (index >= 0) candidates.splice(index, 1);
      conflictingPickupCodes.add(candidate.pickupPointCode);
      issues.push({
        name: existing?.name ?? candidate.pickupPointCode,
        reason: '多个计划分仓对应同一库存提货点，需核对映射',
      });
      issues.push({ name: candidate.name, reason: '多个计划分仓对应同一库存提货点，需核对映射' });
      return;
    }
    seenPickupCodes.add(candidate.pickupPointCode);
    candidates.push(candidate);
  };
  for (const row of plans.rows) {
    const point = clean(row.branch_pickup_point);
    if (!point || seen.has(point)) continue;
    seen.add(point);
    const name = point.replace(/提货点$/, '');
    // Plans may use the physical pickup-point code directly. Prefer that exact,
    // database-owned relation before applying the display-name compatibility map.
    const directNames = [...(namesByCode.get(point) ?? [])];
    if (directNames.length === 1) {
      addCandidate({
        id: warehouseIdFromPickupCode(point),
        name: directNames[0],
        warehouseName: directNames[0],
        region: '—',
        pickupPointCode: point,
        branchPickupPoint: point,
      });
      continue;
    }
    if (directNames.length > 1) {
      issues.push({ name: point, reason: '提货点编码对应多个库存仓库名称，需核对映射' });
      continue;
    }
    const codes = [...(codesByName.get(STOCK_NAME_ALIASES[name] ?? name) ?? [])];
    if (codes.length !== 1) {
      issues.push({
        name,
        reason: codes.length
          ? '名称对应多个库存提货点编码，需核对映射'
          : '最新分仓库存快照中未找到唯一编码映射',
      });
      continue;
    }
    addCandidate({
      id: warehouseIdFromPickupCode(codes[0]),
      name,
      warehouseName: name,
      region: '—',
      pickupPointCode: codes[0],
      branchPickupPoint: point,
    });
  }
  // Current inventory is independent of SKU-plan coverage. Add only an
  // authoritative one-to-one pickup/name/warehouse mapping from class-20 stock.
  const warehouseIdsByCode = new Map<string, Set<string>>();
  const codesByWarehouseId = new Map<string, Set<string>>();
  for (const row of inventory.rows) {
    const code = clean(row.pickup_code),
      warehouseId = clean(row.warehouseid);
    if (!warehouseId || !/^[A-Z0-9]{1,16}$/.test(code)) continue;
    const ids = warehouseIdsByCode.get(code) ?? new Set<string>();
    ids.add(warehouseId);
    warehouseIdsByCode.set(code, ids);
    const codes = codesByWarehouseId.get(warehouseId) ?? new Set<string>();
    codes.add(code);
    codesByWarehouseId.set(warehouseId, codes);
  }
  for (const [code, ids] of warehouseIdsByCode) {
    if (seenPickupCodes.has(code) || conflictingPickupCodes.has(code)) continue;
    const names = [...(namesByCode.get(code) ?? [])];
    const id = [...ids][0];
    if (
      ids.size !== 1 ||
      names.length !== 1 ||
      codesByWarehouseId.get(id)?.size !== 1 ||
      codesByName.get(names[0])?.size !== 1
    ) {
      issues.push({ name: code, reason: '无计划分仓的库存目录映射不唯一，需核对' });
      continue;
    }
    addCandidate({
      id: warehouseIdFromPickupCode(code),
      name: names[0],
      warehouseName: names[0],
      region: '—',
      pickupPointCode: code,
      branchPickupPoint: code,
    });
  }
  const warehouses = candidates.filter((source) => {
    if (candidates.filter((item) => item.id === source.id).length === 1) return true;
    issues.push({ name: source.name, reason: '多个计划分仓对应同一库存提货点，需核对映射' });
    return false;
  });
  const legacyOrder = ['changsha', 'zhengzhou', 'east-china'];
  warehouses.sort((a, b) => {
    const rank = (id: string) => (legacyOrder.includes(id) ? legacyOrder.indexOf(id) : 3);
    return rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'zh-CN');
  });
  return { warehouses, issues };
}
