import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { createQueryClient } from '../business/shared/configured-query-client.mjs';

async function load(entry, plugins = []) {
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins,
  });
  return import(
    'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
  );
}
const { injectSqlConfig } = await load('src/sql-config-document.ts');
const { sqlTemplate } = await load('business/shared/sql-config.ts');

test('all five Agents have a single adjacent SQL config with no credentials', async () => {
  for (const id of ['aqkc', 'fc', 'qll', 'apsplan', 'dealer']) {
    const root = `business/inventory-${id}/`;
    const manifest = JSON.parse(await readFile(root + 'plugin.json', 'utf8'));
    const config = JSON.parse(await readFile(root + manifest.sqlConfig, 'utf8'));
    assert.equal(config.agentId, manifest.id);
    assert.ok(Object.keys(config.queries).length);
    assert.ok(!/("password"|"delegationToken"|"connectionString")/.test(JSON.stringify(config)));
    for (const query of Object.values(config.queries)) {
      assert.deepEqual(Object.keys(query.request).sort(), ['includeTotal', 'parameters', 'sql']);
      if (query.pagination?.countQuery) assert.ok(config.queries[query.pagination.countQuery]);
    }
  }
});

test('configuration is inserted before author code and cannot close its data script', () => {
  const config = {
    schemaVersion: 1,
    agentId: 'fixture',
    templates: {},
    queries: {},
    note: '</script><script>alert(1)</script>',
    sourceFlag: '销售口径',
    padding: 'x'.repeat(2048),
  };
  const html = injectSqlConfig(
    '<!doctype html><html><head></head><body><script>APP()</script></body></html>',
    config,
  );
  assert.ok(html.indexOf('agent-sql-config') < html.indexOf('APP()'));
  assert.ok(html.indexOf('<meta charset="utf-8">') < html.indexOf('agent-sql-config'));
  assert.ok(html.indexOf('<meta charset="utf-8">') < 1024);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.deepEqual(JSON.parse(html.match(/id="agent-sql-config">([^<]*)<\/script>/)[1]), config);
  assert.throws(() => injectSqlConfig('', {}), /INVALID_AGENT_SQL_CONFIG/);
});

test('fixed fragments preserve quoted text and require exact interpolation arity', () => {
  const config = {
    schemaVersion: 1,
    agentId: 'template-fixture',
    templates: { test: { segments: ["SELECT '", "' AS value"] } },
    queries: {},
  };
  assert.equal(sqlTemplate(config, 'test', ['value']), "SELECT 'value' AS value");
  assert.throws(() => sqlTemplate(config, 'test'), /SQL_TEMPLATE_NOT_CONFIGURED/);
  assert.throws(() => sqlTemplate(config, 'toString'), /SQL_TEMPLATE_NOT_CONFIGURED/);
});

test('all thirteen full-chain SQL templates retain their pre-migration bytes', async () => {
  const { companySqlTemplates } = await load(
    'business/inventory-qll/source/inventory-light-plugins/src/qll-sql.ts',
  );
  const baseline = JSON.parse(await readFile('tests/fixtures/sql-template-baseline.json', 'utf8'));
  assert.deepEqual(Object.keys(companySqlTemplates).sort(), Object.keys(baseline.qll).sort());
  for (const [key, sql] of Object.entries(companySqlTemplates))
    assert.equal(createHash('sha256').update(sql).digest('hex'), baseline.qll[key], key);
});

test('full reads dispatch the configured count ID and parameter values for each page', async () => {
  const spec = {
    gea_p1: { name: 'page_size', type: 'integer', nullable: false, minimum: 1, maximum: 200 },
    gea_p2: { name: 'offset', type: 'integer', nullable: false, minimum: 0 },
  };
  const config = {
    queries: {
      list: {
        parameterSpec: spec,
        request: { sql: 'SELECT value AS value', parameters: {} },
        pagination: { countQuery: 'count' },
      },
      count: { parameterSpec: {}, request: { sql: 'SELECT COUNT(*) AS total', parameters: {} } },
    },
  };
  const calls = [];
  const client = createQueryClient(config, async (_request, options) => {
    calls.push([options.queryId, options.values]);
    return options.queryId === 'count'
      ? { rows: [{ total: 3 }] }
      : { rows: options.values.offset === 0 ? [{ value: 0 }, { value: 1 }] : [{ value: 2 }] };
  });
  const result = await client.readAll(
    'list',
    { page_size: 2, offset: 0 },
    { keyFields: ['value'] },
  );
  assert.equal(result.rows.length, 3);
  assert.deepEqual(calls, [
    ['count', {}],
    ['list', { page_size: 2, offset: 0 }],
    ['list', { page_size: 2, offset: 2 }],
    ['count', {}],
  ]);
});

test('changing a SQL config during full paging fails instead of mixing results', async () => {
  const config = {
    queries: {
      list: {
        parameterSpec: {
          gea_p1: { name: 'page_size', type: 'integer' },
          gea_p2: { name: 'offset', type: 'integer' },
        },
        request: { sql: 'SELECT 1 AS value' },
        pagination: { countQuery: 'count' },
      },
      count: { parameterSpec: {}, request: { sql: 'SELECT 1 AS total' } },
    },
  };
  const client = createQueryClient(config, async (_, { queryId }) =>
    queryId === 'count'
      ? { rows: [{ total: 1 }], configVersion: 'before' }
      : { rows: [{ value: 1 }], configVersion: 'after' },
  );
  await assert.rejects(
    client.readAll('list', { page_size: 10, offset: 0 }, { keyFields: ['value'] }),
    { code: 'QUERY_CONFIG_CHANGED' },
  );
});

test('monthly forecast uses an exclusive next month and annual stock uses the end month', async () => {
  const { readWorkspaceQuery } = await load('business/shared/workspace-query.ts');
  const config = JSON.parse(await readFile('business/inventory-apsplan/sql.config.json', 'utf8'));
  const calls = [];
  const execute = async (_, options) => {
    calls.push(options);
    return options.queryId === 'source.stock-date'
      ? { rows: [{ day: '2026-10-14' }] }
      : { rows: [{ total: 0 }] };
  };
  await readWorkspaceQuery(
    config,
    'forecast',
    { start: '2026-10-01', end: '2026-10-15', version: '滚动', order_type: 'M' },
    { execute },
  );
  const forecast = calls.find((call) => call.queryId === 'page.forecast.count');
  assert.equal(forecast.values.start, '202610');
  assert.equal(forecast.values.end_exclusive, '202611');
  await readWorkspaceQuery(
    config,
    'stock',
    { start: '2026-01-01', end: '2026-10-15', version: '滚动', order_type: 'M' },
    { execute },
  );
  const stock = calls.find((call) => call.queryId === 'page.stock.count');
  assert.equal(stock.values.month, '2026-10-01');
  assert.equal(stock.values.stock_date, '2026-10-14');
});

test('both accuracy sources bind the selected base in configured summary and detail reads', async () => {
  const { readWorkspaceQuery } = await load('business/shared/workspace-query.ts');
  const config = JSON.parse(await readFile('business/inventory-apsplan/sql.config.json', 'utf8'));
  for (const name of ['sales-accuracy', 'demand-accuracy']) {
    for (const summary of [false, true]) {
      const calls = [];
      await readWorkspaceQuery(
        config,
        name,
        { start: '2026-10-01', end: '2026-10-20', base: '华东', summary },
        {
          execute: async (_, options) => {
            calls.push(options);
            return options.queryId.endsWith('.count') ? { rows: [{ total: 0 }] } : { rows: [] };
          },
        },
      );
      assert.ok(calls.length);
      for (const call of calls) {
        assert.equal(call.values.base_mode, 'equal');
        assert.equal(call.values.base, '华东');
        assert.equal(call.values.source_flag, name === 'sales-accuracy' ? '销售口径' : '基地口径');
      }
    }
  }
});

test('Host rereads adjacent SQL on each presentation and rejects mismatched Agent identity', async (t) => {
  const { HtmlPages } = await load('src/html-pages.ts', [
    {
      name: 'unrelated-page-runtime',
      setup(api) {
        api.onResolve({ filter: /^\.\/page-runtime\.ts$/ }, () => ({
          path: 'runtime',
          namespace: 'fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'export class PageRuntime {constructor(){}}',
          loader: 'js',
        }));
      },
    },
  ]);
  const root = await mkdtemp(join(tmpdir(), 'agent-sql-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, 'plugin.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'fixture',
      name: 'Fixture',
      html: 'index.html',
      sqlConfig: 'sql.config.json',
    }),
  );
  await writeFile(join(root, 'index.html'), '<html><head></head><body>page</body></html>');
  const config = { schemaVersion: 1, agentId: 'fixture', queries: {}, templates: {}, revision: 1 };
  await writeFile(join(root, 'sql.config.json'), JSON.stringify(config));
  const pages = new HtmlPages({}, '', async () => '');
  await pages.registerHtml([root]);
  const request = () => new Request('https://host/api/agent-workbench/html?id=fixture');
  assert.match(await (await pages.fetch(request())).text(), /"revision":1/);
  await writeFile(join(root, 'sql.config.json'), JSON.stringify({ ...config, revision: 2 }));
  assert.match(await (await pages.fetch(request())).text(), /"revision":2/);
  await writeFile(join(root, 'sql.config.json'), JSON.stringify({ ...config, agentId: 'other' }));
  await assert.rejects(pages.fetch(request()), /SQL_CONFIG_AGENT_MISMATCH/);
});

test('dealer resource lookup and all auxiliary readers use the same Agent config', async (t) => {
  const saved = globalThis.__dealerSqlReads;
  globalThis.__dealerSqlReads = [];
  t.after(() => {
    if (saved === undefined) delete globalThis.__dealerSqlReads;
    else globalThis.__dealerSqlReads = saved;
  });
  const dealer = await load(
    'business/inventory-dealer/source/dealer/web/src/lib/dealer-workbench-sql.ts',
    [
      {
        name: 'no-business-io',
        setup(api) {
          api.onResolve({ filter: /^(server-only|@\/lib\/gea-sql-client)$/ }, (args) => ({
            path: args.path,
            namespace: 'fixture',
          }));
          api.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            loader: 'js',
            contents:
              args.path === 'server-only'
                ? 'export {}'
                : `
export const executeAllGeaSqlPages=async(sql,options)=>{globalThis.__dealerSqlReads.push({sql,options});return []};
export const executeGeaSql=executeAllGeaSqlPages;
export const executeGeaSqlPage=async()=>({rows:[]});`,
          }));
        },
      },
    ],
  );
  await dealer.queryWorkbenchCustomerCars('fixture-customer');
  await dealer.queryWorkbenchCustomerReceives('fixture-customer');
  await dealer.queryWorkbenchCustomerPickupPoints('fixture-customer');
  const config = JSON.parse(await readFile('business/inventory-dealer/sql.config.json', 'utf8'));
  const reads = globalThis.__dealerSqlReads;
  assert.equal(reads.length, 3);
  for (const [index, key] of ['customerCar', 'customerReceive', 'customerPickup'].entries()) {
    assert.ok(reads[index].sql.includes(config.resourceNames[key]));
    assert.equal(reads[index].options.parameters.customerCode, 'fixture-customer');
  }
});

test('newly connected list fields are present in the default visible columns', async () => {
  for (const agent of ['aqkc', 'qll', 'apsplan', 'dealer']) {
    const config = JSON.parse(
      await readFile(`business/inventory-${agent}/sql.config.json`, 'utf8'),
    );
    for (const view of config.sourceViews.views) {
      const fields = new Set(view.columns.map((column) => column.field));
      for (const field of view.defaultColumns ?? [])
        assert.ok(fields.has(field), `${agent}/${view.id}: stale default ${field}`);
      if (view.id === 'base-stock-flows')
        for (const field of [
          'avg_30d_send',
          'pre_order_qty',
          'begin_stock',
          'turnover_days_stock',
          'turnover_days_avail',
        ])
          assert.ok(
            (view.defaultColumns ?? [...fields]).includes(field),
            `${agent}/${field}: hidden connected field`,
          );
      if (view.queryId === 'dealer.stock.detail')
        for (const field of ['analysis_avg_stock_age', 'analysis_target_inventory']) {
          if (fields.has(field))
            assert.ok(
              (view.defaultColumns ?? [...fields]).includes(field),
              `${agent}/${field}: hidden reference`,
            );
        }
    }
  }
});
