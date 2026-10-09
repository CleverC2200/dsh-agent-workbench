/** Resolve a canonical pickup code through warehouse facts visible to this database/session. */
export function fulfillmentWarehouseScope(parameter: 1 | 2): string {
  return `f.warehouseid IN (
    SELECT DISTINCT i.warehouseid FROM data_service.agents_scm_branch_inventory_snapshot i
    WHERE i.snapshot_date = (SELECT MAX(snapshot_date) FROM data_service.agents_scm_branch_inventory_snapshot)
      AND COALESCE(NULLIF(BTRIM(i.pickup_point), ''), NULLIF(BTRIM(i.self_pickup_point), '')) = $${parameter}
  )`;
}
