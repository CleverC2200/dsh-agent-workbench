import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/html-pages.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { HtmlPages } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

test('registered package HTML is discoverable and readable without business identity or a Session', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-pages-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'plugin.json'), JSON.stringify({ schemaVersion: 1, id: 'inventory-test', name: 'Existing page', html: 'index.html', pages: [{ id: 'inventory-test', name: 'Existing page', view: '' }] }));
  await writeFile(join(root, 'index.html'), '<html><head></head><body><button>Original interaction</button></body></html>');
  const pages = new HtmlPages('/* plugin theme */');
  await pages.registerHtml([root]);
  assert.deepEqual(pages.list().map(page => page.id), ['inventory-test']);
  const response = await pages.fetch(new Request('https://localhost/api/agent-workbench/html?id=inventory-test'));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<button>Original interaction<\/button>/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
});

test('package HTML symlinks escaping the registered root are rejected', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-pages-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'plugin.json'), JSON.stringify({ schemaVersion: 1, id: 'inventory-test', name: 'Page', html: 'index.html' }));
  await symlink('/etc/hosts', join(root, 'index.html'));
  await assert.rejects(new HtmlPages('').registerHtml([root]), /INVALID_HTML_PATH/);
});
