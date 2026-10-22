/** Assemble the retained prototype with current shared channel/theme and Manage resources. */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { prepareFulfillmentPresentation } from '../prototypes/inventory-orderfulfillment/prepare-presentation.mjs';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'prototypes/inventory-orderfulfillment');
const agent = resolve(root, '../dsh-agent-manage/business-resources/inventory-orderfulfillment');
const out = resolve(root, 'lib/business/inventory-orderfulfillment');
const digest = (text) => createHash('sha256').update(text).digest('hex');
const provenance = JSON.parse(await readFile(resolve(source, 'SOURCE.json'), 'utf8'));
let html = (await readFile(resolve(source, 'source.html'), 'utf8')).replace(/\r\n/g, '\n');
if (digest(html) !== provenance.sourceHtmlSha256) throw Error('PROTOTYPE_SOURCE_MISMATCH');
html = (await readFile(resolve(source, 'presentation.html'), 'utf8')).replace(/[ \t]+$/gm, '');
html = prepareFulfillmentPresentation(html);
const sqlConfig = await readFile(
  resolve(root, 'business/inventory-orderfulfillment/sql.config.json'),
  'utf8',
);
const theme = (await readFile(resolve(root, 'theme/tokens.css'), 'utf8')).replace(/\r\n/g, '\n');
if (digest(theme) !== '19c4e31943862d2087c1be1d0efa5966cde7dcce1989e92390f540ce0c3eaa66')
  throw Error('PROTOTYPE_THEME_MISMATCH');
const result = await build({
  entryPoints: [resolve(source, 'live-entry.js')],
  write: false,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
});
const state = await readFile(resolve(source, 'live-model.mjs'), 'utf8');
const style = await readFile(resolve(source, 'theme.css'), 'utf8');
html = html
  .replace('</head>', `<style>${theme}\n${style}</style></head>`)
  .replace(
    '</body>',
    `<script>${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body>`,
  );
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'index.html'), html);
await writeFile(resolve(out, 'sql.config.json'), sqlConfig);
for (const file of ['plugin.json', 'page.json'])
  await cp(resolve(source, file), resolve(out, file));
for (const file of [
  'capability.json',
  'prompt.json',
  'mcp.json',
  'skills',
  'agent-prompt.md',
  'SOURCE.json',
  'README.md',
])
  await cp(resolve(agent, file), resolve(out, file), { recursive: true });
await writeFile(
  resolve(out, 'build-inputs.json'),
  JSON.stringify(
    {
      ...provenance,
      sourceConsumerCode: provenance.consumerCode,
      consumerCode: 'order01',
      presentationSha256: digest(await readFile(resolve(source, 'presentation.html'), 'utf8')),
      sharedThemeSha256: digest(theme),
      stateSha256: digest(state),
      sqlConfigSha256: digest(sqlConfig),
      dataMode: 'GEA_GOVERNED_READONLY',
      themeBindingSha256: digest(style),
      channelBundleSha256: digest(result.outputFiles[0].text),
      htmlSha256: digest(html),
    },
    null,
    2,
  ) + '\n',
);
console.log('Built inventory-orderfulfillment governed page from Workbench and Manage');
