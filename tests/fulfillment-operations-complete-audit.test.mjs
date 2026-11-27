import test from 'node:test';
import assert from 'node:assert/strict';
import { operationsExportCell } from '../prototypes/inventory-orderfulfillment/operations-export.mjs';
import { auditDeliveryOperations } from '../scripts/audit-delivery-operations.mjs';
test('every original card, table column, chart, drill metric and card detail has an explicit source and disposition', async () => {
  const audit = await auditDeliveryOperations();
  assert.deepEqual(audit.counts, {
    panels: 7,
    cards: 16,
    tables: 21,
    tableColumns: 255,
    charts: 26,
    drillMetrics: 37,
    cardDetails: 24,
  });
  assert.equal(audit.rows.length, 358);
  assert.equal(new Set(audit.rows.map((row) => row.id)).size, 358);
  for (const row of audit.rows) {
    assert.ok(row.source && row.reason && row.owner, row.id);
    assert.ok(
      ['已接', '已接（按覆盖范围显示）', '待业务确认', '缺数据或覆盖不足'].includes(row.status),
    );
  }
});
test('exports use displayed units and derived values without treating unavailable quantities as zero', () => {
  assert.equal(operationsExportCell({ label: '数量(万)' }, 25000, {}), 2.5);
  assert.equal(operationsExportCell({ label: '比例(%)' }, 0.8, {}), 80);
  assert.equal(operationsExportCell({ label: '数量(万)' }, '已知 60000', {}), '已知 6');
  assert.equal(operationsExportCell({ label: '未开量(万)' }, { qty: 12000 }, {}), 1.2);
  assert.equal(
    operationsExportCell({ label: '满足率(%)', fmt: () => '<span>80.0</span>' }, undefined, {}),
    '80.0',
  );
  assert.equal(operationsExportCell({ label: '数量(万)' }, NaN, {}), '');
  assert.equal(operationsExportCell({ label: '数量(万)' }, 0, {}), 0);
  assert.equal(operationsExportCell({ label: '达成(%)', fmt: () => '—' }, 0, {}), '');
});

test('partial exported values validate against the original row rather than the already formatted annotation', () => {
  assert.equal(
    operationsExportCell(
      {
        k: 'lack',
        label: '缺货(万)',
        fmt: (value) => (typeof value === 'number' ? '已知 0.6' : '—'),
      },
      '已知 6000',
      { lack: 6000 },
    ),
    '已知 0.6',
  );
});

test('shared warehouse pool annotations retain the displayed unit in exports', () => {
  assert.equal(
    operationsExportCell({ label: '现库存(万)' }, '共享仓库 6626', {}),
    '共享仓库 0.6626',
  );
});
