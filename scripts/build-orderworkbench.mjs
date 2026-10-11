/** Assemble the original report UI, current page channel and Agent-owned resources. */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'prototypes/inventory-orderworkbench');
const out = resolve(root, 'lib/business/inventory-orderworkbench');
const theme = await readFile(resolve(root, 'theme/tokens.css'), 'utf8');
const digest = (value) => createHash('sha256').update(value).digest('hex');
if (digest(theme) !== '19c4e31943862d2087c1be1d0efa5966cde7dcce1989e92390f540ce0c3eaa66')
  throw Error('ORDER_THEME_RESOURCE_MISMATCH');
const bundled = await build({
  entryPoints: [resolve(source, 'entry.js')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110', 'safari16'],
});
const html = (await readFile(resolve(source, 'index.html'), 'utf8'))
  .replace('/* SHARED_THEME_RESOURCE */', theme)
  .replace('/* ORDER_THEME */', await readFile(resolve(source, 'theme.css'), 'utf8'))
  .replace('/* ORDER_ENTRY */', bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'index.html'), html);
for (const name of ['plugin.json', 'page.json', 'SOURCE.json'])
  await cp(resolve(source, name), resolve(out, name));
const agent = resolve(root, '../dsh-agent-manage/business-resources/inventory-orderworkbench');
for (const name of ['capability.json', 'prompt.json', 'mcp.json', 'skills'])
  await cp(resolve(agent, name), resolve(out, name), { recursive: true });
await writeFile(
  resolve(out, 'build-inputs.json'),
  JSON.stringify({ themeSha256: digest(theme), htmlSha256: digest(html) }, null, 2) + '\n',
);
console.log('Built inventory-orderworkbench from Workbench page and Manage mock resources');
