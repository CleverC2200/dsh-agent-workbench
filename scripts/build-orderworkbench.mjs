import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { orderWorkbenchSourceConfig } from '../business/inventory-orderworkbench/source-config.mjs';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'prototypes/inventory-orderworkbench');
const out = resolve(root, 'lib/business/inventory-orderworkbench');
const theme = (await readFile(resolve(root, 'theme/tokens.css'), 'utf8')).replace(/\r\n/g, '\n');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const apsConfig = JSON.parse(
  await readFile(resolve(root, 'business/inventory-apsplan/sql.config.json'), 'utf8'),
);
const sqlConfig = orderWorkbenchSourceConfig(apsConfig);
const runtimeEntry = resolve(source, 'metric-runtime.mjs');
const scan = await build({
  entryPoints: [runtimeEntry],
  bundle: true,
  write: false,
  metafile: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  absWorkingDir: root,
  define: { ORDER_WORKBENCH_METRIC_VERSION: '0' },
});
const runtimeInputs = await Promise.all(
  Object.keys(scan.metafile.inputs)
    .sort()
    .map(async (path) => [path, digest(await readFile(resolve(root, path)))]),
);
const revision = digest(JSON.stringify({ queries: sqlConfig, inputs: runtimeInputs }));
const metricVersion = Number.parseInt(revision.slice(0, 12), 16);
const runtime = await build({
  entryPoints: [runtimeEntry],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  absWorkingDir: root,
  define: { ORDER_WORKBENCH_METRIC_VERSION: JSON.stringify(metricVersion) },
});
sqlConfig.metricRuntime = {
  schemaVersion: 1,
  version: metricVersion,
  revision,
  file: 'metric-runtime.mjs',
  sha256: digest(runtime.outputFiles[0].contents),
};
if (digest(theme) !== '51d07dd91c4e2851301c046556a9c34aded00c5fa94525420b949badce9a5497')
  throw Error('ORDER_THEME_RESOURCE_MISMATCH');
const bundled = await build({
  entryPoints: [resolve(source, 'entry.js')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110', 'safari16'],
  define: {
    ORDER_WORKBENCH_APS_CONFIG: JSON.stringify(sqlConfig),
    ORDER_WORKBENCH_METRIC_VERSION: JSON.stringify(metricVersion),
  },
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
  .replace('__SHARED_THEME_RESOURCE__', theme)
  .replace('__ORDER_THEME__', await readFile(resolve(source, 'theme.css'), 'utf8'))
  .replace('__ORDER_ENTRY__', bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'sql.config.json'), JSON.stringify(sqlConfig, null, 2) + '\n');
await writeFile(resolve(out, 'metric-runtime.mjs'), runtime.outputFiles[0].contents);
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
