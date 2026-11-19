import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const { outputFiles } = await build({
  entryPoints: ['src/html-pages.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'official-tools',
      setup(builder) {
        builder.onResolve({ filter: /^@deepseek-ai\/dsh-tools$/ }, () => ({
          path: pathToFileURL(
            resolve('../../official-latest-standard/packages/core/tools/lib/index.js'),
          ).href,
          external: true,
        }));
      },
    },
  ],
});
const { HtmlPages } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);

function context(t) {
  const cleanups = [];
  t.after(() => cleanups.forEach((stop) => stop?.()));
  return {
    effect(start) {
      cleanups.push(start());
    },
    on() {
      return () => {};
    },
    inject() {},
    connection: {
      fetch: {
        register() {
          return () => {};
        },
      },
    },
  };
}
test('the existing regional menu declares its original interpreter resource without a second page', async (t) => {
  const pages = new HtmlPages(context(t), '', async () => '<picker-fixture>');
  await pages.registerHtml([resolve('static/regional')]);
  assert.deepEqual(
    pages.list().map(({ id, pluginId, resourceId }) => ({ id, pluginId, resourceId })),
    [
      {
        id: 'gea-regional-plan',
        pluginId: 'plan-regional',
        resourceId: 'gea-html-plan-regional',
      },
    ],
  );
});
test('registered package HTML is discoverable and readable without business identity or a Session', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-pages-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, 'plugin.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'inventory-test',
      name: 'Existing page',
      html: 'index.html',
      pages: [{ id: 'inventory-test', name: 'Existing page', view: '' }],
    }),
  );
  await writeFile(
    join(root, 'index.html'),
    '<html><head></head><body><button>Original interaction</button></body></html>',
  );
  const pages = new HtmlPages(context(t), '/* plugin theme */', async () => '<picker-fixture>');
  await pages.registerHtml([root]);
  assert.deepEqual(
    pages.list().map((page) => page.id),
    ['inventory-test'],
  );
  const response = await pages.fetch(
    new Request('https://localhost/api/agent-workbench/html?id=inventory-test'),
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<button>Original interaction<\/button>/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
  assert.match(response.headers.get('content-security-policy'), /worker-src 'none'/);
});

test('local computation workers require an explicit v2 declaration and retain network isolation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-worker-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = { schemaVersion: 1, id: 'worker-test', name: 'Worker', html: 'index.html' };
  await writeFile(join(root, 'index.html'), '<html><body>Worker</body></html>');
  for (const gea of [
    { localComputeWorker: true },
    { contract: 'gea-html-v2', localComputeWorker: 'true' },
  ]) {
    await writeFile(join(root, 'plugin.json'), JSON.stringify({ ...manifest, gea }));
    await assert.rejects(
      new HtmlPages(context(t), '', async () => '').registerHtml([root]),
      /INVALID_HTML_COMPUTE_WORKER/,
    );
  }
  await writeFile(
    join(root, 'plugin.json'),
    JSON.stringify({ ...manifest, gea: { contract: 'gea-html-v2', localComputeWorker: true } }),
  );
  const pages = new HtmlPages(context(t), '', async () => '');
  await pages.registerHtml([root]);
  const response = await pages.fetch(
    new Request('https://localhost/api/agent-workbench/html?id=worker-test'),
  );
  const policy = response.headers.get('content-security-policy');
  assert.match(policy, /worker-src blob:/);
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /frame-src 'none'/);
});

test('package HTML symlinks escaping the registered root are rejected', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-pages-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, 'plugin.json'),
    JSON.stringify({ schemaVersion: 1, id: 'inventory-test', name: 'Page', html: 'index.html' }),
  );
  await symlink('/etc/hosts', join(root, 'index.html'));
  await assert.rejects(
    new HtmlPages(context(t), '', async () => '<picker-fixture>').registerHtml([root]),
    /INVALID_HTML_PATH/,
  );
});
test('the received category artifact exposes one original page and its original resource identity', async (t) => {
  const pages = new HtmlPages(context(t), '', async () => '<picker-fixture>');
  const root = resolve('lib/static/category');
  await pages.registerHtml([root]);
  await pages.registerHtml([root]);
  assert.deepEqual(
    pages.list().map(({ id, pluginId, resourceId }) => ({ id, pluginId, resourceId })),
    [
      {
        id: 'plan-region-category',
        pluginId: 'category-plan',
        resourceId: 'gea-html-category-plan',
      },
    ],
  );
  const response = await pages.fetch(
    new Request('https://localhost/api/agent-workbench/html?id=plan-region-category'),
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /category:scope/);
});

test('the received MPS keeps one original menu entry with its original selectable resource identity', async (t) => {
  const pages = new HtmlPages(context(t), '', async () => '<picker-fixture>');
  await pages.registerHtml([resolve('static/mps')]);
  assert.deepEqual(
    pages.list().map((page) => ({ id: page.id, resourceId: page.resourceId })),
    [{ id: 'plan-category-production', resourceId: 'gea-html-inventory-mps' }],
  );
  assert.equal(
    (
      await pages.fetch(
        new Request('https://localhost/api/agent-workbench/html?id=plan-category-production'),
      )
    ).status,
    200,
  );
});

test('a hidden declared page leaves its package and interpreter resource installed and its HTML readable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-hidden-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, 'plugin.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'inventory-dealer',
      name: '经销商库存',
      html: 'index.html',
      gea: { contract: 'gea-html-v2' },
      declarations: { page: 'page.json', capability: 'capability.json' },
    }),
  );
  await writeFile(join(root, 'page.json'), JSON.stringify({ visible: false }));
  await writeFile(join(root, 'index.html'), '<html><body>Hidden dealer static page</body></html>');
  const pages = new HtmlPages(context(t), '', async () => '<picker-fixture>');
  await pages.registerHtml([root]);
  assert.deepEqual(pages.list(), []);
  assert.equal(pages.packages().length, 1);
  assert.equal(pages.packages()[0].manifest.id, 'inventory-dealer');
  assert.equal(
    (
      await pages.fetch(
        new Request('https://localhost/api/agent-workbench/html?id=inventory-dealer'),
      )
    ).status,
    200,
  );
});

test('serves the published branch inventory SQL configuration through the page host', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-fc-page-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await copyFile(resolve('business/inventory-fc/plugin.json'), join(root, 'plugin.json'));
  await copyFile(resolve('business/inventory-fc/page.json'), join(root, 'page.json'));
  await copyFile(resolve('business/inventory-fc/sql.config.json'), join(root, 'sql.config.json'));
  await writeFile(
    join(root, 'index.html'),
    '<html><head></head><body>Branch inventory</body></html>',
  );
  const pages = new HtmlPages(context(t), '', async () => '');
  await pages.registerHtml([root]);
  const request = new Request('https://localhost/api/agent-workbench/html?id=inventory-fc');
  const response = await pages.fetch(request);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /id="agent-sql-config"/);
  assert.match(html, /"base-warehouse.summary.snapshot"/);
  assert.match(html, /Branch inventory/);
});

test('keeps the SQL configuration limit scoped to the branch inventory host page', async (t) => {
  const pages = new HtmlPages(context(t), '', async () => '');
  for (const [id, contentBytes] of [
    ['inventory-fc', 9_000_000],
    ['inventory-dealer', 5_000_000],
  ]) {
    const root = await mkdtemp(join(tmpdir(), 'workbench-sql-limit-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(
      join(root, 'plugin.json'),
      JSON.stringify({
        schemaVersion: 1,
        id,
        name: id,
        html: 'index.html',
        sqlConfig: 'sql.config.json',
      }),
    );
    await writeFile(join(root, 'index.html'), '<html><body>fixture</body></html>');
    const config = JSON.stringify({ schemaVersion: 1, agentId: id, queries: {}, templates: {} });
    await writeFile(join(root, 'sql.config.json'), config.padEnd(contentBytes + 1));
    await pages.registerHtml([root]);
    await assert.rejects(
      pages.fetch(new Request(`https://localhost/api/agent-workbench/html?id=${id}`)),
      { message: 'SQL_CONFIG_TOO_LARGE' },
    );
  }
});
