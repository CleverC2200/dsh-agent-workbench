import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The same frozen official services used by the assembled candidate, not the
// published development SDK or a substitute tools registration function.
const core = resolve("../../official-latest-standard");
const official = (path) => pathToFileURL(resolve(core, path)).href;
const { Context } = await import(official("vendor/cordis/lib/index.js"));
const { default: Tools } = await import(
  official("packages/core/tools/lib/index.js")
);
const { default: SystemPrompt } = await import(
  official("packages/core/system-prompt/lib/index.js")
);
const { default: Agents } = await import(
  official("packages/core/agent/lib/index.js")
);
const { createScope } = await import(
  official("packages/core/scope/lib/index.js")
);
const { Session, SessionId } = await import(
  official("packages/core/session/lib/index.js")
);
await mkdir(".scratch", { recursive: true });
const { outputFiles } = await build({
  stdin: {
    contents:
      "export * from './src/page-bridge/registry.ts';export * from './src/page-bridge/host.ts';export {startPageBridgeClient} from './src/page-interaction/page-bridge/client.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "official-tools",
      setup(builder) {
        builder.onResolve({ filter: /^@deepseek-ai\/dsh-tools$/ }, () => ({
          path: official("packages/core/tools/lib/index.js"),
          external: true,
        }));
      },
    },
  ],
});
const compiled = resolve(".scratch/page-owner-lifecycle.mjs");
await writeFile(compiled, outputFiles[0].text);
const {
  createPageToolRegistry,
  createPageBridge,
  startPageBridgeClient,
} = await import(pathToFileURL(compiled).href);

async function mount(t) {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(Tools);
  await ctx.plugin(Agents);
  const id = SessionId("session-11111111-1111-4111-8111-111111111111");
  const agent = { id, session: Session.create(id) };
  await ctx.plugin(
    Object.assign(
      (inner) => {
        agent.ctx = createScope(inner, agent).ctx;
      },
      { inject: ["tools", "systemPrompt"] },
    ),
  );
  const bridge = createPageBridge();
  const registry = createPageToolRegistry(ctx, bridge, { waitMs: 1000 });
  t.after(async () => {
    registry.shutdown();
    await ctx.fiber.dispose();
  });
  const catalog = (value) => ({
    surface: "gea-workbench",
    tool: "gea_workbench_apply",
    description: "Change this page view",
    elements: [
      {
        id: "filters",
        role: "control",
        label: "Filters",
        actions: ["reset"],
        value,
      },
    ],
  });
  const execute = (args) =>
    ctx.tools.execute({
      callId: "page-command",
      name: "gea_workbench_apply",
      arguments: args,
      agent,
      signal: new AbortController().signal,
    });
  return { ctx, agent, bridge, registry, catalog, execute };
}

for (const changed of [false, true])
  test(`native owner survives Agent mount and ${changed ? "changed" : "unchanged"} catalog accompanying its own reset result`, async (t) => {
    const { ctx, agent, bridge, registry, catalog, execute } = await mount(t);
    registry.declare(agent.id, catalog("customer"));
    await ctx.agents.register(agent);
    registry.declare(agent.id, catalog("customer"));
    const directory = await execute({ directory: true });
    assert.equal(directory.isError, false);
    let value = "customer";
    let applied = false;
    const stop = startPageBridgeClient({
      endpoint: "agui/workbench",
      sessionId: agent.id,
      initialDelayMs: 0,
      pollMs: 1,
      catalog: () => catalog(value),
      request: async (_endpoint, payload) => {
        registry.declare(payload.sessionId, payload.catalog);
        return { events: bridge.pull(payload.sessionId, payload.toolMessages) };
      },
      apply: (args) => {
        assert.deepEqual(args, {
          kind: "invoke",
          target: "filters",
          action: "reset",
          reason: "Reset the visible filters",
        });
        applied = true;
        if (changed) value = "all";
        return { applied: true };
      },
    });
    t.after(stop);
    const result = await execute({
      kind: "invoke",
      target: "filters",
      action: "reset",
      reason: "Reset the visible filters",
    });
    assert.equal(
      applied,
      true,
      "actual scoped execution reaches the bound page bridge",
    );
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(JSON.parse(result.content[0].text).applied, true);
    assert.equal(registry.receipts()[0].outcome, "applied");
    const refreshed = await execute({ directory: true, values: true });
    assert.equal(
      JSON.parse(refreshed.content[0].text).directory.entries[0].value,
      changed ? "all" : "customer",
    );
  });

test("a changed page surface releases the previous pending owner", async (t) => {
  const { ctx, agent, bridge, registry, catalog, execute } = await mount(t);
  await ctx.agents.register(agent);
  registry.declare(agent.id, catalog("customer"));
  const pending = execute({
    kind: "invoke",
    target: "filters",
    action: "reset",
    reason: "Reset filters",
  });
  for (let i = 0; i < 100; i++) {
    if (bridge.pull(agent.id, []).length) break;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  registry.declare(agent.id, { ...catalog("all"), surface: "another-view" });
  assert.equal((await pending).error.message, "PAGE_TOOL_OWNER_RELEASED");
  assert.deepEqual(bridge.pull(agent.id, []), []);
});
