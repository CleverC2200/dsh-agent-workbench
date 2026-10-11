import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const bundle = await build({
  stdin: {
    contents: `export {loadPersonal} from './business/inventory-personal/source/inventory-light-plugins/src/personal/data.ts';
      export {summarize,dedupeRisks} from 'dsh-agent-manage/inventory-compute/personal';
      export {pageContext} from './business/inventory-personal/source/inventory-light-plugins/src/native/context.ts';
      export {default as Page} from './business/inventory-personal/source/inventory-light-plugins/src/personal/page.tsx';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  loader: { '.css': 'empty', '.module.css': 'empty' },
  plugins: [
    {
      name: 'governed-input-and-host-ack',
      setup(api) {
        api.onResolve({ filter: /(?:mock|live)-input$|shared\/channel\.js$/ }, (args) => ({
          path: args.path,
          namespace: 'fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents: /\/(?:mock|live)-input$/.test(path)
            ? 'export const dataMode="mock";export const loadDailyReportInput=async()=>structuredClone(globalThis.personalAgeFixture.daily);export const clearFacts=()=>{};export const catalog=async()=>({warehouses:[]});export const load=async()=>{throw Error("unexpected branch read")};export const clearReadCache=()=>{};export const readSignal=()=>new AbortController().signal;'
            : `export const publish=async(snapshot,options)=>{options?.signal?.throwIfAborted();globalThis.personalAgeFixture.published.push(structuredClone(snapshot));return {accepted:true}};
       export const reportElements=()=>()=>{};export const draft=async()=>{};
       export const action=(name,_description,handler)=>{globalThis.personalAgeFixture.handlers.set(name,handler);return ()=>globalThis.personalAgeFixture.handlers.delete(name)};`,
        }));
      },
    },
  ],
});
const module = { exports: {} };
Function(
  'require',
  'module',
  'exports',
  bundle.outputFiles[0].text,
)(require, module, module.exports);
const personal = module.exports;
test.after(() => {
  delete globalThis.personalAgeFixture;
});

function daily(changes = {}) {
  return {
    generatedAt: '2026-09-20',
    localPreview: false,
    failedSources: [],
    targetMonth: '2026-09',
    targetVersion: '月初',
    targetRule: 'current',
    pendingSnapshot: '2026-09-20',
    pending: [],
    fulfillment: [],
    stock: [
      {
        base: '华东',
        material: 'A',
        name: '商品A',
        category: 'A',
        inventory: 100,
        target: 50,
        demand: 1,
        shipment30: 0,
        snapshot: '2026-09-20',
      },
    ],
    age: [
      {
        base: '华东',
        material: 'A',
        name: '商品A',
        category: 'A',
        inventory: 100,
        bands: [0, 100, 0, 0, 0],
        weightedAge: 3500,
        invalidQuantity: false,
        snapshot: '2026-09-20',
      },
    ],
    ...changes,
  };
}
function fixture(input) {
  globalThis.personalAgeFixture = {
    daily: input,
    published: [],
    handlers: new Map(),
  };
}

test('personal retains distinct 41–60 and over-60 risk filters after SKU deduplication', async () => {
  fixture(
    daily({
      stock: [],
      age: [
        {
          base: '郑州',
          material: 'A',
          name: 'A',
          category: 'A',
          inventory: 30,
          bands: [0, 0, 10, 20, 0],
          weightedAge: 2000,
          invalidQuantity: false,
          snapshot: '2026-09-20',
        },
      ],
    }),
  );
  const { objects } = await personal.loadPersonal(() => {});
  const raw = objects.flatMap((object) => object.risks);
  assert.equal(raw.filter((risk) => risk.type === '货龄').length, 1);
  assert.equal(raw.filter((risk) => risk.type === '大日期').length, 1);
  const merged = personal.dedupeRisks(raw);
  assert.equal(merged.length, 1);
  assert.equal(merged.filter((risk) => risk.tags.includes('货龄')).length, 1);
  assert.equal(merged.filter((risk) => risk.tags.includes('大日期')).length, 1);

  fixture(daily());
  const lower = (await personal.loadPersonal(() => {})).objects.flatMap((object) => object.risks);
  assert.equal(
    lower.filter((risk) => risk.type === '货龄').length,
    1,
    '31–40 remains ordinary age risk',
  );
  assert.equal(lower.filter((risk) => risk.type === '大日期').length, 0);
});

test('personal exposes source 31-plus quantity through ObjectData and summary', async () => {
  fixture(daily());
  const { objects } = await personal.loadPersonal(() => {});
  assert.equal(objects[0].over30, 100);
  assert.equal(personal.summarize(objects).over30, 100);
  assert.equal(personal.summarize(objects).partial.over30, false);
});

test('31-plus uses all three source bands and preserves a proven zero', async () => {
  for (const [bands, expected] of [
    [[40, 10, 20, 30, 0], 60],
    [[100, 0, 0, 0, 0], 0],
  ]) {
    const input = daily();
    input.age[0].bands = bands;
    // Deliberately unrelated average: over30 must come from counts, not the mean.
    input.age[0].weightedAge = 200;
    fixture(input);
    const { objects } = await personal.loadPersonal(() => {});
    assert.equal(objects[0].over30, expected);
    assert.equal(personal.summarize(objects).over30, expected);
  }
});

test('31-plus remains unknown for missing bands, unknown age, invalid quantity and failed age input', async () => {
  for (const mode of [
    'missing-band',
    'missing-unknown-band',
    'unknown-age',
    'invalid-quantity',
    'empty-age',
    'failed-age',
  ]) {
    const input = daily();
    if (mode === 'missing-band') input.age[0].bands[2] = null;
    if (mode === 'missing-unknown-band') input.age[0].bands.pop();
    if (mode === 'unknown-age') input.age[0].bands = [0, 90, 0, 0, 10];
    if (mode === 'invalid-quantity') input.age[0].invalidQuantity = true;
    if (mode === 'empty-age') input.age = [];
    if (mode === 'failed-age') input.failedSources = ['age'];
    fixture(input);
    const { objects } = await personal.loadPersonal(() => {});
    assert.equal(objects[0].over30, null, mode);
    assert.equal(personal.summarize(objects).over30, null, mode);
    assert.equal(personal.summarize(objects).partial.over30, true, mode);
  }
});

test('31-plus follows existing source permissions without hiding independent authorized age facts', async () => {
  for (const [gap, expected] of [
    ['age', null],
    ['inventory', null],
    ['stock', 100],
  ]) {
    fixture(daily({ permissionGaps: [gap] }));
    const { objects } = await personal.loadPersonal(() => {});
    assert.equal(objects[0].over30, expected, gap);
  }
});

test('age fixes preserve complete-aggregate unknown targets/movement/gap and successful empty pending', async () => {
  const input = daily();
  input.stock.push({
    base: '华东',
    material: 'B',
    name: 'B',
    category: 'B',
    inventory: 10,
    target: null,
    demand: null,
    shipment30: null,
    snapshot: '2026-09-20',
  });
  fixture(input);
  const { objects } = await personal.loadPersonal(() => {});
  assert.equal(objects[0].target, null);
  assert.equal(objects[0].stagnant, null);
  assert.equal(objects[0].shortage, 0);
  const summary = personal.summarize(objects);
  assert.equal(summary.target, null);
  assert.equal(summary.stagnant, null);
  assert.equal(summary.gap, null);
  assert.equal(summary.partial.target, true);
  assert.equal(summary.partial.stagnant, true);
  assert.equal(
    objects[0].over30,
    100,
    'independent complete age input still supplies its known count',
  );
});

test('the actual Personal Page publishes its age card value and both risk filters retain the SKU', async () => {
  const { JSDOM } = require('jsdom');
  const React = require('react');
  const dom = new JSDOM('<div id="app"></div>', {
    url: 'https://node-fixture.invalid/',
  });
  const previous = new Map(
    ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [key, globalThis[key]]),
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.close = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = () => {};
  const { createRoot } = require('react-dom/client');
  const root = createRoot(document.getElementById('app'));
  fixture(
    daily({
      stock: [],
      age: [
        {
          base: '郑州',
          material: 'A',
          name: 'A',
          category: 'A',
          inventory: 30,
          bands: [0, 0, 10, 20, 0],
          weightedAge: 2000,
          invalidQuantity: false,
          snapshot: '2026-09-20',
        },
      ],
    }),
  );
  try {
    await React.act(async () => {
      root.render(React.createElement(personal.Page));
    });
    const published = globalThis.personalAgeFixture.published.at(-1).parts.personalWorkbench;
    assert.equal(published.loading, false);
    assert.equal(published.summary.over30, 30);
    assert.equal(personal.pageContext().parts.personalWorkbench.summary.over30, 30);
    const card = document.querySelector('[data-page-target="personal:metric:平均货龄"]');
    assert.match(card.textContent, /31天以上30件/);
    assert.equal(card.textContent.includes('未返回'), false);
    assert.equal(document.querySelector('[data-page-reference-ready="true"]') !== null, true);
    for (const riskType of ['货龄', '大日期']) {
      await React.act(async () => {
        await globalThis.personalAgeFixture.handlers.get('filter')({
          riskType,
        });
      });
      const current = personal.pageContext().parts.personalWorkbench;
      assert.equal(current.filters.current.riskType, riskType);
      assert.equal(current.risks.length, 1);
      assert.equal(current.risks[0].tags.includes(riskType), true);
      assert.equal(document.querySelectorAll('[data-page-target^="personal:risk:"]').length, 1);
      assert.equal(current.summary.over30, 30);
    }
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of previous) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
