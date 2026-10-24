import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { encodeReportRequest } from '../prototypes/inventory-orderworkbench/report-transfer.mjs';
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
