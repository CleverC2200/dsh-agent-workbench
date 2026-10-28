/** Build the migrated memory-only demo; never import GEA Host or deployment files. */
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { syncAgentResources } from './build-output.mjs';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'prototypes/dms');
const output = resolve(root, 'lib/prototypes/dms');
const agent = resolve(root, '../dsh-agent-manage/business-resources/inventory-dms');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const theme = await readFile(resolve(root, 'theme/tokens.css'), 'utf8');
if (sha256(theme) !== '281fe7eebe0775b6bedabad6806753db6afe5eded52e6d9ade54067d23e20ef8')
  throw Error('DMS_THEME_RESOURCE_MISMATCH');
const result = await build({
  entryPoints: [resolve(source, 'main.ts')],
  bundle: true,
  write: false,
  metafile: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome110', 'safari16'],
});
if (
  Object.keys(result.metafile.inputs)
    .filter((path) => !path.includes('node_modules/'))
    .some((path) => /(?:dsh-gea-plugin|src\/host|node:)/.test(path))
)
  throw Error('DMS_HOST_DEPENDENCY');
const template = await readFile(resolve(source, 'index.html'), 'utf8');
const css = await readFile(resolve(source, 'style.css'), 'utf8');
const code = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = template
  .replace('/* SHARED_THEME_RESOURCE */', theme)
  .replace('/* DMS_STYLE */', css)
  .replace('/* DMS_SCRIPT */', code);
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'index.html'), html);
await build({
  entryPoints: [resolve(source, 'model.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: resolve(output, 'model.js'),
});
for (const file of ['plugin.json', 'page.json', 'SOURCE.json'])
  await cp(resolve(source, file), resolve(output, file));
await syncAgentResources(agent, output);
const files = [
  ...Object.keys(result.metafile.inputs).filter((p) => !p.includes('node_modules/')),
  'prototypes/dms/index.html',
  'prototypes/dms/style.css',
  'theme/tokens.css',
  'prototypes/dms/plugin.json',
  'prototypes/dms/page.json',
  'prototypes/dms/SOURCE.json',
  'scripts/build-dms-prototype.mjs',
  '../dsh-agent-manage/business-resources/inventory-dms/capability.json',
  '../dsh-agent-manage/business-resources/inventory-dms/prompt.json',
  '../dsh-agent-manage/business-resources/inventory-dms/mcp.json',
  '../dsh-agent-manage/business-resources/inventory-dms/skills/dms/SKILL.md',
];
const inputs = {};
for (const file of files) {
  const path = resolve(root, file);
  inputs[relative(root, path)] = sha256(await readFile(path));
}
await writeFile(
  resolve(output, 'build-inputs.json'),
  JSON.stringify(
    {
      originalSourceCommit: 'b71fbe049809385c2af82f135b2ef2c10a8b6a39',
      restoredCandidate: {
        commit: null,
        manifestSha256: 'cc7b1f7c59409afa4baaea276fcf9e5477b57826c846c4d161da1701cd2c41ed',
        zipSha256: '0eee3931626f3da5f1c22ca9a8c4ecf4ad7419566d8525248e32b88b17bcd9b1',
      },
      inputs,
      dependencies: { esbuild: '0.25.9', 'decimal.js': '10.6.0' },
      outputs: {
        'index.html': sha256(html),
        'model.js': sha256(await readFile(resolve(output, 'model.js'))),
      },
    },
    null,
    2,
  ) + '\n',
);
console.log('Built DMS mock prototype from Workbench source and Manage resources');
