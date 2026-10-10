import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
test('filter publishes pending scope before returning, without stale facts; no-op and invalid choices keep current evidence', async () => {
  // Export the same context module from the hook bundle to observe the public context contract.
  const combined = await build({
    stdin: {
      contents:
        "export {usePageFilter} from './business/inventory-aqkc/source/inventory-light-plugins/src/native/page-filter.tsx';export * from './business/inventory-aqkc/source/inventory-light-plugins/src/native/context.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'hook-fixture',
        setup(api) {
          api.onResolve({ filter: /^react$|channel\.js$/ }, (a) => ({
            path: a.path,
            namespace: 'fixture',
          }));
          api.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
            contents:
              a.path === 'react'
                ? 'export const useRef=value=>({current:value});export const useEffect=f=>f();'
                : 'export const action=(name,facts,handler)=>globalThis.filterTest.handlers[name]=handler;export const reportElements=()=>()=>{};export const publish=async context=>{globalThis.filterTest.published.push(structuredClone(context));};',
          }));
        },
      },
    ],
  });
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(combined.outputFiles[0].text).toString('base64')
  );
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => ({ innerText: 'old ready facts' }),
  };
  globalThis.filterTest = { handlers: {}, published: [] };
  let applied;
  const scope = {
    allowedFields: ['bases', 'tab'],
    selectedBases: ['华东基地', '华南基地'],
    bases: ['华东基地', '华南基地'],
    tabs: ['基地结构', '品类结构'],
    tab: '基地结构',
    loading: false,
  };
  try {
    module.updateContext('queryState', { state: 'ready' });
    module.updateContext('stockOverview', { scope: 'all', current: 999 });
    module.usePageFilter(scope, (args) => (applied = args));
    await filterTest.handlers.filter({ bases: ['华东基地'] });
    assert.deepEqual(applied, { bases: ['华东基地'] });
    const pending = filterTest.published[0];
    assert.equal(pending.parts.queryState.state, 'loading');
    assert.equal(pending.parts.stockOverview, undefined);
    assert.deepEqual(pending.parts.pageFilters.selectedBases, ['华东基地']);
    assert.match(pending.visibleText, /正在查询/);
    module.clearContext();
    module.updateContext('queryState', { state: 'ready' });
    module.updateContext('stockOverview', { scope: 'all', current: 999 });
    await filterTest.handlers.filter({});
    assert.equal(module.pageContext().parts.stockOverview.current, 999);
    await assert.rejects(filterTest.handlers.filter({ bases: ['未知基地'] }), /不在当前/);
    assert.equal(module.pageContext().parts.stockOverview.current, 999);
  } finally {
    module.clearContext();
    delete globalThis.filterTest;
    globalThis.document = previousDocument;
  }
});
