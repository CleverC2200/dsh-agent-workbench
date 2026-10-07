import { build } from 'esbuild';
import { mkdir, writeFile, copyFile, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { target: { type: 'string' } } });
if (values.target && values.target !== 'core') throw Error('Unsupported build target');
if (process.env.DSH_TYPECHECK_PROJECT === 'tsconfig.official.json')
  await import('./verify-official-input.mjs');
await import('./build-static-authors.mjs');
await mkdir('lib', { recursive: true });
await mkdir('lib/theme', { recursive: true });
await copyFile('theme/tokens.css', 'lib/theme/tokens.css');
await cp('static', 'lib/static', {
  recursive: true,
  filter: (source) => !source.endsWith('/source'),
});
await build({
  entryPoints: ['src/host.ts', 'src/shared/notifications.ts', 'src/sales-plan.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: 'lib',
  packages: 'external',
});
await build({
  entryPoints: [
    'src/page-interaction/client.ts',
    'src/page-interaction/picker.ts',
    'src/page-interaction/reference.ts',
    'src/page-interaction/inject.ts',
    'src/page-interaction/shared/payload-budget.ts',
    'src/page-interaction/page-bridge/client.ts',
    'src/page-interaction/page-bridge/protocol.ts',
  ],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outdir: 'lib/page-interaction',
  outbase: 'src/page-interaction',
  external: ['react', '@deepseek-ai/dsh-client-store'],
});
await build({
  entryPoints: ['src/page-interaction/page.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: 'lib/page-picker.js',
});
await build({
  entryPoints: ['src/workbench-entry.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'lib/native.js',
  loader: { '.css': 'css', '.module.css': 'local-css', '.png': 'dataurl' },
});
const workbench = await build({
  plugins: [
    {
      name: 'public-primitives-root',
      setup(builder) {
        builder.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({
          path: '@deepseek-ai/dsh-client-ui-primitives',
          external: true,
        }));
      },
    },
  ],
  jsx: 'automatic',
  entryPoints: ['src/client.ts'],
  bundle: true,
  write: false,
  outfile: 'client.js',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-store'],
  loader: { '.module.css': 'local-css', '.css': 'text', '.png': 'dataurl' },
});
const workbenchStyles =
  workbench.outputFiles.find((file) => file.path.endsWith('.css'))?.text ?? '';
const workbenchCode = workbench.outputFiles.find((file) => file.path.endsWith('.js')).text;
await writeFile(
  'lib/client.js',
  `window.__ModuleLoader__.load({id:"@cleverc2200/dsh-agent-workbench",factory:(require)=>{var module={exports:{}};var exports=module.exports;const WORKBENCH_MODULE_STYLES=${JSON.stringify(workbenchStyles)};${workbenchCode}\nreturn module.exports;}});\n`,
);

execFileSync(
  process.execPath,
  [
    'node_modules/typescript/bin/tsc',
    '-p',
    process.env.DSH_TYPECHECK_PROJECT ?? 'tsconfig.json',
    '--noEmit',
    'false',
    '--emitDeclarationOnly',
    'true',
  ],
  { stdio: 'inherit' },
);

await import('./build-html-sample.mjs');
await import('./build-customer-prototype.mjs');
await import('./build-orderworkbench.mjs');
await import('./build-order-fulfillment.mjs');
if (values.target !== 'core') {
  await import('./build-inventory-fc.mjs');
  await import('./build-inventory-aqkc.mjs');
}
