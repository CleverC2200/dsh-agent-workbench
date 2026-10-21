/** Assemble the retained offline prototype and current page-owned bridge. */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { customerShellMarkup } from '../prototypes/inventory-customer/load-state.js';
const root = resolve(import.meta.dirname, '..'),
  source = resolve(root, 'prototypes/inventory-customer'),
  out = resolve(root, 'lib/business/inventory-customer');
const theme = (await readFile(resolve(root, 'theme/tokens.css'), 'utf8')).replace(/\r\n/g, '\n');
if (
  createHash('sha256').update(theme).digest('hex') !==
  '19c4e31943862d2087c1be1d0efa5966cde7dcce1989e92390f540ce0c3eaa66'
)
  throw Error('PROTOTYPE_THEME_RESOURCE_MISMATCH');
const result = await build({
  entryPoints: [resolve(source, 'entry.js')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'chrome110',
  minify: true,
  metafile: true,
});
const code = result.outputFiles[0].text;
const styles =
  (await readFile(resolve(source, 'application.css'), 'utf8')) +
  '\n' +
  theme +
  '\n' +
  (await readFile(resolve(source, 'theme.css'), 'utf8'));
await mkdir(out, { recursive: true });
await writeFile(
  resolve(out, 'index.html'),
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; connect-src \'none\'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>客户库存</title><style>' +
    styles +
    '</style><body><main id="app"><p id="prototype-sync-status" class="prototype-notice" role="status" aria-live="polite"></p><p id="customer-load-status" data-state="waiting" role="status" aria-live="polite">客户库存界面尚未启动，数据尚未读取。</p><div id="root">' +
    customerShellMarkup() +
    '</div></main><script>' +
    code.replace(/<\/script/gi, '<\\/script') +
    '</script></body></html>',
);
for (const name of ['plugin.json', 'page.json'])
  await cp(resolve(source, name), resolve(out, name));
const resources = resolve(root, '../dsh-agent-manage/business-resources/inventory-customer');
for (const name of ['prompt.json', 'capability.json', 'mcp.json', 'skills'])
  await cp(resolve(resources, name), resolve(out, name), { recursive: true });
const inputs = {};
for (const input of Object.keys(result.metafile.inputs)) {
  const file = resolve(input);
  inputs[file] = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}
await writeFile(
  resolve(out, 'build-inputs.json'),
  JSON.stringify(
    {
      sourceCommit: 'e5ba6db343dd31e0b362516db712e72aeae0e611',
      sharedTheme: {
        version: '1.1.1',
        sha256: createHash('sha256').update(theme).digest('hex'),
      },
      inputs,
    },
    null,
    2,
  ) + '\n',
);
console.log('Built inventory-customer governed-read page from Workbench and Manage owners');
