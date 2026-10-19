import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

test('Host initializes package resources in a Chinese path and serves the registered HTML', async (t) => {
  const root = await mkdtemp(join(tmpdir(), '工作台初始化-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'samples'));
  await mkdir(join(root, 'theme'));
  for (const id of ['regional', 'category', 'mps']) {
    const directory = join(root, 'static', id);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'plugin.json'),
      JSON.stringify({ schemaVersion: 1, id: 'plan-' + id, name: id, html: 'index.html' }),
    );
    await writeFile(
      join(directory, 'index.html'),
      '<html><head></head><body>' + id + '</body></html>',
    );
  }
  const themeInputs = Object.fromEntries(
    await Promise.all(
      ['tokens.css', 'html-defaults.css'].map(async (name) => [
        name,
        await readFile('theme/' + name, 'utf8'),
      ]),
    ),
  );
  for (const [name, contents] of Object.entries(themeInputs))
    await writeFile(join(root, 'theme', name), contents);
  await writeFile(
    join(root, 'samples/plugin.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'workbench-html-table',
      name: '表格样板',
      html: 'index.html',
    }),
  );
  await writeFile(
    join(root, 'samples/index.html'),
    '<html><head></head><body>中文资源已加载</body></html>',
  );
  for (const id of [
    'fc',
    'aqkc',
    'qll',
    'dealer',
    'customer',
    'orderworkbench',
    'orderfulfillment',
    'apsplan',
  ]) {
    const directory = join(root, 'business', 'inventory-' + id);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'plugin.json'),
      JSON.stringify({ schemaVersion: 1, id: 'inventory-' + id, name: id, html: 'index.html' }),
    );
    await writeFile(
      join(directory, 'index.html'),
      '<html><head></head><body>' + id + '</body></html>',
    );
  }
  await build({
    entryPoints: ['src/page-interaction/page.ts'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    outfile: join(root, 'page-picker.js'),
  });
  const entry = join(root, 'host.mjs');
  await build({
    entryPoints: ['src/host.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: entry,
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
  const { apply } = await import(pathToFileURL(entry).href);
  const routes = new Map();
  const context = {
    connection: {
      fetch: {
        register: (route) => {
          routes.set(route.path, route);
          return () => routes.delete(route.path);
        },
      },
    },
    effect: (operation) => operation(),
    on: () => () => {},
    inject: () => {},
    provide: (name, value) => {
      context[name] = value;
    },
  };
  await apply(context, {});
  await assert.rejects(apply(context, { cwd: 'relative/project' }), /cwd must be absolute/);
  const configuration = await (await routes.get('/api/agent-workbench/config').fetch()).json();
  assert.deepEqual(
    configuration,
    {},
    'ordinary bundle startup does not manufacture a business directory from process.cwd',
  );
  const metadata = await routes
    .get('/api/agent-workbench/pages')
    .fetch(new Request('https://localhost/api/agent-workbench/pages'));
  const pages = await metadata.json();
  assert.equal(pages[0].name, '表格样板');
  for (const id of [
    'inventory-qll',
    'inventory-dealer',
    'inventory-customer',
    'inventory-orderfulfillment',
  ])
    assert.equal(pages.filter((page) => page.id === id).length, 1);
  assert.equal(
    pages.some((page) => page.id === 'inventory-orderworkbench'),
    false,
  );
  assert.equal(context.workbenchPages.packages().length, 11);
  assert.equal(
    pages.filter((page) => page.id === 'inventory-apsplan').length,
    1,
    'the shipped APS page is part of ordinary empty-config startup',
  );
  const response = await routes
    .get('/api/agent-workbench/html')
    .fetch(new Request('https://localhost' + pages[0].url));
  assert.equal(response.status, 200);
  const servedHtml = await response.text();
  assert.match(servedHtml, /中文资源已加载/);
  assert.match(
    servedHtml,
    /--dsw-alias-label-primary: var\(--workbench-text\)/,
    'Host loads the packaged HTML-only defaults into actual HTML responses',
  );
  const nativeTheme = await (
    await routes
      .get('/api/agent-workbench/theme.css')
      .fetch(new Request('https://localhost/api/agent-workbench/theme.css'))
  ).text();
  assert.doesNotMatch(
    nativeTheme,
    /--dsw-alias-label-primary/,
    'the Native theme endpoint retains its original resource',
  );
  assert.equal(nativeTheme, themeInputs['tokens.css']);
  assert.ok(servedHtml.includes(themeInputs['html-defaults.css']));
  if (process.env.THEME_PRESENT_INPUT_EVIDENCE)
    await writeFile(
      process.env.THEME_PRESENT_INPUT_EVIDENCE,
      JSON.stringify(
        {
          inputs: Object.fromEntries(
            Object.entries(themeInputs).map(([name, contents]) => [
              'theme/' + name,
              createHash('sha256').update(contents).digest('hex'),
            ]),
          ),
          runtimePaths: ['lib/theme/tokens.css', 'lib/theme/html-defaults.css'],
          htmlIncludesDefaults: true,
          nativeThemeUnchanged: true,
        },
        null,
        2,
      ) + '\n',
    );
  // The same official configuration withdraws one original source without changing the other roots.
  const retainedRoots = context.workbenchPages
    .packages()
    .map((item) => item.directory)
    .filter(
      (directory) => !directory.endsWith('/samples') && !directory.endsWith('/static/regional'),
    );
  const nextRoutes = new Map();
  const next = {
    ...context,
    connection: {
      fetch: {
        register: (route) => {
          nextRoutes.set(route.path, route);
          return () => nextRoutes.delete(route.path);
        },
      },
    },
    provide: (name, value) => {
      next[name] = value;
    },
  };
  await apply(next, { cwd: root, htmlRoots: retainedRoots });
  const withdrawn = await (
    await nextRoutes
      .get('/api/agent-workbench/pages')
      .fetch(new Request('https://localhost/api/agent-workbench/pages'))
  ).json();
  assert.equal(
    withdrawn.some((page) => page.id === 'plan-regional'),
    false,
  );
  assert.deepEqual(
    withdrawn.map((page) => page.id).sort(),
    pages
      .filter((page) => page.id !== 'plan-regional')
      .map((page) => page.id)
      .sort(),
  );
});
