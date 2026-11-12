import test from 'node:test';
import assert from 'node:assert/strict';
import {
  relationRecords,
  readRelations,
  readPlanRelations,
} from '../static/mps/source/relations.js';
import { readFile } from 'node:fs/promises';
const config = JSON.parse(
  await readFile(new URL('../static/mps/sql.config.json', import.meta.url), 'utf8'),
);

test('relation result keeps every exact-code candidate and never matches by name or missing code', () => {
  const result = relationRecords(
    {
      products: [
        {
          material_code: '001',
          material_name: '同名产品',
          series: '产品系列',
          sub_category: '汤圆',
        },
        { material_code: '', material_name: '同名产品', series: null, sub_category: null },
        { material_code: '1', material_name: '同名产品', series: '系列乙', sub_category: '汤圆' },
      ],
      sku_capacity: [
        {
          material_code: '001',
          material_name: '源名甲',
          belong_base: '四川',
          workshop: '车间甲',
          tunnel_no: '1#',
          series: '源系列甲',
          combined_series: '组合甲乙',
          standard_daily_output_pc: 50,
          standard_daily_output_ton: 0,
        },
        {
          material_code: '001',
          material_name: '源名乙',
          belong_base: '广州',
          workshop: '车间乙',
          tunnel_no: '1#',
          series: '源系列乙',
          combined_series: '组合甲乙',
          standard_daily_output_pc: 50,
        },
        {
          material_code: null,
          material_name: '同名产品',
          series: '空码产线',
          combined_series: '组合系列',
          production_category: '生产品类',
        },
      ],
      tunnels: [],
      transfers: [],
    },
    '2026-10',
  );
  assert.equal(result.sku.length, 5);
  assert.equal(result.sku[0].capacity.belong_base, '四川');
  assert.equal(result.sku[1].capacity.belong_base, '广州');
  assert.equal(result.sku[0].product.series, '产品系列');
  assert.equal(result.sku[0].capacity.series, '源系列甲');
  assert.equal(result.sku[0].capacity.standard_daily_output_pc, 50);
  assert.equal(result.sku[0].capacity.standard_daily_output_ton, 0);
  assert.deepEqual(result.sku[2].missing, ['缺产品编码', '缺产品系列', '缺产品分类', '无候选产线']);
  assert.equal(result.sku[2].capacity, null);
  assert.equal(result.sku[3].product.material_code, '1');
  assert.equal(result.sku[3].capacity, null);
  assert.deepEqual(result.sku[4].missing, [
    '缺产线物料编码',
    '无产品记录',
    '缺基地、车间或隧道号，未建立产能关系',
  ]);
  assert.equal(result.sku[4].product, null);
});

test('relationship collection reads named sources completely and rejects incomplete or inconsistent sources', async () => {
  const records = {
    products: Array.from({ length: 5201 }, (_value, index) => ({
      material_code: String(index),
      material_name: `产品${index}`,
    })),
    sku_capacity: [],
    tunnels: [],
    transfers: [],
  };
  const calls = [];
  let truncated = false,
    changedVersion = false;
  const execute = async (_request, { queryId, values }) => {
    calls.push({ queryId, values });
    const rows = records[queryId.split('.')[0]];
    const result = queryId.endsWith('.count')
      ? [{ total: rows.length }]
      : rows
          .slice(values.offset, values.offset + (truncated ? 1 : values.page_size))
          .map((row) => ({
            ...Object.fromEntries(config.queries[queryId].columns.map((column) => [column, null])),
            ...row,
          }));
    return {
      rows: result,
      returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
      rejectedColumns: [],
      configVersion: changedVersion && queryId.startsWith('transfers') ? 'v2' : 'v1',
    };
  };
  const result = await readRelations(config, execute, '2026-10');
  assert.equal(result.sources.products.length, 5201);
  assert.equal(result.records.sku.length, 5201);
  assert.deepEqual(
    calls.filter((call) => call.queryId === 'products.detail').map((call) => call.values),
    [
      { page_size: 5000, offset: 0 },
      { page_size: 5000, offset: 5000 },
    ],
  );
  assert(
    calls.some((call) => call.queryId === 'transfers.count' && call.values.period === undefined),
  );
  truncated = true;
  await assert.rejects(readRelations(config, execute, '2026-10'), /分页与计数不一致/);
  truncated = false;
  changedVersion = true;
  await assert.rejects(readRelations(config, execute, '2026-10'), /数据源.*版本/);
});

test('relation result preserves production-unit and transfer source scope without assigning quantities or base aliases', () => {
  const tunnel = {
    belong_base: '四川',
    production_unit: '生产单位甲',
    tunnel_no: '1#',
    series: null,
    production_category: null,
    standard_daily_output_pc: 80,
  };
  const transfer = {
    stat_period: '2026-10',
    material_code: '001',
    series: '源系列',
    target_base: '广州',
    transfer_tag: '源标签',
    transfer_direction: '四川至广州',
    sap_category: 'SAP品类',
    old_category: '老大类',
    production_category: '生产品类',
  };
  const result = relationRecords(
    { products: [], sku_capacity: [], tunnels: [tunnel], transfers: [transfer] },
    '2026-10',
  );
  assert.equal(result.lines[0].source, tunnel);
  assert.deepEqual(result.lines[0].missing, ['缺源系列', '缺生产品类']);
  assert.equal(result.transfers[0].source, transfer);
  assert.deepEqual(result.transfers[0].missing, ['无产品记录']);
  assert.equal(result.transfers[0].month, '2026-10');
  const later = relationRecords(
    { products: [], sku_capacity: [], tunnels: [], transfers: [transfer] },
    '2026-11',
  );
  assert.equal(later.transfers[0].month, '2026-11');
  assert.equal(later.transfers[0].source.stat_period, '2026-10');
});

test('self-produced source labels with empty directions stay unconfirmed', () => {
  const source = {
    stat_period: '2026-10',
    material_code: '001',
    series: '系列甲',
    target_base: '四川',
    transfer_tag: '自产',
    transfer_direction: null,
    sap_category: 'SAP品类',
    old_category: '老大类',
    production_category: '生产品类',
  };
  const result = relationRecords(
    {
      products: [{ material_code: '001', series: '系列甲', sub_category: '汤圆' }],
      sku_capacity: [],
      tunnels: [],
      transfers: [source],
    },
    '2026-10',
  );
  assert.equal(result.transfers[0].source.transfer_tag, '自产');
  assert.deepEqual(result.transfers[0].missing, []);
  assert.deepEqual(result.transfers[0].pending, ['调拨方向待确认']);
});

test('source series and categories remain missing even when the exact product is complete', () => {
  const result = relationRecords(
    {
      products: [{ material_code: '001', series: '产品系列', sub_category: '产品分类' }],
      sku_capacity: [
        {
          material_code: '001',
          series: null,
          combined_series: '',
          production_category: ' ',
          standard_daily_output_pc: 0,
        },
      ],
      tunnels: [],
      transfers: [
        {
          stat_period: '2026-10',
          material_code: '001',
          series: '调拨系列',
          target_base: '四川',
          transfer_direction: '四川至广州',
          sap_category: null,
          old_category: '',
          production_category: ' ',
        },
      ],
    },
    '2026-10',
  );
  assert.deepEqual(result.sku[0].missing, [
    '缺产线源系列',
    '缺组合系列',
    '缺产线生产品类',
    '缺基地、车间或隧道号，未建立产能关系',
  ]);
  assert.equal(result.sku[0].capacity.standard_daily_output_pc, 0);
  assert.deepEqual(result.transfers[0].missing, ['缺SAP品类', '缺老大类', '缺调拨生产品类']);
  assert.deepEqual(result.transfers[0].pending, []);
});

test('求解只读取最新调拨快照，三个需求月共用并拒绝混合来源日期', async () => {
  const periods = [];
  let mixedPeriods = false;
  let changed = false;
  let latestPeriod = '2026-11';
  const execute = async (_request, { queryId, values }) => {
    const transfer = queryId.startsWith('transfers.');
    if (transfer) periods.push(values.period);
    const data = transfer
      ? [
          {
            ...Object.fromEntries(
              config.queries['transfers.detail'].columns.map((column) => [column, null]),
            ),
            stat_period: latestPeriod,
            material_code: 'A',
            transfer_direction: '甲→乙',
          },
        ]
      : [];
    if (transfer && mixedPeriods) data.push({ ...data[0], stat_period: '2026-10' });
    return {
      rows: queryId.endsWith('.count') ? [{ total: data.length }] : data,
      returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
      rejectedColumns: [],
      configVersion: changed && queryId === 'transfers.detail' ? 'changed' : 'v1',
    };
  };
  const months = ['2026-12', '2027-01', '2027-02'];
  const result = await readPlanRelations(config, execute, months);
  assert.deepEqual(
    result.sources.transfers.map((row) => row.stat_period),
    ['2026-11'],
  );
  assert.ok(periods.every((period) => period === undefined));
  assert.match(config.queries['transfers.detail'].request.sql, /MAX\(stat_period\)/);
  assert.match(config.queries['transfers.count'].request.sql, /MAX\(stat_period\)/);
  latestPeriod = '2026-11-26';
  const daily = await readPlanRelations(config, execute, months);
  assert.equal(daily.transferSourcePeriod, latestPeriod);
  assert.equal(daily.sources.transfers[0].stat_period, latestPeriod);
  latestPeriod = '2026-02-30';
  await assert.rejects(readPlanRelations(config, execute, months), /调拨.*来源日期/);
  latestPeriod = '2024-02-29';
  assert.equal(
    (await readPlanRelations(config, execute, months)).transferSourcePeriod,
    latestPeriod,
  );
  latestPeriod = '2026-11-26';
  mixedPeriods = true;
  await assert.rejects(readPlanRelations(config, execute, months), /调拨.*来源日期/);
  mixedPeriods = false;
  changed = true;
  await assert.rejects(readPlanRelations(config, execute, months), /配置.*变化|数据源.*版本/);
});

test('产线只按同基地同生产单位同隧道匹配，未匹配与多匹配保留候选原记录', () => {
  const tunnel = {
    belong_base: '甲',
    production_unit: '车间一',
    tunnel_no: 'T',
    series: '系列甲',
    production_category: '源品类',
    source_rows: 2,
  };
  const sku = {
    material_code: 'A',
    belong_base: '甲',
    workshop: '车间一',
    tunnel_no: 'T',
    series: 'SKU系列',
    production_category: 'SKU品类',
    combined_series: '组合',
  };
  const result = relationRecords(
    {
      products: [{ material_code: 'A', series: '产品系列', sub_category: '产品大类' }],
      tunnels: [tunnel, { ...tunnel, series: '系列乙' }],
      sku_capacity: [sku, { ...sku, workshop: '未知车间' }, { ...sku, workshop: '' }],
      transfers: [],
    },
    '2026-11',
  );
  assert.equal(result.sku[0].tunnelMatch.status, 'matched');
  assert.equal(result.sku[0].tunnelMatch.sourceIndexes.length, 2);
  assert.equal(result.sku[1].tunnelMatch.status, 'unmatched');
  assert.equal(result.sku[2].tunnelMatch.status, 'missing-key');
  assert.match(result.sku[1].missing.join('；'), /生产单位.*车间/);
  assert.match(result.lines[0].missing.join('；'), /重复/);
  assert.equal(result.sku[0].product.sub_category, '产品大类');
  assert.equal(result.sku[0].capacity.production_category, 'SKU品类');
});
