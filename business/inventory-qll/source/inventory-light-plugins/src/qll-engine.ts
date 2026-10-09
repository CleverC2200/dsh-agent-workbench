import { buildFullChainWorkspace } from "dsh-agent-manage/inventory-compute/full-chain-workspace-service";
import type {
  FullChainData,
  WorkspaceFilters,
  WorkspaceScope,
} from "dsh-agent-manage/inventory-compute/full-chain-types";
import { summarizeStructure } from "dsh-agent-manage/inventory-compute/full-chain-category-structure";
import { currentSessionId, call } from "./channel.js";
import { readCompanySource } from "./qll-source";

const currentSnapshots = new Map<
  string,
  { request: any; data: FullChainData; workspace: any; accessKey: string; session: string; expires: number;
    history?: {key: string; data: FullChainData}; historyRequest?: number }
>();
let sequence = 0;
let epoch = 0;
export function clearFacts() {
  currentSnapshots.clear();
  epoch++;
}
if (typeof window !== "undefined")
  for (const event of [
    "gea-session-changing",
    "gea-session-changed",
    "gea-identity-changed",
    "light-refresh",
  ])
    window.addEventListener(event, clearFacts);
function validate(scope: string, filters: WorkspaceFilters, access: any) {
  if (access?.trusted !== true || typeof access.principalId !== "string" || !access.principalId) throw Error("需要当前GEA可信身份");
  if (scope !== "company") throw Error("当前只开放公司库存读取");
  if (!filters || typeof filters !== "object" || Array.isArray(filters))
    throw Error("筛选参数无效");
  for (const [key, value] of Object.entries(filters))
    if (
      !["month", "base", "branch", "customerId", "category", "sku"].includes(
        key,
      ) ||
      typeof value !== "string" ||
      !value.length ||
      value.length > 200
    )
      throw Error("筛选参数无效");
  if (!filters.month || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(filters.month))
    throw Error("月份无效");
  if (filters.customerId)
    throw Error("当前范围不可查看客户明细");
  for (const [key, allow] of [
    ["base", access.allowedBases],
    ["branch", access.allowedBranches],
    ["customerId", access.allowedCustomerIds],
  ] as const)
    if (allow !== undefined && allow !== null && (!Array.isArray(allow) || allow.some((value: unknown) => typeof value !== "string"))) throw Error("授权范围格式无效");
    else if (filters[key] && Array.isArray(allow) && !allow.includes(filters[key]!))
      throw Error("无权访问该组织范围");
  if (
    [filters.base, filters.branch, filters.customerId].filter(Boolean).length >
    1
  )
    throw Error("请选择单一组织层级");
}
function snapshot(id: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const item = currentSnapshots.get(id);
  if (!item || item.expires < Date.now() || item.session !== currentSessionId())
    throw Error("当前会话快照不可用，请刷新工作台后重试");
  return item;
}
function detailRequest(item: any, input: any) {
  const filters = { ...item.request.filters };
  if (
    input !== undefined &&
    (!input || typeof input !== "object" || Array.isArray(input))
  )
    throw Error("明细筛选无效");
  for (const [key, value] of Object.entries(input ?? {})) {
    if (
      !["base", "branch", "customerId", "category", "sku"].includes(key) ||
      (filters[key] !== undefined && filters[key] !== value)
    )
      throw Error("明细不能改变当前查询范围");
    filters[key] = value;
  }
  validate(item.request.scope, filters, item.request.access);
  return { ...item.request, filters };
}
function workspace(request: any, input: FullChainData, signal?: AbortSignal) {
  signal?.throwIfAborted();
  return {...buildFullChainWorkspace(input, request), dataMode: "GEA_LIVE_READONLY", realData: true};
}
async function checkSnapshot(item: ReturnType<typeof snapshot>, signal?: AbortSignal) {
  const access = await call("access", undefined, {signal});
  signal?.throwIfAborted();
  if (item.session !== currentSessionId() || JSON.stringify(access) !== item.accessKey) throw Error("当前会话或授权范围已变化");
}
export async function load(options: any = {}) {
  options.signal?.throwIfAborted();
  if ((options.scope ?? "company") !== "company") throw Error("当前只开放公司库存读取");
  if (typeof options.asOf !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(options.asOf)) throw Error("请选择明确的读取时点");
  const now = new Date(`${options.asOf}T00:00:00Z`);
  if (!Number.isFinite(now.getTime()) || now.toISOString().slice(0, 10) !== options.asOf) throw Error("读取时点无效");
  const session = currentSessionId();
  if (!session) throw Error("需要当前工作台会话");
  const generation = epoch;
  const access = await call("access", undefined, {signal: options.signal});
  options.signal?.throwIfAborted();
  const request = {access, scope: "company" as const, filters: options.filters ?? {}, now};
  validate(request.scope, request.filters, access);
  const accessKey = JSON.stringify(access);
  const data = await readCompanySource(request, "current", options.signal);
  const value = workspace(request, data, options.signal);
  const latestAccess = await call("access", undefined, {signal: options.signal});
  options.signal?.throwIfAborted();
  if (generation !== epoch || session !== currentSessionId() || JSON.stringify(latestAccess) !== accessKey) throw Error("当前会话或授权范围已变化");
  value.workspaceId = `${value.workspaceId}:source:${++sequence}`;
  currentSnapshots.set(value.workspaceId, {request, data, workspace: value, accessKey, session, expires: Date.now() + 300000});
  while (currentSnapshots.size > 4) currentSnapshots.delete(currentSnapshots.keys().next().value!);
  return value;
}
export async function loadDetails(options: any, signal?: AbortSignal) {
  const item = snapshot(options.workspaceId, signal),
    request = detailRequest(item, options.filters);
  const pageNo = Number(options.pageNo ?? 1),
    pageSize = Number(options.pageSize ?? 10);
  if (
    !Number.isSafeInteger(pageNo) ||
    pageNo < 1 ||
    ![10, 20, 50, 100].includes(pageSize)
  )
    throw Error("分页参数无效");
  const { kind, layer } = options;
  if (
    !["structure", "aging", "orders"].includes(kind) ||
    !["base", "branch", "customer"].includes(layer)
  )
    throw Error("明细类型无效");
  if (
    layer === "customer" &&
    (request.scope !== "all-channel" || kind === "orders")
  )
    throw Error("当前范围不可查看客户明细");
  if (
    (request.filters.base && layer !== "base") ||
    (request.filters.branch && layer !== "branch") ||
    (request.filters.customerId && layer !== "customer")
  )
    throw Error("明细层级与筛选范围不一致");
  if (request.filters.sku) throw Error("SKU 已是最后一级");
  await checkSnapshot(item, signal);
  const value = workspace(request, item.data, signal);
  snapshot(options.workspaceId, signal);
  const objectSelected = Boolean(
    request.filters.base ||
    request.filters.branch ||
    request.filters.customerId,
  );
  const level = objectSelected
    ? request.filters.category !== undefined
      ? "sku"
      : "category"
    : "object";
  let rows: any[];
  if (kind === "structure") {
    rows = value.structure.filter((row) => row.layer === layer);
    if (level !== "sku") {
      const groups = new Map<string, any[]>();
      for (const row of rows) {
        const key = JSON.stringify([
          row.objectId,
          row.objectName,
          level === "category" ? row.category : null,
        ]);
        const group = groups.get(key) ?? [];
        group.push(row);
        groups.set(key, group);
      }
      rows = [...groups.values()].map((group) => ({
        ...summarizeStructure(
          group,
          `source:${level}:${group[0].key}`,
          group[0].objectName,
        ),
        category: level === "object" ? "全部品类" : group[0].category,
        children: [],
      }));
    }
  } else {
    const roots = kind === "aging" ? value.agingDetails : value.orderDetails;
    const objects = roots?.find((row) => row.layer === layer)?.children ?? [];
    rows =
      level === "object"
        ? objects
        : level === "category"
          ? objects.flatMap((row) => row.children ?? [])
          : objects
              .flatMap((row) => row.children ?? [])
              .flatMap((row) => row.children ?? []);
  }
  rows.sort((a, b) =>
    JSON.stringify([
      a.objectId,
      a.objectName,
      a.category,
      a.sku,
      a.key,
    ]).localeCompare(
      JSON.stringify([b.objectId, b.objectName, b.category, b.sku, b.key]),
      "en",
    ),
  );
  return {
    rows: rows
      .slice((pageNo - 1) * pageSize, pageNo * pageSize)
      .map((row) => ({
        ...row,
        children:
          kind === "structure"
            ? row.sku === "全部SKU"
              ? []
              : undefined
            : row.expandable
              ? []
              : undefined,
      })),
    total: rows.length,
    pageNo,
    pageSize,
    dataMode: "GEA_LIVE_READONLY",
  };
}
async function historicalWorkspace(item: ReturnType<typeof snapshot>, request: any, signal?: AbortSignal) {
  await checkSnapshot(item, signal);
  const key = JSON.stringify(request.filters);
  let history = item.history?.key === key ? item.history.data : undefined;
  if (!history) {
    const owner = item.historyRequest = (item.historyRequest ?? 0) + 1;
    history = await readCompanySource(request, "history", signal);
    snapshot(item.workspace.workspaceId, signal);
    await checkSnapshot(item, signal);
    if (owner === item.historyRequest) item.history = {key, data: history};
  }
  return workspace(request, {...item.data, inventoryTrend: history.inventoryTrend,
    orderHistory: history.orderHistory, agingHistory: history.agingHistory, historyDeferred: false}, signal);
}
export async function loadHistory(workspaceId: string, signal?: AbortSignal) {
  const item = snapshot(workspaceId, signal);
  return {...await historicalWorkspace(item, item.request, signal), workspaceId};
}
export async function loadTrend(options: any, signal?: AbortSignal) {
  const item = snapshot(options.workspaceId, signal), request = detailRequest(item, options.filters);
  const value = await historicalWorkspace(item, request, signal);
  snapshot(options.workspaceId, signal);
  return {workspaceId: options.workspaceId, scope: request.scope, filters: request.filters,
    generatedAt: item.request.now.toISOString(), trends: value.trends, dataMode: "GEA_LIVE_READONLY"};
}
export { buildFullChainWorkspace };
