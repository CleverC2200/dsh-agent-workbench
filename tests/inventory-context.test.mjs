import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
test("an empty stock response clears stale facts while preserving the warehouse filter catalog", async () => {
  const built = await build({
    entryPoints: [
      "business/inventory-fc/source/inventory-light-plugins/src/native/context.ts",
    ],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    define: { PLUGIN_ID: '"fc"' },
    plugins: [
      {
        name: "context-transport",
        setup(api) {
          api.onResolve({ filter: /channel\.js$/ }, () => ({
            path: "channel",
            namespace: "fixture",
          }));
          api.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: "export const publish=async()=>{};",
          }));
        },
      },
    ],
  });
  const context = await import(
    "data:text/javascript;base64," +
      Buffer.from(built.outputFiles[0].text).toString("base64")
  );
  globalThis.document = { getElementById: () => ({ innerText: "" }) };
  try {
    context.updateContext("pageFilters", {
      warehouseId: "changsha",
      warehouses: ["changsha", "zhengzhou"],
    });
    context.updateContext("data", { inventoryQty: 130 });
    context.clearContext({ keepPageFilters: true });
    assert.deepEqual(Object.keys(context.pageContext().parts), ["pageFilters"]);
    assert.deepEqual(context.pageContext().parts.pageFilters.warehouses, [
      "changsha",
      "zhengzhou",
    ]);
    context.clearContext();
    assert.deepEqual(context.pageContext().parts, {});
  } finally {
    context.clearContext();
    delete globalThis.document;
  }
});
