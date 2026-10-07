import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({
  entryPoints: [
    "business/inventory-qll/source/inventory-light-plugins/src/qll-engine.ts",
  ],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "session",
      setup(api) {
        api.onResolve({ filter: /channel\.js$/ }, () => ({
          path: "session",
          namespace: "fixture",
        }));
        api.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            'export const currentSessionId=()=>globalThis.mockTrendSession; export const call=()=>{throw Error("REAL_HOST_CALL_FORBIDDEN")};',
        }));
      },
    },
  ],
});
const engine = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
test("current distribution scope returns fixed historical quantities and literal original shortage calculation", async () => {
  globalThis.mockTrendSession = "A";
  const current = await engine.load({
    scope: "company",
    filters: { month: "2026-09", sku: "MOCK-001" },
  });
  const trend = await engine.loadTrend({
    workspaceId: current.workspaceId,
    filters: { base: "华东", category: "饺子" },
  });
  assert.equal(trend.workspaceId, current.workspaceId);
  assert.equal(trend.dataMode, "MOCK_DATA_ONLY");
  assert.deepEqual(trend.filters, {
    month: "2026-09",
    sku: "MOCK-001",
    base: "华东",
    category: "饺子",
  });
  assert.deepEqual(trend.trends.inventory, [
    { snapshotDate: "2026-09-28", layer: "base", qty: 10 },
    { snapshotDate: "2026-09-30", layer: "base", qty: 0 },
  ]);
  assert.deepEqual(trend.trends.orders, [
    {
      snapshotDate: "2026-09-30",
      demandQty: 100,
      satisfiedQty: 88,
      shortageQty: 12,
      fulfillmentRate: 88,
    },
  ]);
  assert.deepEqual(trend.trends.aging, [
    { snapshotDate: "2026-09-28", layer: "base", averageAge: 44 },
    { snapshotDate: "2026-09-30", layer: "base", averageAge: null },
  ]);
  engine.clearFacts();
  delete globalThis.mockTrendSession;
});

test("channel and narrower organization/category/SKU/month ranges retain gaps and never broaden on invalid filters", async () => {
  globalThis.mockTrendSession = "A";
  const channel = await engine.load({
    scope: "all-channel",
    filters: { month: "2026-09" },
  });
  const all = await engine.loadTrend({ workspaceId: channel.workspaceId });
  assert.equal(
    all.trends.inventory.find((row) => row.layer === "customer").qty,
    100,
  );
  assert.ok(
    all.trends.inventory.every((row) => row.qty !== 999 && row.qty !== 9000),
  );
  const customer = await engine.loadTrend({
    workspaceId: channel.workspaceId,
    filters: { customerId: "C1", sku: "MOCK-001", category: "饺子" },
  });
  assert.deepEqual(customer.trends.inventory, [
    { snapshotDate: "2026-09-30", layer: "customer", qty: 100 },
  ]);
  assert.deepEqual(customer.trends.orders, []);
  const branch = await engine.loadTrend({
    workspaceId: channel.workspaceId,
    filters: { branch: "上海分仓" },
  });
  assert.deepEqual(branch.trends.inventory, [
    { snapshotDate: "2026-09-30", layer: "branch", qty: 15 },
  ]);
  const missing = await engine.loadTrend({
    workspaceId: channel.workspaceId,
    filters: { sku: "MOCK-002" },
  });
  assert.deepEqual(missing.trends.inventory, []);
  assert.deepEqual(missing.trends.orders, []);
  assert.deepEqual(missing.trends.aging, []);
  await assert.rejects(
    engine.loadTrend({
      workspaceId: channel.workspaceId,
      filters: { customerId: "C2" },
    }),
    /无权/,
  );
  await assert.rejects(
    engine.loadTrend({
      workspaceId: channel.workspaceId,
      filters: { month: "2026-10" },
    }),
    /不能改变/,
  );
  await assert.rejects(
    engine.loadTrend({
      workspaceId: channel.workspaceId,
      filters: { limit: 99999 },
    }),
    /不能改变/,
  );
  const narrowed = await engine.load({
    scope: "company",
    filters: { month: "2026-09", category: "饺子", sku: "MOCK-001" },
  });
  await assert.rejects(
    engine.loadTrend({
      workspaceId: narrowed.workspaceId,
      filters: { category: "汤圆" },
    }),
    /不能改变/,
  );
  const later = await engine.load({
    scope: "company",
    filters: { month: "2026-10" },
  });
  assert.deepEqual(
    (await engine.loadTrend({ workspaceId: later.workspaceId })).trends.orders,
    [],
  );
  engine.clearFacts();
  delete globalThis.mockTrendSession;
});

test("query caps, expiry, cancellation, withdrawal and Session changes reject late historical facts", async () => {
  globalThis.mockTrendSession = "A";
  const current = await engine.load({
    scope: "company",
    filters: { month: "2026-09" },
  });
  const controller = new AbortController();
  const pending = engine.loadTrend(
    { workspaceId: current.workspaceId },
    controller.signal,
  );
  controller.abort(Error("cancelled"));
  await assert.rejects(pending, /cancelled/);
  const invalidated = engine.loadTrend({ workspaceId: current.workspaceId });
  engine.clearFacts();
  await assert.rejects(invalidated, /快照/);
  const old = await engine.load({
    scope: "company",
    filters: { month: "2026-09" },
  });
  const sessionLate = engine.loadTrend({ workspaceId: old.workspaceId });
  globalThis.mockTrendSession = "B";
  await assert.rejects(sessionLate, /会话|快照/);
  globalThis.mockTrendSession = "A";
  for (let i = 0; i < 4; i++)
    await engine.load({ scope: "company", filters: { month: "2026-09" } });
  await assert.rejects(
    engine.loadTrend({ workspaceId: old.workspaceId }),
    /快照/,
  );
  const expires = await engine.load({
    scope: "company",
    filters: { month: "2026-09" },
  });
  const clock = Date.now;
  Date.now = () => clock() + 300001;
  try {
    await assert.rejects(
      engine.loadTrend({ workspaceId: expires.workspaceId }),
      /快照/,
    );
  } finally {
    Date.now = clock;
  }
  engine.clearFacts();
  delete globalThis.mockTrendSession;
});
