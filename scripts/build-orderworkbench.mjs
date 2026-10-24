/** Assemble the original report UI, current page channel and Agent-owned resources. */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { orderWorkbenchSourceConfig } from '../business/inventory-orderworkbench/source-config.mjs';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'prototypes/inventory-orderworkbench');
const out = resolve(root, 'lib/business/inventory-orderworkbench');
const theme = await readFile(resolve(root, 'theme/tokens.css'), 'utf8');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const apsConfig = JSON.parse(
  await readFile(resolve(root, 'business/inventory-apsplan/sql.config.json'), 'utf8'),
);
const sqlConfig = orderWorkbenchSourceConfig(apsConfig);
if (digest(theme) !== '19c4e31943862d2087c1be1d0efa5966cde7dcce1989e92390f540ce0c3eaa66')
  throw Error('ORDER_THEME_RESOURCE_MISMATCH');
const bundled = await build({
  entryPoints: [resolve(source, 'entry.js')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110', 'safari16'],
  define: { ORDER_WORKBENCH_APS_CONFIG: JSON.stringify(sqlConfig) },
  plugins: [
    {
      name: 'manage-aps-compute',
      setup(api) {
        api.onResolve({ filter: /^dsh-agent-manage\/aps-compute\/metrics$/ }, () => ({
          path: resolve(root, '../dsh-agent-manage/src/aps-compute/metrics.ts'),
        }));
      },
    },
  ],
});
const html = (await readFile(resolve(source, 'index.html'), 'utf8'))
  .replace('/* SHARED_THEME_RESOURCE */', theme)
  .replace('/* ORDER_THEME */', await readFile(resolve(source, 'theme.css'), 'utf8'))
  .replace('/* ORDER_ENTRY */', bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'sql.config.json'), JSON.stringify(sqlConfig, null, 2) + '\n');
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
console.log('Built inventory-orderworkbench from Workbench page and Manage resources');
