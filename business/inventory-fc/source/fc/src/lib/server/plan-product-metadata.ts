import { fulfillmentWarehouseScope } from './warehouse-scope.ts';
import type { CatalogDatabase } from './warehouse-catalog.ts';

/** Use synchronized, warehouse-scoped dimensions; never imported placeholders. */
export async function loadPlanProductMetadata(
  database: CatalogDatabase,
  pickupPoint: string,
  skus: string[],
  options: { onConflict?: 'error' | 'omit' } = {},
) {
  if (!skus.length)
    return new Map<string, { category: string; materialGroup: string; productName?: string }>();
  const result = await database.query(
    `/* branch:product-metadata */
    SELECT DISTINCT f.new_material_code AS sku, BTRIM(f.new_material_name) AS product_name,
      BTRIM(f.product_categ_name) AS category, BTRIM(f.material_group_name) AS material_group
    FROM data_service.agents_scm_order_fulfillment f
    WHERE f.snapshot_date = (SELECT MAX(snapshot_date) FROM data_service.agents_scm_order_fulfillment)
      AND ${fulfillmentWarehouseScope(1)} AND f.pick_point_type2 = '分仓'
      AND f.new_material_code = ANY($2::text[])
  `,
    [pickupPoint, [...new Set(skus)]],
  );
  const names = new Map<string, Set<string>>();
  const bySku = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const sku = String(row.sku ?? '');
    const name = String(row.product_name ?? '').trim();
    if (name) {
      const values = names.get(sku) ?? new Set<string>();
      values.add(name);
      names.set(sku, values);
    }
    const category = String(row.category ?? '').trim(),
      materialGroup = String(row.material_group ?? '').trim();
    if (
      !category ||
      !materialGroup ||
      [category, materialGroup].some((value) => ['未提供', '未分类', '待核实'].includes(value))
    )
      continue;
    const pairs = bySku.get(sku) ?? new Set<string>();
    pairs.add(JSON.stringify({ category, materialGroup }));
    bySku.set(sku, pairs);
  }
  const output = new Map<
    string,
    { category: string; materialGroup: string; productName?: string }
  >();
  for (const sku of new Set(skus)) {
    const pairs = bySku.get(sku);
    if (!pairs?.size) continue;
    if (pairs.size !== 1) {
      if (options.onConflict === 'omit') continue;
      throw new Error(`SKU ${sku} 的大类或物料组映射不唯一，请核对源数据`);
    }
    const productNames = names.get(sku);
    output.set(sku, {
      ...JSON.parse([...pairs][0]),
      ...(productNames?.size === 1 ? { productName: [...productNames][0] } : {}),
    });
  }
  return output;
}
