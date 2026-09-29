import { clearReadCache } from "../data";
import * as engines from "../engine";
import { call, ready, publish } from "../channel.js";
import { updateContext, refreshContext } from "./context";
declare const PLUGIN_ID: string;
const engine = engines as any;
const snapshots = new Map<string, any>();
let identity: any;
const snapshot = async (warehouseId: string) => {
  let value = snapshots.get(warehouseId);
  if (!value) {
    value = engine.load({ warehouseId });
    snapshots.set(warehouseId, value);
    value.catch(() => snapshots.delete(warehouseId));
  }
  return value;
};
async function dispatch(url: URL, method: string, body: any, signal?: AbortSignal) {
  const p = url.searchParams,
    path = url.pathname;
  if (PLUGIN_ID === "aqkc") {
    if (path === "/api/inventory/daily-report" && method === "GET") {
      const base = p.get("base");
      if (!base || base.length > 80) throw Error("请选择日报基地");
      const report = await engine.loadDailyReport([base]);
      updateContext("dailyReport", report);
      return {report, cacheHit:false, feedback:{available:false,entries:[],warning:"暂不支持保存日报反馈。"}};
    }

    if (path === "/api/inventory/dashboard") {
      const base = p.get("base");
      return {
        workspace: await engine.load(
          undefined,
          undefined,
          undefined,
          base ? base.split(",") : undefined,
        ),
      };
    }
    if (path === "/api/inventory/dashboard-tabs")
      return {
        tabs: await engine.loadInventoryDashboardTabs(
          undefined,
          p.get("base") ?? undefined,
          p.get("category") ?? undefined,
          p.get("tab") ?? undefined,
          undefined,
          undefined,
          p.get("level") ?? undefined,
        ),
      };
    if (path === "/api/inventory/details")
      return {
        page: await engine.loadSafetyStockDetailPage(
          undefined,
          body.filters,
          body.offset ?? 0,
          body.pageSize ?? 10,
        ),
      };
  }
  if (PLUGIN_ID === "fc") {
    if (["/api/replenishment-detail","/api/dms-export"].includes(path) && method === "POST") {
      if (!identity?.authorizedWarehouses.includes(body.warehouseId)) throw Error("无权访问该分仓");
      const full = await snapshot(body.warehouseId);
      if (path === "/api/dms-export") {
        const adjustments=body.adjustments??[];
        if(!Array.isArray(adjustments)||adjustments.length>50000||adjustments.some((r:any)=>!r||typeof r.sku!=="string"||!Number.isSafeInteger(r.actualQty)||r.actualQty<0||typeof r.reason!=="string")) throw Error("补货调整参数无效");
        for(const row of adjustments){const baseline=full.replenishments.find((r:any)=>r.sku===row.sku);if(baseline?.recommendedQty!=null&&row.actualQty<baseline.recommendedQty&&!row.reason.trim()) throw Error("调减建议量必须填写理由："+row.sku);}
        const result=engine.mergeDmsAdjustments(full, adjustments);
        return {rows:result.rows,missingQuantityCount:result.missingQuantityCount,knownQuantityTotal:result.knownQuantityTotal};
      }
      if(typeof body.sku !== "string" || !body.sku.trim() || body.sku.length>100 || !["transfers","bases","batches"].includes(body.kind)) throw Error("明细参数无效");
      if(body.kind === "batches" && (typeof body.baseName !== "string" || !body.baseName.trim() || body.baseName.length > 100)) throw Error("请选择有效基地");
      const value = await engine.loadReplenishmentDetail(full,engine.database,{sku:body.sku,kind:body.kind,baseName:body.baseName});
      return {snapshot:value, detail:{...value.replenishmentDetail,...(body.kind === "bases" ? {bases:value.baseResources} : {})}};
    }

    if (path === "/api/session") {
      const [access, catalog] = await Promise.all([
        call("access"),
        engine.catalog(),
      ]);
      identity = {
        mode: "gea",
        userId: access.principalId,
        authorizedWarehouses: catalog.warehouses.map((w: any) => w.id),
        warehouseOptions: catalog.warehouses,
        warehouseCatalogIssues: catalog.issues,
        warehouseScopeMode: "gea-governed",
      };
      return identity;
    }
    if (path === "/api/branch-planning" && method === "POST") {
      if (!identity?.authorizedWarehouses.includes(body.warehouseId))
        throw Error("无权访问该分仓");
      const result = await engine.applyLocalPreview(body);
      snapshots.delete(body.warehouseId);
      updateContext("localPlanning", result);
      return result;
    }
    if (path === "/api/branch-planning" && method === "GET") {
      const month = p.get("month") ?? "";
      if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw Error("计划月份无效");
      const warehouseId = p.get("warehouseId");
      const [value, catalog] = await Promise.all([
        snapshot(warehouseId!),
        engine.catalog(),
      ]);
      const warehouse = catalog.warehouses.find(
        (row: any) => row.id === warehouseId,
      );
      if (!warehouse) throw Error("分仓映射不可用");
      return {
        rows: engine.buildPlanTemplateRows(
          value,
          warehouse.pickupPointCode,
          month,
        ),
      };
    }
    if (path === "/api/warehouse-page") {
      let value = await snapshot(body.warehouseId);
      if (body.tab === "base")
        value = await engine.loadBaseResourceSnapshot(
          value,
          engine.database,
          body.search ?? "",
        );
      return { snapshot: engine.projectWarehousePage(value, body) };
    }
    if (path === "/api/warehouse-snapshot")
      return { snapshot: await snapshot(p.get("warehouseId")!) };
    if (path === "/api/warehouse-batches") {
      const value = await snapshot(p.get("warehouseId")!);
      const sku = value.inventory.find((row: any) => row.sku === p.get("sku"));
      return {
        warehouseId: value.warehouseId,
        sku: p.get("sku"),
        snapshotDate: value.snapshotDate,
        batches: sku?.batches ?? [],
      };
    }
    if (path === "/api/conversations" && method === "GET")
      return {
        conversations: [],
        databaseAvailable: false,
        source: "DSH-native-conversation",
      };
    if (path.startsWith("/api/conversations/"))
      throw Error("暂不支持查询已归档的业务快照。");
  }
  if (PLUGIN_ID === "qll") {
    if (path === "/api/workspace/details" && method === "POST") return engine.loadDetails(body, signal);
    if (path === "/api/workspace/trend" && method === "POST") return engine.loadTrend(body, signal);
    if (path === "/api/workspace/history") {
      const workspace = await engine.loadHistory(p.get("workspaceId"), signal);
      snapshots.set(workspace.workspaceId, workspace);
      return workspace;
    }
    if (path === "/api/workspace") {
      const { scope, part, ...filters } = Object.fromEntries(p);
      const workspace = await engine.load({
        scope: scope ?? "company",
        part,
        signal,
        filters,
      });
      snapshots.set(workspace.workspaceId, workspace);
      return workspace;
    }
    if (path.startsWith("/api/workspace/snapshot/")) {
      const item = snapshots.get(path.split("/").at(-1)!);
      if (!item)
        throw Error(
          "该历史快照不可用，请重新查询。",
        );
      return item;
    }
    if (path === "/api/thread" && method === "GET")
      return { threads: [], messages: [] };
  }
  throw Error(
    "暂不支持此操作，业务数据未保存或提交。",
  );
}
export async function mountBusinessFetch() {
  await ready;
  window.fetch = async (input: any, init: any = {}) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "https://html-plugin.local",
    );
    if (url.origin !== "https://html-plugin.local")
      throw Error("当前数据访问方式不可用，请重新打开工作台。");
    const method =
      init.method ?? (input instanceof Request ? input.method : "GET");
    let body = {};
    if (init.body) body = JSON.parse(String(init.body));
    init.signal?.throwIfAborted();
    try {
      const result = await dispatch(url, method, body, init.signal);
      init.signal?.throwIfAborted();
      if (PLUGIN_ID === "fc") {
        // The current ready page owns FC facts; exports and detail reads may finish after it changes.
        refreshContext();
        return Response.json(result);
      }
      if (PLUGIN_ID === 'qll' && ['/api/workspace/details','/api/workspace/trend'].includes(url.pathname)) {
        updateContext('detail', {plugin:PLUGIN_ID,path:url.pathname,parameters:body,loadedAt:new Date().toISOString(),...result});
        return Response.json(result);
      }
      updateContext("data", {
        plugin: PLUGIN_ID,
        path: url.pathname,
        parameters: { ...Object.fromEntries(url.searchParams), ...body },
        loadedAt: new Date().toISOString(),
        dataState: result.snapshot?.dataState,
        summary: result.snapshot?.dataState === "empty" ? undefined :
          result.snapshot?.metrics ?? result.workspace?.kpis ?? result.kpis,
        computedOverview: result.snapshot?.dataState === "empty" ? undefined : result.snapshot?.page?.overview,
        sourceTrace: result.snapshot?.ruleTrace,
        localPreview: result.snapshot?.localPreview,
        sourceTime: result.snapshot?.snapshotTime,
        dataQuality: result.snapshot?.dataQuality,
        evidence: result.evidence ?? result.summary,
      });
      return Response.json(result);
    } catch (e) {
      if (init.signal?.aborted) throw e;
      const message = (e as Error).message;
      return Response.json(
        {
          error: message,
          message,
          errors: (e as any).errors,
          recoverable: true,
          sampleFallback: false,
        },
        { status: 503 },
      );
    }
  };
}
export function clearBusinessCache(identityChanged = false) {
  clearReadCache();
  snapshots.clear();
  engine.clearFacts?.();
  if (identityChanged) engine.clearPreviews?.();
}
