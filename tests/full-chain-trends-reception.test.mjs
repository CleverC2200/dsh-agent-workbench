import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import {resolve} from "node:path";
import {createCompanyWire} from "./fixtures/full-chain-company-wire.mjs";
const result = await build({
  entryPoints: [
    "business/inventory-qll/source/inventory-light-plugins/src/qll-engine.ts",
  ],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [{name:"manage-source",setup(api){api.onResolve({filter:/^dsh-agent-manage\/inventory-compute\/[a-z-]+$/},x=>({path:resolve("../dsh-agent-manage/src/inventory-compute",x.path.split("/").at(-1)+".ts")}));}},
    {
      name: "session",
      setup(api) {
        api.onResolve({ filter: /channel\.js$/ }, () => ({
          path: "session",
          namespace: "fixture",
        }));
        api.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            'export const currentSessionId=()=>globalThis.mockTrendSession; export const call=(...args)=>globalThis.companyWire(...args);',
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
  globalThis.companyWire = createCompanyWire();
  const current = await engine.load({
    scope: "company",
    filters: { month: "2026-09", sku: "MOCK-001" },
  });
  const trend = await engine.loadTrend({
    workspaceId: current.workspaceId,
    filters: { base: "华东", category: "饺子" },
  });
  assert.equal(trend.workspaceId, current.workspaceId);
  assert.equal(trend.dataMode, "GEA_LIVE_READONLY");
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

test("company scopes retain gaps and reject unenabled channels or broader filters", async () => {
  globalThis.mockTrendSession = "A";
  globalThis.companyWire = createCompanyWire();
  await assert.rejects(engine.load({scope:"all-channel",filters:{month:"2026-09"}}),/只开放公司/);
  const company=await engine.load({scope:"company",filters:{month:"2026-09"}});
  const branch=await engine.loadTrend({workspaceId:company.workspaceId,filters:{branch:"上海分仓"}});
  assert.deepEqual(branch.trends.inventory,[{snapshotDate:"2026-09-30",layer:"branch",qty:15}]);
  const missing=await engine.loadTrend({workspaceId:company.workspaceId,filters:{sku:"MOCK-002"}});
  assert.deepEqual(missing.trends.inventory,[]);assert.deepEqual(missing.trends.orders,[]);assert.deepEqual(missing.trends.aging,[]);
  await assert.rejects(engine.loadTrend({workspaceId:company.workspaceId,filters:{customerId:"C1"}}),/不可查看客户/);
  await assert.rejects(engine.loadTrend({workspaceId:company.workspaceId,filters:{month:"2026-10"}}),/不能改变/);
  await assert.rejects(engine.loadTrend({workspaceId:company.workspaceId,filters:{limit:99999}}),/不能改变/);
  const narrowed=await engine.load({scope:"company",filters:{month:"2026-09",category:"饺子",sku:"MOCK-001"}});
  await assert.rejects(engine.loadTrend({workspaceId:narrowed.workspaceId,filters:{category:"汤圆"}}),/不能改变/);
  const later=await engine.load({scope:"company",filters:{month:"2026-10"}});
  assert.deepEqual((await engine.loadTrend({workspaceId:later.workspaceId})).trends.orders,[]);
  engine.clearFacts();delete globalThis.mockTrendSession;delete globalThis.companyWire;
});

test("query caps, expiry, cancellation, withdrawal and Session changes reject late historical facts", async () => {
  globalThis.mockTrendSession = "A";
  globalThis.companyWire = createCompanyWire();
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
  globalThis.companyWire = createCompanyWire();
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
