import test from 'node:test';
import assert from 'node:assert/strict';
import { relationRecords, readRelations } from '../static/mps/source/relations.js';
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
        { material_code: null, material_name: '同名产品', series: '空码产线' },
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
  assert.deepEqual(result.sku[4].missing, ['缺产线物料编码', '无产品记录']);
  assert.equal(result.sku[4].product, null);
});

test('relationship collection reads named sources completely and rejects incomplete or inconsistent sources', async () => {
  const records = {
    products: Array.from({ length: 201 }, (_value, index) => ({
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
  assert.equal(result.sources.products.length, 201);
  assert.equal(result.records.sku.length, 201);
  assert(calls.some((call) => call.queryId === 'products.detail' && call.values.offset === 200));
  assert(
    calls.some((call) => call.queryId === 'transfers.count' && call.values.period === '2026-10'),
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
  assert.throws(
    () =>
      relationRecords(
        { products: [], sku_capacity: [], tunnels: [], transfers: [transfer] },
        '2026-11',
      ),
    /调拨源月份/,
  );
});

test('self-produced source labels with empty directions stay unconfirmed', () => {
  const source = {
    stat_period: '2026-10',
    material_code: '001',
    series: '系列甲',
    target_base: '四川',
    transfer_tag: '自产',
    transfer_direction: null,
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
