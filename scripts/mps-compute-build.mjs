import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function mpsComputePlugin(
  manage = resolve(import.meta.dirname, '../../dsh-agent-manage'),
) {
  const manifest = JSON.parse(await readFile(join(manage, 'package.json'), 'utf8'));
  const entry = manifest.exports?.['./mps-compute/*'];
  if (entry?.source !== './src/mps-compute/*.ts') throw Error('MANAGE_MPS_PUBLIC_EXPORT_MISMATCH');
  return {
    name: 'manage-mps-compute',
    setup(api) {
      api.onResolve({ filter: /^mps-workflow-worker-source$/ }, () => ({
        path: 'mps-workflow-worker-source',
        namespace: 'mps-worker',
      }));
      api.onLoad({ filter: /.*/, namespace: 'mps-worker' }, async () => {
        const output = await api.esbuild.build({
          entryPoints: [resolve(import.meta.dirname, '../static/mps/source/workflow-worker.js')],
          plugins: [await mpsComputePlugin(manage)],
          bundle: true,
          write: false,
          platform: 'browser',
          format: 'iife',
          target: 'es2022',
        });
        return {
          contents: `export default ${JSON.stringify(output.outputFiles[0].text)}`,
          loader: 'js',
        };
      });
      api.onResolve({ filter: /^dsh-agent-manage\/mps-compute\/[a-z-]+$/ }, ({ path }) => ({
        path: join(manage, entry.source.replace('*', path.split('/').at(-1))),
      }));
    },
  };
}
