import test from 'node:test';
import assert from 'node:assert/strict';
import { createCubeCalculation } from '../business/inventory-orderworkbench/cube-calculation.mjs';
import { rowPacketSql, unpackRowPackets } from '../business/shared/row-packets.mjs';

test('numeric source enums retain Doris comparisons against string filter codes', () => {
  const calculation = createCubeCalculation();
  try {
    calculation.table(
      'rows',
      ['is_virtual', 'need_qty_origin'],
      [
        { is_virtual: 1, need_qty_origin: 24 },
        { is_virtual: null, need_qty_origin: 100 },
        { is_virtual: 0, need_qty_origin: 0 },
      ],
    );
    const result = calculation.read(
      "SELECT SUM(need_qty_origin) AS quantity FROM rows WHERE is_virtual IS NULL OR is_virtual NOT IN ('1','2')",
      {},
    );
    assert.equal(result.rows[0].quantity, 100);
  } finally {
    calculation.close();
  }
});

test('Chinese row packets retain integer UTF-8 byte lengths, nulls and true zero', () => {
  const calculation = createCubeCalculation();
  try {
    calculation.table(
      'rows',
      ['belong_base', 'need_qty_origin', 'change_order_qty'],
      [
        { belong_base: '郑州', need_qty_origin: 100, change_order_qty: 0 },
        { belong_base: '华东', need_qty_origin: null, change_order_qty: null },
      ],
    );
    const columns = ['base', 'quantity', 'requested'];
    const sql = rowPacketSql(
      'SELECT belong_base AS base,need_qty_origin AS quantity,change_order_qty AS requested FROM rows',
      columns,
      ['base'],
    );
    const result = calculation.read(sql, {});
    const rows = unpackRowPackets(result.rows, columns, ['base']);
    assert.deepEqual(
      rows.find((row) => row.base === '郑州'),
      { base: '郑州', quantity: '100', requested: '0' },
    );
    assert.deepEqual(
      rows.find((row) => row.base === '华东'),
      { base: '华东', quantity: null, requested: null },
    );
  } finally {
    calculation.close();
  }
});
