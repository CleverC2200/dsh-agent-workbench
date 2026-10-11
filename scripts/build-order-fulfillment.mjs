/** Assemble the retained prototype with current shared channel/theme and Manage resources. */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'prototypes/inventory-orderfulfillment');
const agent = resolve(root, '../dsh-agent-manage/business-resources/inventory-orderfulfillment');
const out = resolve(root, 'lib/business/inventory-orderfulfillment');
const digest = (text) => createHash('sha256').update(text).digest('hex');
const provenance = JSON.parse(await readFile(resolve(source, 'SOURCE.json'), 'utf8'));
let html = await readFile(resolve(source, 'source.html'), 'utf8');
if (digest(html) !== provenance.sourceHtmlSha256) throw Error('PROTOTYPE_SOURCE_MISMATCH');
const theme = await readFile(resolve(root, 'theme/tokens.css'), 'utf8');
if (digest(theme) !== '19c4e31943862d2087c1be1d0efa5966cde7dcce1989e92390f540ce0c3eaa66')
  throw Error('PROTOTYPE_THEME_MISMATCH');
const result = await build({
  entryPoints: [resolve(source, 'entry.js')],
  write: false,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
});
const state = await readFile(resolve(source, 'state.js'), 'utf8');
const style = await readFile(resolve(source, 'theme.css'), 'utf8');
html = html
  .replace('</head>', `<style>${theme}\n${style}</style></head>`)
  .replace('<main class="main fulfillment-page"', '<main id="app" class="main fulfillment-page"')
  .replace(' id="mainPage"', '')
  .replace(
    '<section class="content" id="fulfillmentView"',
    '<p id="prototypeStatus" role="status">模拟数据 · 未连接真实履约系统</p><section class="content" id="fulfillmentView"',
  )
  .replace(
    '    ordersNextPage.disabled = currentOrderPage >= pageCount || matchedRows.length === 0;',
    '    ordersNextPage.disabled = currentOrderPage >= pageCount || matchedRows.length === 0;\n      window.dispatchEvent(new Event("fulfillment-state-changed"));',
  )
  .replace(
    '</body>',
    `<script>${state}\n${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body>`,
  );
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'index.html'), html);
for (const file of ['plugin.json', 'page.json'])
  await cp(resolve(source, file), resolve(out, file));
for (const file of ['capability.json', 'prompt.json', 'mcp.json', 'skills'])
  await cp(resolve(agent, file), resolve(out, file), { recursive: true });
await writeFile(
  resolve(out, 'build-inputs.json'),
  JSON.stringify(
    {
      ...provenance,
      sharedThemeSha256: digest(theme),
      stateSha256: digest(state),
      themeBindingSha256: digest(style),
      channelBundleSha256: digest(result.outputFiles[0].text),
      htmlSha256: digest(html),
    },
    null,
    2,
  ) + '\n',
);
console.log('Built inventory-orderfulfillment prototype from Workbench and Manage');
