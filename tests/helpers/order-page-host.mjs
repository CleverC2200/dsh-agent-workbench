import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const bundle = await build({
  absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)),
  entryPoints: ['src/page-runtime.ts'],
  bundle: true,
  packages: 'external',
  write: false,
  platform: 'node',
  format: 'cjs',
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);

export async function orderPageHost() {
  const routes = new Map(),
    tools = new Map(),
    disposers = [],
    observed = [];
  const identity = new AbortController();
  const effect = (action) => {
    const dispose = action();
    if (typeof dispose === 'function') disposers.push(dispose);
  };
  const ctx = {
    connection: {
      fetch: {
        register: (route) => {
          routes.set(route.path, route);
          return () => routes.delete(route.path);
        },
      },
    },
    sessionController: { resolveAgent: async (id) => ({ agent: { id } }) },
    effect,
    on: () => () => {},
    inject: (dependencies, register) => {
      if (dependencies.length !== 1 || dependencies[0] !== 'tools') return () => {};
      register({
        effect,
        tools: {
          register: (tool) => {
            tools.set(tool.name, tool);
            return () => tools.delete(tool.name);
          },
        },
      });
      return () => {};
    },
  };
  const pages = new module.exports.PageRuntime(ctx);
  const session = 'session-11111111-1111-4111-8111-111111111111';
  pages.registerBusinessPage(
    {
      id: 'inventory-orderworkbench',
      kind: 'html',
      pluginId: 'inventory-orderworkbench',
      label: '订单工作台',
      resourceId: 'order',
      catalog: { surface: 'gea-html-inventory-orderworkbench', tool: 'gea_plugin_page_apply' },
    },
    async () => ({
      signal: identity.signal,
      referenceScope: 'context-test',
      access: {},
      allowsEffect: (effect) => effect === 'view',
      release: () => {},
      observe: (context) => observed.push(context),
    }),
  );
  const call = async (input) => {
    const response = await routes
      .get('/api/agent-workbench/page')
      .fetch(new Request('http://local/page', { method: 'POST', body: JSON.stringify(input) }));
    return { status: response.status, value: await response.json() };
  };
  const opened = await call({
    operation: 'open',
    pageId: 'inventory-orderworkbench',
    resourceId: 'order',
    sessionId: session,
  });
  if (!opened.value.owner) throw Error(JSON.stringify(opened));
  return {
    observed,
    sync: (context) =>
      call({ operation: 'context', owner: opened.value.owner, parameters: context }),
    read: () =>
      tools.get('gea_page').execute(
        { action: 'context' },
        {
          agent: { id: session },
          signal: identity.signal,
        },
      ),
    dispose: () => {
      identity.abort();
      for (const dispose of disposers.reverse()) dispose();
    },
  };
}
