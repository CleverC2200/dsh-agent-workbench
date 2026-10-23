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
      api.onResolve({ filter: /^dsh-agent-manage\/mps-compute\/[a-z-]+$/ }, ({ path }) => ({
        path: join(manage, entry.source.replace('*', path.split('/').at(-1))),
      }));
    },
  };
}
