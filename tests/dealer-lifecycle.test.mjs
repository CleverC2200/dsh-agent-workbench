import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

test('dealer scope changes and cancelled suggestions cannot retain old facts; errors recover', async (t) => {
  const ui = 'business/inventory-dealer/source/inventory-light-plugins';
  const require = createRequire(resolve(ui, 'package.json')),
    React = require('react'),
    { createRoot } = require('react-dom/client');
  const { JSDOM } = createRequire(resolve('package.json'))('jsdom');
  const dom = new JSDOM('<div id="app"></div>', {
    url: 'https://html-plugin.local',
  });
  const keys = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT', 'dealerTest'],
    previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(document.getElementById('app'), 'innerText', {
    get() {
      return this.textContent;
    },
  });
  const payload = (customer) => ({
    snapshotDate: '2026-09-30',
    planMonth: '2026-10',
    scopeLabel: customer,
    recordTotal: 1,
    customerCount: 1,
    totalInventory: customer === 'B' ? 22 : 11,
    totalTransitInventory: 0,
    totalInventoryValue: null,
    forecastSales: 30,
    customerSummaries: [{ code: customer, name: customer, inventory: 11 }],
    categorySummaries: [],
    shortageSkus: [],
    skus: [
      {
        code: 'sku-' + customer,
        sku: '商品-' + customer,
        stock: customer === 'B' ? 22 : 11,
        category: '汤圆',
        dealerCode: customer,
        suggestedStockQty: 2,
      },
    ],
    policies: [],
    customerCars: [],
    customerReceives: [],
    customerPickupPoints: [],
    totalTargetInventory: null,
    reasonableSkuCount: null,
    unreasonableSkuCount: null,
    coveredSkuCount: null,
    shortageSkuCount: null,
    nearExpirySkuCount: null,
    averageAge: null,
  });
  globalThis.dealerTest = {
    handlers: {},
    published: [],
    calls: [],
    hold: null,
    failure: null,
    deferred: [],
    customers: async () => ({
      customers: [
        { code: 'A', name: 'A' },
        { code: 'B', name: 'B' },
      ],
    }),
    load: (customer, options) => {
      const code = customer || 'A',
        value = payload(code);
      dealerTest.calls.push({ customer: code, options });
      if (dealerTest.failure) return Promise.reject(Error(dealerTest.failure));
      if (
        dealerTest.hold === code ||
        (dealerTest.hold === 'suggestions' && options.orderSuggestionsOnly)
      )
        return new Promise((done) =>
          dealerTest.deferred.push({
            signal: options.signal,
            done: () => done(value),
          }),
        );
      return Promise.resolve(value);
    },
  };
  const bundle = await build({
    stdin: {
      contents:
        'export {default} from "./' +
        ui +
        '/src/native/dealer.tsx";export {pageContext,clearContext} from "./' +
        ui +
        '/src/native/context.ts";',
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react', 'react-dom'],
    loader: { '.module.css': 'empty' },
    plugins: [
      {
        name: 'source-fixture',
        setup(api) {
          api.onResolve({ filter: /dealer-engine$/ }, () => ({
            path: 'engine',
            namespace: 'fixture',
          }));
          api.onResolve({ filter: /channel\.js$/ }, () => ({
            path: 'channel',
            namespace: 'fixture',
          }));
          api.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents:
              args.path === 'engine'
                ? 'export const loadDealerCustomers=(...a)=>dealerTest.customers(...a);export const loadDealerDemoPayload=(...a)=>dealerTest.load(...a);'
                : 'export const action=(name,description,fn)=>{dealerTest.handlers[name]=fn};export const publish=async v=>dealerTest.published.push(structuredClone(v));export const reportElements=()=>()=>{};export const ask=async()=>{};',
          }));
        },
      },
    ],
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    require,
    mod,
    mod.exports,
  );
  const container = document.getElementById('app'),
    root = createRoot(container);
  t.after(async () => {
    await React.act(async () => root.unmount());
    mod.exports.clearContext();
    dom.window.close();
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  });
  const settle = () =>
    React.act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
  const filter = async (args) => {
    await React.act(async () => dealerTest.handlers.filter(args));
    await settle();
  };
  const last = () => mod.exports.pageContext();
  await React.act(async () => root.render(React.createElement(mod.exports.default)));
  await settle();
  await filter({ customerCode: 'A', tab: 'sku' });
  assert.match(container.textContent, /商品-A/);
  dealerTest.hold = 'B';
  await filter({ customerCode: 'B' });
  assert.equal(last().parts.queryState.state, 'loading');
  assert.equal(last().parts.dealer, undefined);
  const lateB = dealerTest.deferred.at(-1);
  dealerTest.hold = null;
  await filter({ customerCode: 'A' });
  assert.equal(lateB.signal.aborted, true);
  await React.act(async () => lateB.done());
  await settle();
  assert.equal(last().parts.dealer.customerCode, 'A');
  assert.doesNotMatch(container.textContent, /商品-B/);
  const order = [...container.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === '客户订单',
  );
  assert.ok(order, container.textContent);
  await React.act(async () => order.click());
  dealerTest.hold = 'suggestions';
  const generate = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === '生成建议订单',
  );
  await React.act(async () => generate.click());
  await settle();
  const lateOrder = dealerTest.deferred.at(-1);
  dealerTest.hold = null;
  await filter({ customerCode: 'B', tab: 'sku' });
  assert.equal(lateOrder.signal.aborted, true);
  await React.act(async () => lateOrder.done());
  await settle();
  assert.equal(last().parts.dealerOrderSuggestions, undefined);
  dealerTest.failure = '当前账号暂无数据权限';
  await filter({ customerCode: 'A' });
  await React.act(async () => {
    await new Promise((done) => setTimeout(done, 380));
  });
  assert.equal(last().parts.queryState.state, 'error');
  assert.equal(last().parts.dealer, undefined);
  dealerTest.failure = null;
  await filter({ customerCode: 'B' });
  await React.act(async () => {
    await new Promise((done) => setTimeout(done, 380));
  });
  assert.equal(last().parts.queryState.state, 'ready');
  assert.equal(last().parts.dealer.customerCode, 'B');
  const calls = dealerTest.calls.length;
  await filter({ customerCode: 'B', tab: 'sku' });
  assert.equal(dealerTest.calls.length, calls);
});
