import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const result = await build({
  stdin: {contents: "export * from './business/inventory-qll/source/inventory-light-plugins/src/qll-engine.ts';export {mountBusinessFetch} from './business/inventory-qll/source/inventory-light-plugins/src/native/api.ts';", resolveDir: process.cwd()},
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{name: 'public-company-wire', setup(api) {
    api.onResolve({filter: /^dsh-agent-manage\/inventory-compute\/[a-z-]+$/}, x =>
      ({path: resolve('../dsh-agent-manage/src/inventory-compute', x.path.split('/').at(-1) + '.ts')}));
    api.onResolve({filter: /channel\.js$/}, () => ({path: 'wire', namespace: 'fixture'}));
    api.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents:
      'export const ready=Promise.resolve();export const currentSessionId=()=>globalThis.companySession; export const call=(...args)=>globalThis.companyWire(...args);'}));
  }}],
});
await mkdir('.runtime', {recursive: true});
const bundle = resolve('.runtime/qll-company-reception.mjs');
await writeFile(bundle, result.outputFiles[0].text);
const engine = await import(pathToFileURL(bundle));

test('the company page reads its current grant and fixed queries before publishing real scoped facts', async t => {
  globalThis.companySession = 'session-company';
  const calls = [];
  globalThis.companyWire = async (method, payload, options) => {
    options?.signal?.throwIfAborted();
    calls.push({method, payload});
    if (method === 'access') return {trusted: true, principalId: 'fixture-company', gatewayScopeRef: 'fixture-grant',
      allowedBases: ['华东'], allowedBranches: [], allowedCustomerIds: []};
    assert.equal(method, 'sql');
    let rows = [];
    if (payload.sql.includes('full-chain:BASE_SQL')) rows = [{snapshot_date: '2026-09-30', base_name: '华东',
      category: '饺子', sku: 'A', current_qty: '12', target_qty: '20', planned_daily_qty: '2', external_demand_30d: '36'}];
    if (payload.sql.includes('full-chain:BASE_AGE_SQL')) rows = [{snapshot_date: '2026-09-30', object_name: '华东',
      category: '饺子', sku: 'A', batch: 'B', qty: '12', age_days: '20'}];
    return {rows, total: rows.length, returnedColumns: [], rejectedColumns: []};
  };
  t.after(() => {engine.clearFacts(); delete globalThis.companySession; delete globalThis.companyWire;});
  const company = await engine.load({asOf:'2026-10-02',scope: 'company', part: 'current', filters: {month: '2026-10', base: '华东', category: '饺子'}});
  assert.equal(company.dataMode, 'GEA_LIVE_READONLY');
  assert.equal(company.kpis.inventoryLevel.companyCurrent, 12);
  assert.equal(company.categoryStructure[0].differenceQty, -8);
  assert.equal(company.categoryStructure[0].averageAgeDays, 20);
  assert.equal(company.structure.some(x => x.layer === 'customer'), false);
  assert.equal(calls[0].method, 'access');
  assert.ok(calls.some(x => x.method === 'sql'));
});

test('narrowing a trend queries that captured scope rather than filtering an aggregate from another scope', async t => {
  globalThis.companySession = 'session-company';
  const trendParameters = [];
  globalThis.companyWire = async (method, payload, options) => {
    options?.signal?.throwIfAborted();
    if (method === 'access') return {trusted: true, principalId: 'fixture-company', gatewayScopeRef: 'fixture-grant', allowedBases: ['华东'], allowedBranches: [], allowedCustomerIds: []};
    let rows = [];
    if (payload.sql.includes('full-chain:BASE_SQL')) rows = [{snapshot_date: '2026-09-30', base_name: '华东', category: '饺子', sku: 'A', current_qty: 12, target_qty: 20, external_demand_30d: 36}];
    if (payload.sql.includes('full-chain:COMPANY_TREND_SQL')) {
      trendParameters.push(payload.parameters);
      rows = [{snapshot_date: '2026-09-30', layer: 'base', qty: payload.parameters.gea_p7 === 'A' ? 12 : 99}];
    }
    return {rows, total: rows.length, returnedColumns: [], rejectedColumns: []};
  };
  t.after(() => {engine.clearFacts(); delete globalThis.companySession; delete globalThis.companyWire;});
  const company = await engine.load({asOf:'2026-10-02',scope: 'company', part: 'current', filters: {month: '2026-10', base: '华东', category: '饺子'}});
  const trend = await engine.loadTrend({workspaceId: company.workspaceId, filters: {sku: 'A'}});
  assert.deepEqual(trend.trends.inventory, [{snapshotDate: '2026-09-30', layer: 'base', qty: 12}]);
  assert.equal(trendParameters[0].gea_p7, 'A');
});

test('untrusted grants and unenabled channel scope cannot issue SQL', async t => {
  globalThis.companySession = 'session-company';
  const methods = [];
  globalThis.companyWire = async method => {methods.push(method); return {trusted: false, principalId: 'fixture'};};
  t.after(() => {engine.clearFacts(); delete globalThis.companySession; delete globalThis.companyWire;});
  await assert.rejects(engine.load({asOf:'2026-10-02',scope: 'company', filters: {month: '2026-10'}}), /可信身份/);
  assert.deepEqual(methods, ['access']);
  methods.length = 0;
  await assert.rejects(engine.load({asOf:'2026-10-02',scope: 'all-channel'}), /只开放公司/);
  assert.deepEqual(methods, []);
});

test('201 source rows reach complete detail pages without losing the final SKU', async t => {
  globalThis.companySession = 'session-company';
  const basePages = [];
  globalThis.companyWire = async (method, payload, options) => {
    options?.signal?.throwIfAborted();
    if (method === 'access') return {trusted: true, principalId: 'fixture-company', gatewayScopeRef: 'fixture-grant', allowedBases: ['华东'], allowedBranches: [], allowedCustomerIds: []};
    let rows = [], total = 0;
    if (payload.sql.includes('full-chain:BASE_SQL')) {
      basePages.push(payload.pageNo);
      total = 201;
      rows = Array.from({length: payload.pageNo === 1 ? 200 : 1}, (_, i) => ({snapshot_date: '2026-09-30', base_name: '华东', category: '饺子', sku: `SKU-${(payload.pageNo - 1) * 200 + i}`, current_qty: 1, target_qty: 2}));
    }
    return {rows, total, returnedColumns: [], rejectedColumns: []};
  };
  t.after(() => {engine.clearFacts(); delete globalThis.companySession; delete globalThis.companyWire;});
  const value = await engine.load({asOf:'2026-10-02',scope: 'company', filters: {month: '2026-10', base: '华东', category: '饺子'}});
  const all = [];
  for (let pageNo = 1; pageNo <= 3; pageNo++) {
    const page = await engine.loadDetails({workspaceId: value.workspaceId, kind: 'structure', layer: 'base', pageNo, pageSize: 100});
    assert.equal(page.total, 201); all.push(...page.rows);
  }
  assert.deepEqual(basePages, [1, 2]);
  assert.equal(all.length, 201);
  assert.equal(new Set(all.map(x => x.sku)).size, 201);
  assert.ok(all.some(x => x.sku === 'SKU-200'));
});

test('same-total column permission change refuses the whole source result', async t => {
  globalThis.companySession = 'session-company';
  globalThis.companyWire = async (method, payload, options) => {
    options?.signal?.throwIfAborted();
    if (method === 'access') return {trusted: true, principalId: 'fixture-company', gatewayScopeRef: 'fixture-grant', allowedBases: ['华东'], allowedBranches: [], allowedCustomerIds: []};
    if (!payload.sql.includes('full-chain:BASE_SQL')) return {rows: [], total: 0, returnedColumns: [], rejectedColumns: []};
    const rows = Array.from({length: payload.pageNo === 1 ? 200 : 1}, (_, i) => ({snapshot_date: '2026-09-30', base_name: '华东', category: '饺子', sku: `SKU-${i}`, current_qty: 1}));
    return {rows, total: 201, returnedColumns: payload.pageNo === 1 ? ['current_qty'] : ['current_qty', 'target_qty'], rejectedColumns: []};
  };
  t.after(() => {engine.clearFacts(); delete globalThis.companySession; delete globalThis.companyWire;});
  await assert.rejects(engine.load({asOf:'2026-10-02',scope: 'company', filters: {month: '2026-10', base: '华东'}}), /COLUMN_OR_TOTAL_CHANGED/);
});

test('a repeated business key across otherwise complete pages refuses the whole result', async t => {
  globalThis.companySession = 'session-company';
  globalThis.companyWire = async (method, payload, options) => {
    options?.signal?.throwIfAborted();
    if (method === 'access') return {trusted: true, principalId: 'fixture-company', gatewayScopeRef: 'fixture-grant', allowedBases: ['华东'], allowedBranches: [], allowedCustomerIds: []};
    if (!payload.sql.includes('full-chain:BASE_SQL')) return {rows: [], total: 0, returnedColumns: [], rejectedColumns: []};
    const rows = Array.from({length: payload.pageNo === 1 ? 200 : 1}, (_, i) => ({snapshot_date: '2026-09-30', base_name: '华东', category: '饺子', sku: `SKU-${i}`, current_qty: payload.pageNo === 1 ? 1 : 2}));
    return {rows, total: 201, returnedColumns: [], rejectedColumns: []};
  };
  t.after(() => {engine.clearFacts(); delete globalThis.companySession; delete globalThis.companyWire;});
  await assert.rejects(engine.load({asOf:'2026-10-02',scope: 'company', filters: {month: '2026-10', base: '华东'}}), /DUPLICATE_SOURCE_KEY/);
});

test('order history keeps distinct source periods within the same displayed month', async t => {
  globalThis.companySession = 'session-company';
  globalThis.companyWire = async (method, payload) => {
    if (method === 'access') return {trusted: true, principalId: 'fixture-company', gatewayScopeRef: 'fixture-grant', allowedBases: ['华东'], allowedBranches: [], allowedCustomerIds: []};
    const rows = payload.sql.includes('full-chain:ORDER_TREND_SQL') ? [
      {snapshot_date: '2026-10-08', month: '2026-10', source_order_period: '2026-10-01', pickup_type: 'factory', order_qty: 40, demand_qty: 40, shortage_qty: 0, shipped_qty: 40, affected_orders: 0},
      {snapshot_date: '2026-10-08', month: '2026-10', source_order_period: '2026-10-02', pickup_type: 'factory', order_qty: 210, demand_qty: 210, shortage_qty: 0, shipped_qty: 210, affected_orders: 0},
    ] : [];
    if (rows.length) assert.match(payload.sql, /CAST\("f"\."fromorderno_month" AS TEXT\) AS "source_order_period"/);
    return {rows, total: rows.length};
  };
  t.after(() => {engine.clearFacts(); delete globalThis.companySession; delete globalThis.companyWire;});
  const value = await engine.load({asOf: '2026-10-08', scope: 'company', filters: {month: '2026-10', base: '华东'}});
  const trend = await engine.loadTrend({workspaceId: value.workspaceId});
  assert.equal(trend.trends.orders.length, 1);
  assert.equal(trend.trends.orders[0].demandQty, 250);
});

test('order history still refuses repeated source periods with different quantities', async t => {
  globalThis.companySession = 'session-company';
  globalThis.companyWire = async (method, payload) => {
    if (method === 'access') return {trusted: true, principalId: 'fixture-company', gatewayScopeRef: 'fixture-grant', allowedBases: ['华东'], allowedBranches: [], allowedCustomerIds: []};
    const rows = payload.sql.includes('full-chain:ORDER_TREND_SQL') ? [40, 210].map(qty => ({
      snapshot_date: '2026-10-08', month: '2026-10', source_order_period: '2026-10-01', pickup_type: 'factory', order_qty: qty, demand_qty: qty, shortage_qty: 0, shipped_qty: qty, affected_orders: 0,
    })) : [];
    return {rows, total: rows.length};
  };
  t.after(() => {engine.clearFacts(); delete globalThis.companySession; delete globalThis.companyWire;});
  const value = await engine.load({asOf: '2026-10-08', scope: 'company', filters: {month: '2026-10', base: '华东'}});
  await assert.rejects(engine.loadTrend({workspaceId: value.workspaceId}), /DUPLICATE_SOURCE_KEY/);
});

test('order history refuses a missing source period rather than weakening duplicate detection', async t => {
  globalThis.companySession = 'session-company';
  globalThis.companyWire = async (method, payload) => {
    if (method === 'access') return {trusted: true, principalId: 'fixture-company', gatewayScopeRef: 'fixture-grant', allowedBases: ['华东'], allowedBranches: [], allowedCustomerIds: []};
    const rows = payload.sql.includes('full-chain:ORDER_TREND_SQL') ? [{snapshot_date: '2026-10-08', month: '2026-10', pickup_type: 'factory', order_qty: 40, demand_qty: 40, shortage_qty: 0, shipped_qty: 40, affected_orders: 0}] : [];
    return {rows, total: rows.length};
  };
  t.after(() => {engine.clearFacts(); delete globalThis.companySession; delete globalThis.companyWire;});
  const value = await engine.load({asOf: '2026-10-08', scope: 'company', filters: {month: '2026-10', base: '华东'}});
  await assert.rejects(engine.loadTrend({workspaceId: value.workspaceId}), /RESULT_INCOMPLETE/);
});

test('an explicitly frozen asOf is used in every governed company query', async t => {
  globalThis.companySession = 'session-company';
  const dates = [];
  globalThis.companyWire = async (method, payload) => {
    if (method === 'access') return {trusted: true, principalId: 'fixture-company', gatewayScopeRef: 'fixture-grant', allowedBases: ['华东'], allowedBranches: [], allowedCustomerIds: []};
    dates.push(payload.parameters.gea_p1);
    return {rows: [], total: 0, returnedColumns: [], rejectedColumns: []};
  };
  t.after(() => {engine.clearFacts(); delete globalThis.companySession; delete globalThis.companyWire;});
  await engine.load({asOf: '2026-10-02', scope: 'company', filters: {month: '2026-10', base: '华东'}});
  assert.ok(dates.length > 0);
  assert.ok(dates.every(x => x === '2026-10-02'), JSON.stringify(dates));
});

test('the normal page API forwards frozen asOf and missing inputs issue no SQL', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const surface = new EventTarget();
  Object.defineProperty(globalThis, 'window', {value: surface, configurable: true});
  globalThis.companySession = 'session-company';
  const dates = [];
  globalThis.companyWire = async (method, payload) => {
    if (method === 'access') return {trusted: true, principalId: 'fixture-company', gatewayScopeRef: 'fixture-grant', allowedBases: ['华东'], allowedBranches: [], allowedCustomerIds: []};
    dates.push(payload.parameters.gea_p1);
    return {rows: [], total: 0, returnedColumns: [], rejectedColumns: []};
  };
  t.after(() => {engine.clearFacts(); if (original) Object.defineProperty(globalThis, 'window', original); else delete globalThis.window; delete globalThis.companySession; delete globalThis.companyWire;});
  await engine.mountBusinessFetch();
  const missing = await surface.fetch('/api/workspace?scope=company&month=2026-10&part=current');
  assert.equal(missing.status, 503); assert.deepEqual(dates, []);
  const response = await surface.fetch('/api/workspace?scope=company&month=2026-10&part=current&asOf=2026-10-02');
  assert.equal(response.status, 200);
  assert.ok(dates.length > 0 && dates.every(x => x === '2026-10-02'));
});
