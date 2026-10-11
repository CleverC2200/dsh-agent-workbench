import { build } from 'esbuild';
const bundle = await build({
  entryPoints: ['business/inventory-dealer/source/inventory-light-plugins/src/dealer-mock-sql.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'offline-query-registry',
      setup(api) {
        api.onResolve({ filter: /^server-only$|^@\/lib\/gea-sql-client$/ }, (args) => ({
          path: args.path,
          namespace: 'fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
          contents:
            args.path === 'server-only'
              ? 'export{};'
              : 'const deny=()=>{throw Error("UNEXPECTED_DIRECT_SQL")};export{deny as executeAllGeaSqlPages,deny as executeGeaSql,deny as executeGeaSqlPage};',
        }));
      },
    },
  ],
});
export const { readDealerMock } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
