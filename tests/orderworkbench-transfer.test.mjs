import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import {
  encodeReportRequest,
  packWorkbenchReport,
  unpackWorkbenchReport,
} from '../prototypes/inventory-orderworkbench/report-transfer.mjs';
import { createReportPersistence } from '../prototypes/inventory-orderworkbench/report-persistence.mjs';
test('report transfer preserves the full snapshot and reduces bridge payload', async () => {
  const report = {
    schemaVersion: 1,
    facts: {
      complete: true,
      rows: Array.from({ length: 5000 }, (_, i) => ({
        sku: String(i),
        name: '订单工作台验证商品',
        qty: i % 7,
        unknown: null,
      })),
    },
    edits: { summary: '结论', references: ['https://example.com'], improvements: ['改善措施'] },
  };
  const request = { operation: 'save', requestId: 'request-000000001', report };
  const encoded = await encodeReportRequest(request);
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(encoded.report.data, 'base64'))), report);
  assert.equal(encoded.requestId, request.requestId);
  assert.ok(JSON.stringify(encoded).length < JSON.stringify(request).length / 5);
  assert.equal(await encodeReportRequest({ operation: 'load' }).then((x) => x.operation), 'load');
});

test('arrival snapshot dictionary preserves fields and edits, and expands before cache reuse', async () => {
  const rows = Array.from({ length: 5000 }, (_, index) => ({
    order_no: 'order-' + Math.floor(index / 5),
    customer: '客户😀',
    base: index % 2 ? '郑州' : '华南',
    sku: 'SKU-' + (index % 30),
    category: '水饺',
    item: '品项:一',
    invalid: index % 7 === 0 ? 1 : 0,
    ontime: index % 7 === 0 ? null : 1,
    arrival_date: '2026-10-25',
    empty: '',
  }));
  const report = {
    schemaVersion: 1,
    facts: {
      complete: true,
      periods: { week: { sections: [{ id: 'ontime', status: 'ready', rows }] } },
    },
    edits: { summary: { positive: '保留人工编辑内容' }, references: ['https://example.com'] },
  };
  const packed = packWorkbenchReport(report);
  assert.ok(JSON.stringify(packed).length < JSON.stringify(report).length / 3);
  assert.equal(report.facts.periods.week.sections[0].rows.length, 5000);
  assert.deepEqual(unpackWorkbenchReport(packed), report);
  const request = await encodeReportRequest({ operation: 'save', report });
  assert.deepEqual(
    unpackWorkbenchReport(JSON.parse(gunzipSync(Buffer.from(request.report.data, 'base64')))),
    report,
  );
  const persistence = createReportPersistence(
    async () => ({ version: 3, editVersion: 2, report: packed }),
    () => {},
  );
  const loaded = await persistence.open(
    { type: 'WEEK', start: '2026-10-19', end: '2026-10-26' },
    new AbortController().signal,
  );
  assert.deepEqual(loaded.facts, report.facts);
  assert.deepEqual(loaded.edits, report.edits);
  packed.facts.periods.week.sections[0].packedRows[0][0] = -1;
  assert.throws(() => unpackWorkbenchReport(packed), /ORDER_REPORT_ROWS_INVALID/);
});
