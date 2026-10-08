import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

export async function engine() {
  const source = resolve('business/inventory-dealer/source');
  const result = await build({
    stdin: { contents: `export {loadDealerDemoPayload} from '${source}/dealer/web/src/lib/dealer-demo-live-data.ts';`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', define: {'process.env': '{}'},
    plugins: [{name: 'dealer-source', setup(api) {
      api.onResolve({filter: /^server-only$/}, () => ({path: 'empty', namespace: 'empty'}));
      api.onLoad({filter: /.*/, namespace: 'empty'}, () => ({contents: 'export {};'}));
      api.onResolve({filter: /(gea-sql-client|dealer-direct-sql-client)$/}, () => ({path: resolve(source, 'inventory-light-plugins/src/data.ts')}));
      api.onResolve({filter: /channel\.js$/}, () => ({path:'transport',namespace:'transport'}));
      api.onLoad({filter: /.*/,namespace:'transport'}, () => ({contents: `import{readDealerMock}from '${source}/inventory-light-plugins/src/dealer-mock-sql.ts';export const call=(method,parameters,options)=>{if(method!=='sql')throw Error('UNEXPECTED_TEST_METHOD');return readDealerMock(parameters,options)};`,resolveDir:process.cwd()}));
      api.onResolve({filter: /^@\//}, args => api.resolve(resolve(source, 'dealer/web/src', args.path.slice(2)), {kind: args.kind, resolveDir: source}));
    }}],
  });
  const module = {exports: {}};
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}

test('the received dealer loader keeps 201 SKU recommendations and full-scope health using only local inputs', async () => {
  const {loadDealerDemoPayload} = await engine();
  const result = await loadDealerDemoPayload('customer-A', {scope: 'single', orderSuggestionsOnly: true, exportTab: 'sku', snapshotDate: '2026-09-30', planMonth: '2026-10'});
  assert.equal(result.skus.length, 201);
  assert.equal(result.skus.at(-1).code, 'sku-A-200');
  assert.equal(result.skus.at(-1).orderRecommendation.quantity, 8);
  assert.equal(result.totalInventory, 12060);
  assert.equal(result.totalTransitInventory, 2412);
  assert.equal(result.forecastSales, 24120);
  assert.equal(result.unreasonableSkuCount, 201);
  assert.equal(result.shortageSkuCount, 201);
  assert.equal(result.coveredSkuCount, 0);
  assert.equal(result.sales30Coverage, 1);
});

test('dealer view recovery accepts authored filters and local drafts, while rejecting business facts', async () => {
  const result = await build({entryPoints: ['src/html-view-state.ts'], bundle: true, write: false, format: 'cjs', platform: 'node'});
  const module = {exports: {}};
  new Function('module','exports',result.outputFiles[0].text)(module,module.exports);
  const valid = module.exports.validHtmlViewState;
  assert.equal(valid('inventory-dealer', {version: 1, customer: 'customer-A', tab: 'sku', page: 21, pageSize: 10, cart: {}, orderHeaders: {}}), true);
  assert.equal(valid('inventory-dealer', {version:1, cart:{'customer-A:sku-A-200':{key:'customer-A:sku-A-200',customerCode:'customer-A',code:'sku-A-200',name:'商品A',quantity:8,suggestedQuantity:8,reason:'',evidence:'固定输入',source:'suggestion',status:'local-only',selectedAt:'2026-10-07T00:00:00Z',unitPrice:null,category:'汤圆',policyId:''}}}),true);
  assert.equal(valid('inventory-dealer', {version: 1, data: {totalInventory: 12060}}), false);
  assert.equal(valid('inventory-dealer', {version: 1, authenticated: true}), false);
});
