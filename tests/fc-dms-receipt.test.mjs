import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const compiled = await build({
  entryPoints: ['business/inventory-fc/source/inventory-light-plugins/src/pages/fc-dms-receipt.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { fcDmsReceiptNotice } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
test('receipt notice displays DMS business message and returned order number', () => {
  assert.equal(
    fcDmsReceiptNotice({ orderCode: 'S00715602', dmsMessage: '订单已暂存成功' }),
    'DMS返回：订单已暂存成功；订单号：S00715602',
  );
});
test('legacy receipt without a message only displays its actual returned order number', () => {
  assert.equal(fcDmsReceiptNotice({ orderCode: 'S00715602' }), 'DMS已返回订单号：S00715602');
});
