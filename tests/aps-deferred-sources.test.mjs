import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const out = await build({
  entryPoints: ['business/inventory-apsplan/source/app/data/gea-workspace.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  plugins: [
    {
      name: 'source-seam',
      setup(api) {
        api.onResolve({ filter: /\/current-shortage$/ }, () => ({
          path: 'current-shortage',
          namespace: 'fixture',
        }));
        api.onResolve({ filter: /\/workspace-query$/ }, () => ({
          path: 'workspace-query',
          namespace: 'fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
          contents:
            args.path === 'current-shortage'
              ? 'export const readCurrentShortage=(...args)=>globalThis.__apsPendingRead?.(...args) ?? Promise.resolve({rows:[]});'
              : 'export const readWorkspaceQuery=(config,name,values,options)=>globalThis.__apsSourceRead(name,values,options);',
          loader: 'js',
        }));
      },
    },
  ],
});
const { createGeaWorkspace } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('direct initial metrics omit unused forecast SKU details; an explicit details request still reads them', async (t) => {
  const before = new Map(
    ['document', '__apsSourceRead'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  t.after(() => {
    for (const [k, v] of before) v ? Object.defineProperty(globalThis, k, v) : delete globalThis[k];
  });
  globalThis.document = { getElementById: (id) => (id === 'agent-sql-direct' ? {} : null) };
  const calls = [];
  globalThis.__apsSourceRead = async (name) => {
    calls.push(name);
    return name === 'forecast-products' ? [{ material: 'A', predicted: 12 }] : [];
  };
  const run = createGeaWorkspace(() => {
    throw Error('unexpected transport');
  });
  const input = { date: '2026-10-15', granularity: 'month', version: '滚动', orderType: 'M' };
  const initial = await run(input);
  assert.ok(!calls.includes('forecast-products'));
  assert.equal(initial.sections.find((s) => s.id === 'forecast-products').status, 'deferred');
  assert.ok(calls.includes('stock'));
  assert.ok(calls.includes('production'));
  const mark = calls.length;
  const detail = await run({ ...input, stage: 'details' });
  assert.deepEqual(calls.slice(mark), ['forecast-products']);
  assert.equal(detail.sections.find((s) => s.id === 'forecast-products').rows[0].predicted, 12);
});

test('direct stock and shippable reuse one snapshot within a load, but a refresh reads again', async (t) => {
  const before = new Map(
    ['document', '__apsSourceRead'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  t.after(() => {
    for (const [k, v] of before) v ? Object.defineProperty(globalThis, k, v) : delete globalThis[k];
  });
  globalThis.document = { getElementById: (id) => (id === 'agent-sql-direct' ? {} : null) };
  const calls = [];
  globalThis.__apsSourceRead = async (name) => {
    calls.push(name);
    return ['stock', 'shippable'].includes(name)
      ? [
          {
            base: '郑州',
            inventory: '100',
            target: '80',
            available: '70',
            demand: '10',
            invalid: 0,
          },
        ]
      : [];
  };
  const run = createGeaWorkspace(() => {
    throw Error('unexpected transport');
  });
  const input = { date: '2026-10-15', granularity: 'month', version: '滚动', orderType: 'M' };
  const initial = await run(input);
  assert.equal(calls.filter((n) => ['stock', 'shippable'].includes(n)).length, 1);
  const stock = initial.sections.find((s) => s.id === 'stock').rows[0],
    ship = initial.sections.find((s) => s.id === 'shippable').rows[0];
  assert.equal(stock.inventory, 100);
  assert.equal(ship.available, 70);
  assert.equal(ship.demand, 10);
  stock.available = 0;
  assert.equal(ship.available, 70, 'consumers must not share mutable rows');
  await run({ ...input, refresh: true });
  assert.equal(
    calls.filter((n) => ['stock', 'shippable'].includes(n)).length,
    2,
    'no cross-load cache',
  );
});

test('annual order and production queries overlap a slow stock query within three source slots', async (t) => {
  const before = new Map(
    ['document', '__apsSourceRead'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  t.after(() => {
    for (const [k, v] of before) v ? Object.defineProperty(globalThis, k, v) : delete globalThis[k];
  });
  globalThis.document = { getElementById: (id) => (id === 'agent-sql-direct' ? {} : null) };
  let release,
    active = 0,
    peak = 0;
  const annual = [];
  const progress = [];
  globalThis.__apsSourceRead = async (name, values) => {
    active++;
    peak = Math.max(peak, active);
    try {
      if (values.start.startsWith('2025')) {
        annual.push(name);
        if (name === 'stock') await new Promise((r) => (release = r));
      }
      return [];
    } finally {
      active--;
    }
  };
  const run = createGeaWorkspace(() => {
    throw Error('unexpected transport');
  });
  const job = run({
    date: '2026-10-15',
    granularity: 'month',
    version: '滚动',
    orderType: 'M',
    comparison: true,
    onComparison: (data) => progress.push(data),
  });
  await new Promise(setImmediate);
  const overlap = annual.includes('orders-month') && annual.includes('production');
  const earlyProduction = progress.some((p) =>
    p.annual?.sections.some((s) => s.id === 'production' && s.status === 'empty'),
  );
  release();
  await job;
  assert.ok(overlap, 'annual comparisons must not serialize behind the slow stock source');
  assert.ok(peak <= 3);
  assert.ok(earlyProduction, 'completed annual production must publish before slow stock finishes');
});

test('summary defers branch and operations until explicit details are requested', async (t) => {
  const prior = globalThis.document;
  t.after(() => {
    globalThis.document = prior;
    delete globalThis.__apsSourceRead;
  });
  globalThis.document = { getElementById: (id) => (id === 'agent-sql-direct' ? {} : null) };
  const calls = [];
  globalThis.__apsSourceRead = async (name) => {
    calls.push(name);
    return [];
  };
  const load = createGeaWorkspace(() => {
    throw Error('unexpected transport');
  });
  const input = {
    date: '2026-10-15',
    granularity: 'month',
    version: '滚动',
    orderType: 'M',
    summary: true,
  };
  const initial = await load(input);
  assert.ok(!calls.includes('branch') && !calls.includes('operations'));
  assert.equal(initial.sections.find((s) => s.id === 'branch').status, 'deferred');
  const mark = calls.length;
  await load({ ...input, stage: 'details' });
  assert.deepEqual(calls.slice(mark), ['forecast-products', 'branch', 'operations']);
});

test('ready landing stock survives a later full-source failure without inventing target or demand', async (t) => {
  const prior = globalThis.document;
  t.after(() => {
    globalThis.document = prior;
    delete globalThis.__apsSourceRead;
  });
  globalThis.document = { getElementById: (id) => (id === 'agent-sql-direct' ? {} : null) };
  const progress = [];
  globalThis.__apsSourceRead = async (name, values, options) => {
    if (name === 'stock') {
      options.onInventory?.([
        {
          base: '郑州',
          category: '汤圆',
          inventory: '100',
          records: 1,
          missing_target: 1,
          missing_demand: 1,
          target: null,
          demand: null,
        },
      ]);
      throw Object.assign(Error('full source unavailable'), { code: 'GEA_QUERY_FAILED' });
    }
    return [];
  };
  const load = createGeaWorkspace(() => {
    throw Error('unexpected transport');
  });
  const final = await load({
    date: '2026-10-15',
    granularity: 'month',
    version: '滚动',
    orderType: 'M',
    summary: true,
    onProgress: (p) => progress.push(p),
  });
  const stock = final.sections.find((s) => s.id === 'stock');
  assert.equal(stock.status, 'ready');
  assert.equal(stock.partial, true);
  assert.equal(stock.rows[0].inventory, 100);
  assert.equal(stock.rows[0].target, null);
  assert.equal(stock.rows[0].demand, null);
  assert.equal(stock.error.code, 'GEA_QUERY_FAILED');
  assert.ok(
    progress.some((p) => p.sections.find((s) => s.id === 'stock')?.rows[0]?.inventory === 100),
  );
});

test('landing cards start before pending-order analysis and all sources share the same limit', async (t) => {
  const prior = globalThis.document;
  const releases = [];
  t.after(() => {
    releases.forEach((release) => release());
    globalThis.document = prior;
    delete globalThis.__apsSourceRead;
    delete globalThis.__apsPendingRead;
  });
  globalThis.document = { getElementById: (id) => (id === 'agent-sql-direct' ? {} : null) };
  let active = 0,
    peak = 0,
    pendingStarted = false;
  const started = [];
  globalThis.__apsSourceRead = async (name) => {
    started.push(name);
    peak = Math.max(peak, ++active);
    try {
      if (started.length <= 3) await new Promise((resolve) => releases.push(resolve));
      return [];
    } finally {
      active--;
    }
  };
  globalThis.__apsPendingRead = async () => {
    pendingStarted = true;
    peak = Math.max(peak, ++active);
    await new Promise(setImmediate);
    active--;
    return { rows: [] };
  };
  const load = createGeaWorkspace(() => {
    throw Error('unexpected transport');
  });
  const job = load({
    date: '2026-10-15',
    granularity: 'month',
    version: '滚动',
    orderType: 'M',
    summary: true,
  });
  await new Promise(setImmediate);
  const firstWave = [...started];
  const pendingBeforeCards = pendingStarted;
  releases.forEach((release) => release());
  await job;
  assert.deepEqual(firstWave, ['finance', 'stock', 'orders-month']);
  assert.equal(pendingBeforeCards, false);
  assert.equal(pendingStarted, true);
  assert.ok(peak <= 3, `pending analysis created a fourth source: ${peak}`);
});
