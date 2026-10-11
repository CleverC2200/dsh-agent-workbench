import { build as compile } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../../', import.meta.url));
const manage = resolve(source, '../../../../dsh-agent-manage');
export async function build(options) {
  const entry = options.entryPoints?.[0];
  const name = typeof entry === 'string' ? basename(entry, '.ts') : '';
  const migrated = [
    'adapter',
    'metrics',
    'period',
    'page-analysis',
    'perspective-analysis',
    'workbench-insights',
  ];
  if (!migrated.includes(name))
    return compile({
      ...options,
      entryPoints: options.entryPoints.map((path) => resolve(source, path)),
    });
  const manifest = JSON.parse(await readFile(resolve(manage, 'package.json'), 'utf8'));
  const exported = manifest.exports['./aps-compute/*'];
  if (exported?.source !== './src/aps-compute/*.ts')
    throw Error('MANAGE_APS_PUBLIC_EXPORT_MISMATCH');
  const { entryPoints: _entryPoints, ...rest } = options;
  return compile({
    ...rest,
    stdin: {
      contents: `export * from 'dsh-agent-manage/aps-compute/${name}';`,
      resolveDir: source,
    },
    plugins: [
      {
        name: 'public-aps-compute',
        setup(api) {
          api.onResolve({ filter: /^dsh-agent-manage\/aps-compute\/[a-z-]+$/ }, ({ path }) => ({
            path: resolve(manage, exported.source.replace('*', path.split('/').at(-1))),
          }));
        },
      },
    ],
  });
}
