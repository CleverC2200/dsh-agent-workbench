import { workflowPerformanceInput } from './mps-workflow-fixture.mjs';

export function delistedInput() {
  const sample = workflowPerformanceInput(2);
  sample.draft.shipment = {
    cutoff: '2026-11-30',
    transferPlans: [
      { month: '2026-11', base: '甲', code: '0', inbound: 500, outbound: 0 },
      { month: '2027-01', base: '甲', code: '0', inbound: 5, outbound: 10 },
    ],
  };
  sample.shipment.cutoff = sample.draft.shipment.cutoff;
  sample.draft.inventoryMovements.find(
    (row) => row.month === '2027-01' && row.code === '0',
  ).transferIn = 5;
  sample.draft.inventoryMovements.find(
    (row) => row.month === '2027-01' && row.code === '0',
  ).transferOut = 10;
  sample.shipment.rows.forEach((row) => Object.assign(row, { end: 100, average: 2 }));
  sample.relations = {
    sources: {
      transfers: [
        {
          stat_period: '2026-11',
          target_base: '甲',
          material_code: '0',
          transfer_tag: '下市品',
        },
        {
          stat_period: '2026-11',
          target_base: '甲',
          material_code: '1',
          transfer_tag: '自产',
        },
      ],
    },
  };
  return sample;
}
