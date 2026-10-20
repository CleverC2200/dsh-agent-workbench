import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const core = resolve(process.env.DSH_TEST_CORE ?? '../../official-latest-standard');
const bundle = await build({
  stdin: {
    contents: `export {mountCompanyUI} from './src/company/ui.tsx';
      export {ClientModuleSystem} from ${JSON.stringify(resolve(core, 'packages/client/modules/src/client/system.ts'))};
      export {removeOwnedStyles} from ${JSON.stringify(resolve(core, 'packages/client/modules/src/client/entry-lifecycle.ts'))};`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  loader: { '.png': 'dataurl', '.css': 'text' },
});
const module = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
  module,
  module.exports,
  createRequire(import.meta.url),
);
const { mountCompanyUI, ClientModuleSystem, removeOwnedStyles } = module.exports;

test('a later plugin replacement preserves the mounted company sidebar stylesheet', async (t) => {
  const dom = new JSDOM('<!doctype html><head></head><body></body>');
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = previous;
    dom.window.close();
  });
  const cleanups = [];
  const ctx = {
    effect(callback) {
      const cleanup = callback();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    },
    locale: { register() {}, bind: () => (key) => key },
    inject() {},
    slots: { inject: (_name, callback) => callback(), register: () => () => {} },
  };
  const sibling = '@cleverc2200/gea-dsh-prototype';
  const target = { mode: 'queue', pendingQueue: [] };
  const loader = new ClientModuleSystem({
    manifest: {
      modules: [
        {
          id: sibling,
          url: `plugins/??${sibling}/client.js&rev=0`,
          initialUrl: `plugins/??${sibling}/client.js&rev=0`,
          rev: '0',
          inject: [],
          external: [],
        },
      ],
    },
    staticModules: {},
    bootstrapModule: { id: '@deepseek-ai/dsh-client-modules', exports: {} },
    registrationTarget: target,
    loadBundle: async () => target.load({ id: sibling, factory: () => ({}) }),
  });
  mountCompanyUI(ctx, {
    register: () => () => {},
    getSnapshot: () => ({}),
    subscribe: () => () => {},
  });
  const style = document.querySelector('style[data-company-workbench]');
  assert.ok(style?.textContent.includes('.gea-sidebar-owned'));
  await loader.import(sibling, '', {});
  loader.invalidate(sibling, 'next');
  removeOwnedStyles(sibling);
  assert.ok(style.isConnected, 'updating GEA must not remove the Workbench sidebar stylesheet');
  assert.equal(style.dataset.plugin, '@cleverc2200/dsh-agent-workbench');
  for (const cleanup of cleanups.reverse()) cleanup();
  assert.equal(style.isConnected, false, 'Workbench disposal still removes its own stylesheet');
});
