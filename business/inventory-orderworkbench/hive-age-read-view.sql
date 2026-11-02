-- Deduplicate before projecting the six governed fields: separate batches may
-- have identical quantities and ages. Preserve every differing source field.
ALTER VIEW ai_db.dwd_scm_material_age_his AS
SELECT dt, warehouseid, belong_base, material_code, inv_qty, age_days
FROM (
  SELECT DISTINCT
    warehouseid, age_status, age_type, age_days, material_code, prod_date,
    quality_batch, sap_warehouseid, plant, material_name, inv_qty, grossweight,
    `cube`, addtime, bak_date, warehouse_name, qtyeach, freeze_qty,
    is_good_prod, lotnum, stat_date, belong_base, warehouse_type, dt
  FROM hive.dw.dwd_scm_material_age_his
) source_batches;
