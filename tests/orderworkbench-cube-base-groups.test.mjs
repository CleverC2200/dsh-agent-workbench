import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCubeMetricExecutor } from '../business/inventory-orderworkbench/cube-source.mjs';
import {
  readOrderMetric,
  metricCalculationVersion,
} from '../lib/business/inventory-orderworkbench/metric-runtime.mjs';

test('base-only groups retain quantities and pending without global director attribution reads', async () => {
  const config = JSON.parse(
    readFileSync('lib/business/inventory-orderworkbench/sql.config.json', 'utf8'),
  );
  config.metricRuntime = { version: metricCalculationVersion, revision: 'base-fixture' };
  const rows = [
    {
      cust_code: 'C1',
      cust_order_no: 'D1',
      executeorderno: 'E1',
      material_code: 'M1',
      belong_base: '郑州',
      pickup_point: '01',
      order_close_time: '2026-11-15 10:00:00',
      createsource: '20',
      detailstatus: 10,
      orderstatus: 100,
      is_virtual: 0,
      timeout_code: 0,
      is_short_transfer: '非短拨',
      change_order_qty: 0,
      dms_last_update_qty: 100,
      need_qty_origin: 200,
    },
    {
      cust_code: 'C2',
      cust_order_no: 'D2',
      executeorderno: 'E2',
      material_code: 'M2',
      belong_base: '华东',
      pickup_point: '02',
      order_close_time: '2026-11-15 10:00:00',
      createsource: '20',
      detailstatus: 10,
      orderstatus: 100,
      is_virtual: 0,
      timeout_code: 0,
      is_short_transfer: '非短拨',
      change_order_qty: 20,
      dms_last_update_qty: 50,
      need_qty_origin: 200,
    },
  ];
  const values = [];
  for (const view of ['summary', 'groups']) {
    const calls = [];
    const input = {
      metric: '改单率',
      start: '2026-11-01',
      endExclusive: '2026-11-17',
      view,
      ...(view === 'groups' ? { dimensions: ['base'] } : {}),
    };
    const executor = createCubeMetricExecutor(config, input, {
      signal: new AbortController().signal,
      now: new Date('2026-11-17T05:00:00Z'),
      call: async (_name, args) => {
        const q = args.queries[0].query;
        calls.push(q);
        const source = q.dimensions[0].split('.')[0];
        const data = source === 'agents_scm_execute_detail_d' ? rows : [];
        assert.ok(source !== 'agents_scm_execute_detail_hourly_d');
        if (source === 'agents_scm_execute_detail_d') assert.ok(q.filters.length > 0);
        const result = data.map((row) =>
          Object.fromEntries([
            ...q.dimensions.map((m) => [m, row[m.split('.')[1]] ?? null]),
            ...(q.measures ?? []).map((m) => [m, 1]),
          ]),
        );
        return JSON.stringify({
          datasets: [
            {
              dataStatus: result.length ? 'ok' : 'no_data',
              rows: result,
              rowCount: result.length,
              totalRowCount: result.length,
              hasMorePages: false,
            },
          ],
        });
      },
    });
    try {
      const result = await readOrderMetric(config, input, executor.execute, undefined, {
        now: new Date('2026-11-17T05:00:00Z'),
      });
      values.push(result.current);
      if (view === 'groups') assert.equal(result.groups.rows.length, 2);
    } finally {
      executor.close();
    }
  }
  for (const value of values) {
    assert.equal(value.numerator, 130);
    assert.equal(value.denominator, 150);
    assert.equal(value.pending, 0);
  }
});
