import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { sqlConfigPlugin } from './sql-config-build.mjs';
const root = resolve(import.meta.dirname, '..'),
  resource = join(root, 'business/inventory-apsplan'),
  ui = join(resource, 'source'),
  out = join(root, 'lib/business/inventory-apsplan');
const manage = join(root, '../dsh-agent-manage');
const computeExport = JSON.parse(await readFile(join(manage, 'package.json'), 'utf8')).exports[
  './aps-compute/*'
];
if (computeExport?.source !== './src/aps-compute/*.ts')
  throw Error('MANAGE_APS_PUBLIC_EXPORT_MISMATCH');
const mock = process.env.APS_BUILD_MODE === 'mock';
const result = await build({
  define: { APS_MOCK: JSON.stringify(mock) },
  plugins: [
    sqlConfigPlugin(),
    {
      name: 'manage-aps-compute',
      setup(api) {
        api.onResolve({ filter: /^dsh-agent-manage\/aps-compute\/[a-z-]+$/ }, ({ path }) => ({
          path: join(manage, computeExport.source.replace('*', path.split('/').at(-1))),
        }));
      },
    },
  ],
  entryPoints: [join(ui, 'app/plugin-entry.tsx')],
  outfile: 'inventory-apsplan.js',
  loader: { '.module.css': 'local-css' },
  // Shared source panels must use the same React instance as the APS renderer.
  alias: { react: join(ui, 'node_modules/react'), 'react-dom': join(ui, 'node_modules/react-dom') },
  bundle: true,
  minify: true,
  write: false,
  metafile: true,
  platform: 'browser',
  target: 'chrome110',
  jsx: 'automatic',
  tsconfig: join(ui, 'tsconfig.json'),
  legalComments: 'none',
});
if (
  Object.keys(result.metafile.inputs).some((path) =>
    /node_modules\/(pg|vinext|next|fastify|express)\//.test(path),
  )
)
  throw Error('SERVER_DEPENDENCY_IN_PAGE');
let script = result.outputFiles.find((file) => file.path.endsWith('.js')).text;
const assets = [];
const inputs = {};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const path of new Set(script.match(/\/images\/[a-zA-Z0-9_.-]+\.(?:png|jpg|webp)/g) || [])) {
  const bytes = await readFile(join(ui, 'public', path));
  const mime = path.endsWith('.jpg')
    ? 'image/jpeg'
    : path.endsWith('.webp')
      ? 'image/webp'
      : 'image/png';
  const index = assets.push(`data:${mime};base64,${bytes.toString('base64')}`) - 1;
  script = script.replaceAll(JSON.stringify(path), `__apsImageAssets[${index}]`);
  if (script.includes(path)) throw Error('UNRESOLVED_PLUGIN_IMAGE');
  inputs['source/public' + path] = hash(bytes);
}
script = `const __apsImageAssets=${JSON.stringify(assets)};\n${script}`;
let css = result.outputFiles
  .filter((file) => file.path.endsWith('.css'))
  .map((file) => file.text)
  .join('\n');
for (const file of [
  join(ui, 'reference/provided-board.css'),
  join(ui, 'app/data/plugin-host.css'),
  join(root, 'theme/tokens.css'),
  join(resource, 'theme.css'),
]) {
  const bytes = await readFile(file);
  css += bytes.toString() + '\n';
  inputs[
    file.startsWith(resource + '/') ? file.slice(resource.length + 1) : '../../theme/tokens.css'
  ] = hash(bytes);
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>产销协同工作台</title><style>${css}</style></head><body><div id="root"></div><script>${script.replaceAll('</script', '<\\/script')}</script></body></html>`;
if (Buffer.byteLength(html) > 5000000) throw Error('HTML_TOO_LARGE');
await mkdir(out, { recursive: true });
await writeFile(join(out, 'index.html'), html);
for (const file of ['plugin.json', 'page.json', 'sql.config.json'])
  await cp(join(resource, file), join(out, file));
const agent = join(root, '../dsh-agent-manage/business-resources/inventory-apsplan');
for (const file of ['capability.json', 'prompt.json', 'mcp.json', 'skills'])
  await cp(join(agent, file), join(out, file), { recursive: true });
if (mock) {
  const plugin = JSON.parse(await readFile(join(out, 'plugin.json'), 'utf8'));
  plugin.mode = 'mock';
  const capability = JSON.parse(await readFile(join(out, 'capability.json'), 'utf8'));
  capability.data.mock = true;
  const mcp = JSON.parse(await readFile(join(out, 'mcp.json'), 'utf8'));
  mcp.capabilities = [];
  for (const [file, value] of [
    ['plugin.json', plugin],
    ['capability.json', capability],
    ['mcp.json', mcp],
  ])
    await writeFile(join(out, file), JSON.stringify(value, null, 2) + '\n');
}
for (const path of Object.keys(result.metafile.inputs)) {
  if (path.includes('node_modules/')) continue;
  const file = resolve(path);
  if (file.startsWith(resource + '/'))
    inputs[file.slice(resource.length + 1)] = hash(await readFile(file));
  else if (file.startsWith(manage + '/'))
    inputs['manage/' + file.slice(manage.length + 1)] = hash(await readFile(file));
  else if (file.startsWith(join(root, 'business/shared') + '/'))
    inputs['../shared/' + file.split('/shared/')[1]] = hash(await readFile(file));
}
for (const file of ['plugin.json', 'page.json', 'sql.config.json'])
  inputs[file] = hash(await readFile(join(resource, file)));
for (const file of ['capability.json', 'prompt.json', 'mcp.json', 'skills/aps/SKILL.md'])
  inputs['manage/business-resources/inventory-apsplan/' + file] = hash(
    await readFile(join(agent, file)),
  );
for (const file of [
  'scripts/build-aps-metrics.mjs',
  'business/inventory-apsplan/source/package-lock.json',
])
  inputs['workbench/' + file] = hash(await readFile(join(root, file)));
inputs['manage/package.json'] = hash(await readFile(join(manage, 'package.json')));
await writeFile(
  join(out, 'build-inputs.json'),
  JSON.stringify(
    {
      sourceCommit: '4c7ffa6a53493b599627a2eb0bb2ae152460c494',
      mode: mock ? 'mock' : 'governed-read',
      inputs,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Built inventory-apsplan from fixed Workbench source and Manage resources (${Buffer.byteLength(html)} bytes)`,
);
