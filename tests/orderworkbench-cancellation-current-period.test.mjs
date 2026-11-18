import test from 'node:test';
import assert from 'node:assert/strict';
import { cancellationEvents } from '../business/inventory-orderworkbench/document-queries.mjs';
import {
  cancellationDb,
  cancellationLine,
  sqliteCancellationSql,
} from './helpers/cancellation-fixture.mjs';

test('daily cancellation recovery, shipment period, zero quantity and no seven-day lock share one cohort', () => {
  const make = (id, extra = {}) =>
    cancellationLine(id, {
      pickup_point: '02',
      header_addtime: '2026-11-10 18:06:34',
      latestsendcardate: '2026-11-19 18:12:00',
      ...extra,
    });
  const cancelled = make('recovered', { orderstatus: 90, detailstatus: 20, need_qty_origin: 1120 });
  const db = cancellationDb({
    shipments: [],
    hourly: [
      cancelled,
      make('active'),
      make('october'),
      make('zero', { change_order_qty: 0 }),
      make('branch', { pickup_point: '09' }),
    ],
    daily: [{ ...cancelled, canceltime: '2026-11-11 10:17:13' }],
  });
  try {
    const insert = db.prepare(
      "INSERT INTO agents_scm_order_trace_final_di(executeorderno,cust_code,update_time,load_time,lastshipmenttime,wms_ship_status,load_status) VALUES(?,?,?,?,?,'99','装车完成')",
    );
    for (const [id, date] of [
      ['active', '2026-11-12'],
      ['october', '2026-10-31'],
      ['zero', '2026-11-12'],
      ['branch', '2026-11-12'],
    ])
      insert.run('E-' + id, 'C', '2026-11-16', '2026-11-16', date);
    const rows = db
      .prepare(sqliteCancellationSql(cancellationEvents))
      .all({ gea_p900: '', gea_p1: '2026-11-01', gea_p2: '2026-11-17' });
    assert.equal(rows.length, 3);
    assert.equal(rows.find((r) => r.executeorderno === 'E-recovered').cancel_numerator, 1120);
    assert.equal(rows.find((r) => r.executeorderno === 'E-zero').cancel_denominator, 0);
    assert.equal(
      rows.reduce((n, r) => n + r.cancel_denominator, 0),
      1130,
    );
    assert(rows.every((r) => r.invalid_cancel === 0));
  } finally {
    db.close();
  }
});

import { build } from 'esbuild';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { metricSnapshot } from '../prototypes/inventory-orderworkbench/metric-components.mjs';
import { orderWorkbenchSourceConfig } from '../business/inventory-orderworkbench/source-config.mjs';
import { readFileSync } from 'node:fs';

test('all thirteen product lines recover independently and a real customer zero wins over DMS and backup', () => {
  const daily = Array.from({ length: 13 }, (_, index) =>
    cancellationLine('thirteen', {
      executeorderlineno: index + 1,
      material_code: 'SKU' + index,
      orderstatus: 90,
      detailstatus: 10,
      header_addtime: '2026-11-10 00:00:00',
      canceltime: '2026-11-16 09:00:00',
      need_qty_origin: index + 1,
      ...(index === 6 ? { change_order_qty: 0, dms_last_update_qty: 999 } : {}),
    }),
  );
  const db = cancellationDb({
    hourly: [{ ...daily[12], canceltime: null, need_qty_origin: null }],
    daily,
  });
  try {
    const rows = db
      .prepare(sqliteCancellationSql(cancellationEvents))
      .all({ gea_p900: '', gea_p1: '2026-11-01', gea_p2: '2026-11-17' });
    assert.equal(rows.length, 13);
    assert.equal(rows.find((row) => row.executeorderlineno === 7).cancel_numerator, 0);
    assert.equal(
      rows.reduce((sum, row) => sum + row.cancel_numerator, 0),
      84,
    );
    assert.equal(
      rows.reduce((sum, row) => sum + row.cancel_denominator, 0),
      84,
    );
    assert(rows.every((row) => row.invalid_cancel === 0));
  } finally {
    db.close();
  }
});

test('card, independent Agent summary and base groups share quantities, pending and the T-1 cutoff', async () => {
  const hourly = [
    cancellationLine('cancel-today', {
      orderstatus: 90,
      canceltime: '2026-11-16 09:00:00',
      need_qty_origin: 30,
    }),
    cancellationLine('shipped-today', { need_qty_origin: 70 }),
    cancellationLine('pending-today', { need_qty_origin: null }),
    cancellationLine('zero-today', { change_order_qty: 0, need_qty_origin: 999 }),
    cancellationLine('branch-today', { pickup_point: '09', need_qty_origin: 999 }),
    cancellationLine('no-departure', { latestsendcardate: null, need_qty_origin: 999 }),
  ];
  const shipments = hourly.map((row) => ({
    executeorderno: row.executeorderno,
    cust_code: row.cust_code,
    lastshipmenttime: '2026-11-16 10:00:00',
    update_time: '2026-11-16',
    load_time: '2026-11-16',
  }));
  const db = cancellationDb({ hourly, shipments });
  const bundled = await build({
    entryPoints: ['prototypes/inventory-orderworkbench/metric-runtime.mjs'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    packages: 'external',
  });
  const { readOrderMetric, metricCalculationVersion } = await import(
    'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].contents).toString('base64')
  );
  const config = orderWorkbenchSourceConfig(
    JSON.parse(readFileSync('business/inventory-apsplan/sql.config.json', 'utf8')),
  );
  config.metricRuntime = {
    version: metricCalculationVersion,
    revision: 'same-cancellation-source',
  };
  const params = { gea_p900: '', gea_p1: '2026-11-01', gea_p2: '2026-11-17' };
  const executeSql = (query, values) => {
    const sql = sqliteCancellationSql(query).replaceAll(
      "RIGHT(COALESCE(executeorderno,''),1)",
      "SUBSTR(COALESCE(executeorderno,''),-1)",
    );
    return db
      .prepare(sql)
      .all(Object.fromEntries(Object.entries(values).filter(([key]) => sql.includes(':' + key))))
      .map((row) => ({ ...row }));
  };
  try {
    const { cancellationChangesSql } =
      await import('../business/inventory-orderworkbench/document-queries.mjs');
    const period = {
      start: '2026-11-01',
      end: '2026-11-17',
      sections: [
        { id: 'changes', status: 'ready', rows: executeSql(cancellationChangesSql, params) },
      ],
    };
    period.metrics = computeWorkbenchMetrics(period);
    const card = metricSnapshot(period, '作废率');
    assert.equal(card.numerator, 30);
    assert.equal(card.denominator, 100);
    assert.equal(card.pending, 1);
    for (const view of ['summary', 'groups']) {
      const calls = [];
      const result = await readOrderMetric(
        config,
        {
          metric: '作废率',
          start: '2026-11-01',
          endExclusive: '2026-12-01',
          view,
          ...(view === 'groups' ? { dimensions: ['base'] } : {}),
        },
        async (request, options) => {
          calls.push(options);
          return { rows: executeSql(request.sql, request.parameters), configVersion: 'fixture' };
        },
        undefined,
        { now: new Date('2026-11-17T05:00:00Z') },
      );
      assert.equal(result.period.endExclusive, '2026-11-17');
      for (const field of [
        'numerator',
        'denominator',
        'pending',
        'value',
        'quantityUnit',
        'pendingUnit',
      ])
        assert.equal(result.current[field], card[field], view + ' ' + field);
      if (view === 'groups') {
        assert.equal(result.groups.reconciliation.matches, true);
        assert.equal(result.groups.total.numerator, 30);
        assert.equal(result.groups.total.denominator, 100);
        assert.equal(result.groups.total.pending, 1);
      }
      assert(calls.length > 0);
      assert(calls.every((call) => call.values.end_exclusive === '2026-11-17'));
    }
  } finally {
    db.close();
  }
});
