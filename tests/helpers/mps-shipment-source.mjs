import { expect } from '@playwright/test';

export const shipmentSourceRow = (changes = {}) => ({
  belong_base: '郑州',
  material_code: 'A',
  material_name: '产品甲',
  series: '系列',
  product_item: '组',
  shipped: 0,
  prepped: 0,
  unprepped: 0,
  daily3: 0,
  average: 0,
  open: 0,
  inbound: 0,
  transfer_rows: 1,
  transfer_in_plan_v1: null,
  transfer_in_plan_adj: null,
  transfer_out_plan_v1: null,
  transfer_out_plan_adj: null,
  ...changes,
});

export function shipmentSourceResponse(config, { queryId, parameters }, rows, cutoff) {
  if (!['facts.shipment-latest', 'facts.shipment.count', 'facts.shipment'].includes(queryId))
    return null;
  return {
    rows:
      queryId === 'facts.shipment-latest'
        ? [{ latest_date: cutoff }]
        : queryId === 'facts.shipment.count'
          ? [{ total: rows.length }]
          : rows.map((row) => ({
              source_days: Number(parameters.cutoff.slice(8)),
              duplicate_days: 0,
              transfer_date: parameters.cutoff,
              ...row,
            })),
    returnedColumns: config.queries[queryId].columns,
    configVersion: 'shipment-warehouse-fixture',
    offset: parameters.offset ?? 0,
    hasMorePages: false,
  };
}

export async function syncShipmentSource(frame, cutoff) {
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByLabel('数据截止日', { exact: true }).fill(cutoff);
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(frame.getByRole('button', { name: '同步实际发货', exact: true })).toBeEnabled();
  await expect(
    frame.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toBeVisible();
}
