import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const fcRequire = createRequire(
  new URL('../business/inventory-fc/source/inventory-light-plugins/package.json', import.meta.url),
);

const output = await build({
  entryPoints: ['business/inventory-fc/source/fc/src/lib/server/warehouse-snapshot.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'unused-server-fixture',
      setup(api) {
        api.onResolve({ filter: /^zod$/ }, () => ({ path: fcRequire.resolve('zod') }));
        api.onResolve(
          {
            filter:
              /^\.\/database\.ts$|^\.\/business-database\.ts$|^\.\/gea-sql\.ts$|^\.\/planning-store\.ts$/,
          },
          (args) => ({ path: args.path, namespace: 'fixture' }),
        );
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents: path.endsWith('/gea-sql.ts')
            ? 'export const queryBusinessDatabase=(db,sql,values)=>db.query(sql,values);export const usesGeaSql=()=>false;'
            : path.endsWith('/planning-store.ts')
              ? 'export const readPlanningState=()=>{throw Error("Unexpected planning read")};'
              : 'export const getDatabase=()=>{throw Error("Unexpected database")};export const getBusinessDatabase=getDatabase;',
        }));
      },
    },
  ],
});
const { loadWarehouseSnapshot } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);

test('personal shared warehouse reader keeps returned stock when current plans are empty', async () => {
  const queries = [];
  const database = {
    async query(sql, values = []) {
      queries.push(sql);
      assert.ok(
        values.every((value) => !Array.isArray(value) || value.length > 0),
        'empty arrays must not reach governed SQL',
      );
      if (sql.includes('warehouse_catalog:inventory'))
        return { rows: [{ pickup_code: '06', warehouseid: 'W06', warehouse_name: '测试仓' }] };
      if (sql.includes('warehouse_catalog:plans')) return { rows: [] };
      if (sql.includes('to_regclass'))
        return { rows: [{ order_fulfillment: null, imported_plans: null, cycle_config: null }] };
      if (sql.includes('agents_scm_branch_inventory_snapshot'))
        return {
          rows: [
            {
              material_code: 'SKU-STOCK',
              material_name: '已有库存',
              snapshot_date: '2026-10-08',
              prod_date: '2026-10-01',
              live_qty: 12,
              available_qty: 10,
            },
          ],
        };
      return { rows: [] };
    },
  };
  const snapshot = await loadWarehouseSnapshot(
    'changsha',
    database,
    new Date('2026-10-08T04:00:00Z'),
  );
  assert.equal(snapshot.inventory.find((row) => row.sku === 'SKU-STOCK').availableQty, 10);
  assert.deepEqual(snapshot.plans, []);
  assert.ok(
    !queries.some((sql) => sql.includes('agents_scm_branch_production_plan')),
    'no production lookup is needed without plan SKU keys',
  );
});
