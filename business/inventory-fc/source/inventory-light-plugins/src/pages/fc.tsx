import { InventoryBatchTable } from "./fc/components/inventory-batch-table";
import { parseActualQuantity, dmsWorkbookRows } from "../fc-feedback";
import {queryErrorText} from '../query-error.js';
import { emptyOrderDraft, editDraftQuantity, editDraftReason, undoDraftRow } from "../../../fc/src/lib/order-draft.ts";
import { WorkbenchLoading } from "../dsh-ui/workbench-loading";
import { kpiAgingRows, kpiShortageRows } from "../../../fc/src/lib/kpi-details.ts";
import { pinReplenishmentColumns, frozenColumnOffset } from "../../../fc/src/lib/replenishment-layout.ts";
import { ReplenishmentSkuResources, ReplenishmentDetailContent } from "./fc/components/replenishment-detail";
import { updateContext, clearContext } from "../native/context";
import { memoryStorage } from "../native/memory-storage";
import "./fc.css";
import { downloadWorkbook, readWorkbook } from "../dsh-ui/workbook.ts";
import {
  usePageFilter,
} from "../native/page-filter.tsx";



import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Columns3,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "../dsh-ui/icons";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  formatKpiDetail,
  formatTurnoverDetail,
} from "../../../fc/src/lib/kpi-format.ts";

import {
  BaseResourcesTable,
  baseResourceHeaders,
  baseResourceCells,
} from "./fc/components/base-resources-table.tsx";

import {
  filterCurrentOrders,
  ORDER_STATUSES,
  type OrderStatusFilter,
} from "../../../fc/src/lib/current-orders.ts";

import {
  AGING_COLUMNS,
  agingCells,
  filterInventory,
  inventoryAging,
  type AgeFilter,
} from "../../../fc/src/lib/inventory-aging.ts";

import { buildWorkbenchAnalysis, currentOrderMetrics, quantity as kpiQuantity, decimal as kpiDecimal, fulfillment as kpiFulfillment } from "../../../fc/src/lib/workbench-analysis.ts";

import { DataPagination } from "../dsh-ui/controls";
import { WarehouseSelect } from "./fc/components/warehouse-select";

import { useListPagination } from "./fc/components/use-list-pagination.ts";

import { FixedTableScrollbar } from "./fc/components/fixed-table-scrollbar.tsx";

import {
  PlanningTable,
  PersistedCycleSettings,
} from "./fc/components/planning-settings.tsx";

import {
  EffectivePlansTable,
  MonthlyBudgetPanel,
  BusinessPeriodNote,
} from "./fc/components/latest-data-panels.tsx";

import {
  IMPORT_FIELDS,
  parseImportedPlans,
  defaultPlanTemplateMonth,
} from "../../../fc/src/lib/planning.ts";

import { warehousePickupCode } from "../../../fc/src/lib/warehouse.ts";

import { summarizeCalculatedReplenishment } from "../../../fc/src/lib/replenishment-summary.ts";

import {
  REPLENISHMENT_COLUMNS,
  REPLENISHMENT_DEFAULT_COLUMNS,
  REPLENISHMENT_COLUMN_HINTS,
  visibleReplenishmentColumns,
  formatReplenishmentCell,
  replenishmentCellValue,
} from "../../../fc/src/lib/replenishment-columns.ts";

import { resolveCycleRule, type CycleRule } from "../../../fc/src/lib/rules.ts";

import {
  applyWorkbenchDraft,
  filterReplenishments,
} from "../../../fc/src/lib/workbench-page.ts";

import { appPath } from "../../../fc/src/lib/app-path.ts";

import {
  BrowserRepository,
  type OrderDraft,
} from "../../../fc/src/lib/browser-repository.ts";

import {
  resolveWarehouseSnapshot,
  emptyWarehouseSnapshot,
  requireLiveWarehouseSnapshot,
  hasLiveWarehouseSource,
  summarizeSnapshot,
  replenishmentIsReady,
  WAREHOUSE_OPTIONS,
  isWarehouseId,
  type InventoryBatch,
  type ReplenishmentRow,
  type WarehouseId,
  type WarehouseOption,
  type WarehouseSnapshot,
} from "../../../fc/src/lib/domain.ts";

import {
  BRANCH_RULESET,
  DEFAULT_CYCLE_PREVIEW,
  findConsumptionFirstSkus,
  type CyclePreviewConfiguration,
} from "../../../fc/src/lib/rules.ts";

type TabId =
  | "replenishment"
  | "orders"
  | "structure"
  | "plan"
  | "base"
  | "operations";

type SubmissionStatus = "idle" | "submitting" | "pending" | "failed";

type ImportError = { row: number; field: string; message: string };

type CycleRules = CyclePreviewConfiguration;

const DEFAULT_CYCLE_RULES = DEFAULT_CYCLE_PREVIEW;

const TABS: Array<{ id: TabId; icon: string; label: string }> = [
  { id: "replenishment", icon: "⇅", label: "补货确认" },
  { id: "orders", icon: "▣", label: "当前订单" },
  { id: "structure", icon: "▤", label: "货龄结构" },
  { id: "plan", icon: "▦", label: "分仓计划" },
  { id: "base", icon: "⌂", label: "基地资源" },
  { id: "operations", icon: "↗", label: "运营观察" },
];

const STEPS = ["监控指标", "缺货订单", "补货下单", "滞库消化", "大日期处理"];

const DEFAULT_COLUMNS = REPLENISHMENT_DEFAULT_COLUMNS;

const COLUMN_LABELS = REPLENISHMENT_COLUMNS;

function createConversationId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}`;
}

function number(value: number | null) {
  if (value === null) return "待核实";
  return new Intl.NumberFormat("zh-CN").format(value);
}

function money(value: number | null) {
  if (value === null) return "待核实";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number | null) {
  if (value === null) return "—";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(2)}%`;
}

function downloadText(
  fileName: string,
  content: string,
  mime = "text/plain;charset=utf-8",
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BranchInventoryAgent() {
  const [userId, setUserId] = useState("planner-changsha");
  const [conversationId, setConversationId] = useState(() => {
    if (typeof window !== "undefined") {
      const session = new URLSearchParams(window.location.search).get(
        "session",
      );
      if (/^session-[0-9a-f-]{36}$/.test(session ?? ""))
        return session!.slice(8);
    }
    return createConversationId();
  });
  const [warehouseId, setWarehouseId] = useState<WarehouseId>("changsha");
  const [authorizedWarehouseIds, setAuthorizedWarehouseIds] = useState<
    WarehouseId[]
  >(WAREHOUSE_OPTIONS.map((warehouse) => warehouse.id));
  const [warehouseOptions, setWarehouseOptions] =
    useState<WarehouseOption[]>(WAREHOUSE_OPTIONS);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionMode, setSessionMode] = useState<"local" | "gea">("gea");
  const [sessionError, setSessionError] = useState("");
  const [livePage, setLivePage] = useState<{
    snapshot: WarehouseSnapshot;
    requestBody: string;
    revision: number;
  } | null>(null);
  const liveSnapshot = livePage?.snapshot ?? null;
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [pageRevision, setPageRevision] = useState(0);
  const appliedPageRevision = useRef(0);
  const [detailSnapshot, setDetailSnapshot] =
    useState<WarehouseSnapshot | null>(null);
  const [detailError, setDetailError] = useState("");
  const [snapshotError, setSnapshotError] = useState("");
  const [snapshotEmpty, setSnapshotEmpty] = useState(false);
  const [restoredSnapshot, setRestoredSnapshot] =
    useState<WarehouseSnapshot | null>(null);
  const [readOnlyHistory, setReadOnlyHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("replenishment");
  const [search, setSearch] = useState("");
  const [businessOnly, setBusinessOnly] = useState(true);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [riskOnly, setRiskOnly] = useState(false);
  const [baseName, setBaseName] = useState("");
  const [baseSku, setBaseSku] = useState("");
  const [baseSkuInput, setBaseSkuInput] = useState("");
  const [orderStatus, setOrderStatus] = useState<OrderStatusFilter>("全部");
  const [ageFilters, setAgeFilters] = useState<AgeFilter[]>([]);
  const [replenishmentPage, setReplenishmentPage] = useState(1);
  const [replenishmentPageSize, setReplenishmentPageSize] = useState(10);
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({
    key: "recommendedQty",
    direction: "desc",
  });
  const [batchDetails, setBatchDetails] = useState<
    Record<string, { rows?: InventoryBatch[]; error?: string }>
  >({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [columnOrder, setColumnOrder] = useState(DEFAULT_COLUMNS);
  const [skuDetail, setSkuDetail] = useState<{sku:string;kind:"transfers"|"batches";baseName?:string}|null>(null);
  useEffect(() => {setSkuDetail(null)}, [warehouseId, activeTab]);
  const [frozenColumns, setFrozenColumns] = useState(["sku", "actualQty"]);
  const [draft, setDraft] = useState<OrderDraft>({
    quantities: {},
    reasons: {},
    dirty: false,
  });
  const [cycleRules, setCycleRules] = useState<CycleRules>(DEFAULT_CYCLE_RULES);
  const [cyclePreviewApplied, setCyclePreviewApplied] = useState(false);
  const [submissionStatus, setSubmissionStatus] =
    useState<SubmissionStatus>("idle");
  const [submissionError, setSubmissionError] = useState("");
  const [savedDraft, setSavedDraft] = useState<OrderDraft>(emptyOrderDraft);
  const [exportPreview, setExportPreview] = useState<{scopeKey:string;warehouseName:string;month:string;rows:Array<{sku:string;productName:string;quantity:number}>;missing:number}|null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportRequest = useRef<AbortController|null>(null);

  const [importRows, setImportRows] = useState<
    Array<Record<string, string | number>>
  >([]);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [planningSaving, setPlanningSaving] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateWarehouse, setTemplateWarehouse] =
    useState<WarehouseId>(warehouseId);
  const [templateMonth, setTemplateMonth] = useState(defaultPlanTemplateMonth);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [humanPlanApplied, setHumanPlanApplied] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const snapshot = useMemo(
    () =>
      sessionMode === "gea" && !readOnlyHistory
        ? liveSnapshot?.warehouseId === warehouseId
          ? liveSnapshot
          : emptyWarehouseSnapshot(warehouseId)
        : resolveWarehouseSnapshot(
            warehouseId,
            readOnlyHistory ? restoredSnapshot : liveSnapshot,
          ),
    [liveSnapshot, restoredSnapshot, warehouseId, readOnlyHistory, sessionMode],
  );
  const replenishmentReady = replenishmentIsReady(snapshot);
  const warehouseCycle = resolveCycleRule({
    warehouseId,
    sku: "",
    materialGroup: "",
    category: "",
    asOf:
      snapshot.planning?.calculationDate ??
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }),
    rules: (snapshot.planning?.rules ?? []).filter(
      (rule) => rule.level === "warehouse",
    ),
  });
  const repository = useMemo(() => new BrowserRepository(memoryStorage), []);
  const scope = useMemo(
    () => ({ userId, conversationId, warehouseId }),
    [userId, conversationId, warehouseId],
  );
  const draftScope = useMemo(()=>({...scope,month:snapshot.currentMonthLabel}),[scope,snapshot.currentMonthLabel]);
  const draftScopeKey = JSON.stringify(draftScope);
  const activeDraftScope = useRef(draftScopeKey);
  activeDraftScope.current = draftScopeKey;
  useEffect(() => {
    exportRequest.current?.abort(); exportRequest.current = null;
    setExportPreview(null); setExportBusy(false); setExportError("");
    setDialog(null);
    return () => { exportRequest.current?.abort(); };
  }, [draftScopeKey]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(appPath("/api/session"), {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          mode?: "local" | "gea";
          userId?: string;
          authorizedWarehouses?: WarehouseId[];
          warehouseOptions?: WarehouseOption[];
          warehouseCatalogIssues?: Array<{ name: string; reason: string }>;
          warehouseScopeMode?: string;
          message?: string;
        };
        if (
          !response.ok ||
          !payload.userId ||
          !payload.authorizedWarehouses?.length
        )
          throw new Error(payload.message || "启动会话校验失败");
        const options = (
          payload.warehouseOptions ??
          (payload.mode === "gea" ? [] : WAREHOUSE_OPTIONS)
        ).filter(
          (item) =>
            typeof item.id === "string" &&
            isWarehouseId(item.id) &&
            typeof item.name === "string" &&
            item.name.trim(),
        );
        const allowed = payload.authorizedWarehouses.filter((id) =>
          options.some((warehouse) => warehouse.id === id),
        );
        if (!allowed.length) throw new Error("当前账号没有分仓访问权限");
        setUserId(payload.userId);
        setSessionMode(payload.mode === "gea" ? "gea" : "local");
        setAuthorizedWarehouseIds(allowed);
        setWarehouseOptions(options.filter(({ id }) => allowed.includes(id)));
        const params = new URLSearchParams(window.location.search);
        const sharedWarehouse = params.get("warehouse") as WarehouseId | null;
        const sharedTab = params.get("tab") as TabId | null;
        const launchConversation = params.get("conversation");
        setWarehouseId(
          sharedWarehouse && allowed.includes(sharedWarehouse)
            ? sharedWarehouse
            : allowed.includes(warehouseId)
              ? warehouseId
              : allowed[0],
        );
        if (sharedTab && TABS.some((tab) => tab.id === sharedTab))
          setActiveTab(sharedTab);
        setSessionReady(true);
      } catch (error) {
        setSessionError(
          error instanceof Error ? error.message : "启动会话校验失败",
        );
      }
    })();
    // The launch session is immutable for the lifetime of this mounted Agent page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pageRequestBody = JSON.stringify({
    warehouseId,
    tab: activeTab,
    pageNumber: replenishmentPage,
    pageSize: replenishmentPageSize,
    search: activeTab === "base" ? baseSku : search,
    baseName,
    businessOnly,
    urgentOnly,
    riskOnly,
    ageFilters,
    orderStatus,
    sort,
    draft: { quantities: draft.quantities, reasons: draft.reasons },
  });
  useEffect(() => {
    if (!sessionReady || readOnlyHistory) return;
    const controller = new AbortController();
    setSnapshotLoading(true);
    setSnapshotError("");
    setSnapshotEmpty(false);
    clearContext({ keepPageFilters: true });
    updateContext("queryState", { state: "loading", warehouseId, message: "正在查询当前分仓，暂不提供库存事实" });
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(appPath("/api/warehouse-page"), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(pageRevision !== appliedPageRevision.current
              ? { "cache-control": "no-cache" }
              : {}),
          },
          body: pageRequestBody,
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          snapshot?: WarehouseSnapshot;
          message?: string;
        };
        if (!response.ok || !payload.snapshot)
          throw new Error(payload.message || "分仓业务数据暂不可用");
        if (payload.snapshot.dataState === "empty" && payload.snapshot.warehouseId === warehouseId) {
          if (!controller.signal.aborted) {
            setSnapshotEmpty(true);
            setLivePage(null);
            clearContext({ keepPageFilters: true });
            updateContext("queryState", {state: "empty", warehouseId, message: "授权范围内暂无库存与计划数据；不代表库存数量为零"});
          }
          return;
        }
        const currentSnapshot = requireLiveWarehouseSnapshot(
          warehouseId,
          payload.snapshot,
        );
        if (!controller.signal.aborted) {
          appliedPageRevision.current = pageRevision;
          setLivePage({ snapshot: currentSnapshot, requestBody: pageRequestBody, revision: pageRevision });
          updateContext("queryState", {state: "ready", warehouseId});
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : "分仓业务数据暂不可用";
          setSnapshotError(message);
          clearContext({ keepPageFilters: true });
          updateContext("queryState", { state: "error", warehouseId, message });
        }
      } finally {
        if (!controller.signal.aborted) setSnapshotLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    readOnlyHistory,
    sessionReady,
    warehouseId,
    pageRequestBody,
    pageRevision,
  ]);
  async function fullSnapshotForAction(signal?: AbortSignal) {
    if (!snapshot.page) return editedSnapshot;
    const response = await fetch(
      appPath(
        `/api/warehouse-snapshot?warehouseId=${encodeURIComponent(warehouseId)}`,
      ),
      { cache: "no-store", signal },
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.message || "完整分仓数据读取失败");
    return applyWorkbenchDraft(
      requireLiveWarehouseSnapshot(warehouseId, payload.snapshot),
      draft,
    );
  }
  useEffect(() => {
    if (!sessionReady) return;
    if (readOnlyHistory) {
      setDraft({ quantities: {}, reasons: {}, dirty: false });
      setCycleRules(DEFAULT_CYCLE_RULES);
      setCyclePreviewApplied(false);
      setHumanPlanApplied(false);
      setSearch("");
      setUrgentOnly(false);
      setRiskOnly(false);
      setImportRows([]);
      setImportErrors([]);
      return;
    }
    const saved = repository?.loadDraft(draftScope);
    setDraft(saved ?? emptyOrderDraft());
    setSavedDraft(saved ?? emptyOrderDraft());
    const filters = repository?.loadFilters(scope);
    setSearch(String(filters?.search ?? ""));
    setBaseName("");
    setBaseSku("");
    setBaseSkuInput("");
    setBusinessOnly(filters?.businessOnly !== false);
    setUrgentOnly(Boolean(filters?.urgentOnly));
    setRiskOnly(Boolean(filters?.riskOnly));
    setOrderStatus(
      ORDER_STATUSES.includes(filters?.orderStatusV2 as OrderStatusFilter)
        ? (filters?.orderStatusV2 as OrderStatusFilter)
        : "全部",
    );
    if (filters?.urgentOnly) setSort({ key: "shortageQty", direction: "desc" });
    else if (filters?.riskOnly)
      setSort({ key: "recommendedQty", direction: "desc" });
    setAgeFilters(
      Array.isArray(filters?.ageFilters)
        ? filters.ageFilters.filter(
            (age): age is AgeFilter => age === "60-90" || age === "90+",
          )
        : [],
    );
    setImportRows([]);
    setHumanPlanApplied(false);
    setCycleRules(DEFAULT_CYCLE_RULES);
    setCyclePreviewApplied(false);
    setImportErrors([]);
  }, [readOnlyHistory, repository, scope, draftScope, sessionReady]);
  useEffect(() => {
    if (!sessionReady) return;
    if (readOnlyHistory) return;
    repository?.saveFilters(scope, {
      search,
      businessOnly,
      urgentOnly,
      riskOnly,
      ageFilters,
      orderStatusV2: orderStatus,
    });
  }, [
    readOnlyHistory,
    repository,
    scope,
    sessionReady,
    search,
    businessOnly,
    urgentOnly,
    riskOnly,
    ageFilters,
    orderStatus,
  ]);
  const editedSnapshot: WarehouseSnapshot = useMemo(() => {
    if (readOnlyHistory) return snapshot;
    return {
      ...snapshot,
      replenishments: snapshot.replenishments.map((row) => ({
        ...row,
        actualQty:
          row.recommendedQty === null
            ? null
            : (draft.quantities[row.sku] ?? row.actualQty),
        reason: draft.reasons[row.sku] ?? row.reason,
      })),
    };
  }, [
    snapshot,
    draft,
    cycleRules,
    cyclePreviewApplied,
    warehouseId,
    humanPlanApplied,
    importRows,
    readOnlyHistory,
  ]);
  useEffect(() => {
    if (!livePage || !sessionReady || snapshotLoading || snapshotEmpty || snapshotError ||
        snapshot !== livePage.snapshot || livePage.requestBody !== pageRequestBody ||
        livePage.revision !== pageRevision) return;
    updateContext("data", {
      plugin: "fc",
      path: "/api/warehouse-page",
      parameters: JSON.parse(livePage.requestBody),
      loadedAt: new Date().toISOString(),
      summary: snapshot.metrics,
      computedOverview: snapshot.page?.overview,
      sourceTrace: snapshot.ruleTrace,
      localPreview: (snapshot as any).localPreview,
      sourceTime: snapshot.snapshotTime,
      dataQuality: snapshot.dataQuality,
    });
    updateContext("inventoryInsight", { summary: buildWorkbenchAnalysis(snapshot).summary, currentOrders: currentOrderMetrics(snapshot), coverage: "当前页面全仓KPI；缺失值不按零处理" });
    updateContext("branchDraft", {
      warehouseId,
      warehouseName: snapshot.warehouseName,
      tab: activeTab,
      status: "local-only",
      sourceTime: snapshot.snapshotTime,
      quantities: draft.quantities,
      reasons: draft.reasons,
      localPreview: (snapshot as any).localPreview,
      visibleReplenishments: editedSnapshot.replenishments,
    });
  }, [warehouseId, snapshot, activeTab, draft, editedSnapshot, sessionReady,
    snapshotLoading, snapshotEmpty, snapshotError, livePage, pageRequestBody, pageRevision]);
  const replenishmentTableRef = useRef<HTMLTableElement>(null);
  const visibleColumns = pinReplenishmentColumns(visibleReplenishmentColumns(columnOrder, snapshot), frozenColumns);
  useEffect(()=>{
    const table=replenishmentTableRef.current;if(!table)return;
    const headers=Array.from(table.querySelectorAll<HTMLTableCellElement>("thead > tr > th"));
    const update=()=>{let left=0;for(const head of headers){const col=head.dataset.column;if(!col||!frozenColumns.includes(col)||col==="actualQty")continue;table.style.setProperty(`--frozen-left-${col}`,`${left}px`);left+=head.getBoundingClientRect().width;}};
    update();const observer=new ResizeObserver(update);headers.forEach(h=>observer.observe(h));return()=>observer.disconnect();
  },[visibleColumns.join(","),frozenColumns.join(","),activeTab]);

  const replenishments = useMemo(
    () =>
      snapshot.page
        ? editedSnapshot.replenishments
        : filterReplenishments(editedSnapshot, {
            search,
            businessOnly,
            urgentOnly,
            riskOnly,
            sort,
          }),
    [
      snapshot.page,
      editedSnapshot,
      search,
      businessOnly,
      urgentOnly,
      riskOnly,
      sort,
    ],
  );
  const remotePagination = snapshot.page
    ? {
        pageNumber: snapshot.page.pageNumber,
        pageSize: replenishmentPageSize,
        totalCount: snapshot.page.totalCount,
        disabled: snapshotLoading,
        onPageChange: setReplenishmentPage,
        onPageSizeChange: (size: number) => {
          setReplenishmentPageSize(size);
          setReplenishmentPage(1);
        },
      }
    : undefined;
  const listResetKey = `${warehouseId}:${activeTab}:${search}:${baseSku}:${baseName}:${orderStatus}:${ageFilters.join(",")}`;
  const planPagination = useListPagination(
    snapshot.plans.filter((row) =>
      `${row.month} ${row.sku} ${row.productName}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ),
    listResetKey,
    remotePagination,
  );
  const orderPagination = useListPagination(
    filterCurrentOrders(snapshot.orders, search, orderStatus),
    listResetKey,
    remotePagination,
  );
  const inventoryPagination = useListPagination(
    filterInventory(snapshot.inventory, search, ageFilters),
    listResetKey,
    remotePagination,
  );
  const basePagination = useListPagination(
    snapshot.baseResourceQuery?.sku === baseSku
      ? snapshot.baseResources.filter(
          (row) => !baseName || row.baseName === baseName,
        )
      : [],
    listResetKey,
    remotePagination,
  );
  const observationPagination = useListPagination(
    [
      ...snapshot.operations.map((item) => ({
        kind: "operation" as const,
        item,
      })),
      ...snapshot.businessExceptions.map((item) => ({
        kind: "exception" as const,
        item,
      })),
    ].filter(
      (row) =>
        !search.trim() ||
        JSON.stringify(row.item)
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    ),
    listResetKey,
    remotePagination,
  );
  const replenishmentTotalPages = Math.max(
    1,
    Math.ceil(
      (snapshot.page?.totalCount ?? replenishments.length) /
        replenishmentPageSize,
    ),
  );
  const paginatedReplenishments = useMemo(() => {
    if (snapshot.page) return replenishments;
    const currentPage = Math.min(replenishmentPage, replenishmentTotalPages);
    const start = (currentPage - 1) * replenishmentPageSize;
    return replenishments.slice(start, start + replenishmentPageSize);
  }, [
    replenishmentPage,
    replenishmentPageSize,
    replenishmentTotalPages,
    replenishments,
    snapshot.page,
  ]);
  const submissionSummary = useMemo(
    () =>
      summarizeSnapshot(
        dialog === "submit" && detailSnapshot ? detailSnapshot : editedSnapshot,
      ),
    [dialog, detailSnapshot, editedSnapshot],
  );
  useEffect(() => {
    setReplenishmentPage(1);
    setExpanded(new Set());
  }, [
    search,
    businessOnly,
    urgentOnly,
    riskOnly,
    ageFilters,
    orderStatus,
    baseName,
    baseSku,
    warehouseId,
    activeTab,
    sort,
  ]);
  useEffect(() => {
    if (snapshotLoading || (snapshot.page && snapshot.page.tab !== activeTab))
      return;
    setReplenishmentPage((current) =>
      Math.min(current, replenishmentTotalPages),
    );
  }, [replenishmentTotalPages, snapshotLoading, snapshot.page, activeTab]);
  function autoSaveDraft(next: OrderDraft) {
    const saved = { ...next, dirty: false };
    try {
      if (!repository || !draftScope.month) throw Error("草稿存储尚未就绪");
      repository.saveDraft(draftScope, saved);
      setSavedDraft(saved); setDraft(saved);
    } catch {
      setDraft({ ...next, dirty: true });
      showToast("草稿自动保存失败，请重试保存");
    }
  }
  function updateQuantity(row: ReplenishmentRow, value: number) {
    if (readOnlyHistory || exportBusy) return;
    autoSaveDraft(editDraftQuantity(draft, savedDraft, row.sku, value, row.recommendedQty));
  }
  function updateReason(row: ReplenishmentRow, value: string) {
    if (readOnlyHistory || exportBusy) return;
    autoSaveDraft(editDraftReason(draft, savedDraft, row.sku, value));
  }
  function undoDraftChange(sku: string) {
    if (readOnlyHistory || exportBusy) return;
    autoSaveDraft(undoDraftRow(draft, savedDraft, sku));
  }
  async function prepareExport() {
    if (readOnlyHistory || exportRequest.current) return;
    const controller = new AbortController();
    exportRequest.current = controller;
    const requestScope = draftScopeKey;
    setExportBusy(true); setExportError(""); setExportPreview(null); setDialog("export");
    try {
      const response = await fetch(appPath("/api/dms-export"), {
        method:"POST", signal:controller.signal,
        headers:{"content-type":"application/json"},
        body:JSON.stringify({warehouseId, adjustments:Object.entries(draft.quantities).map(([sku,actualQty])=>({sku,actualQty,reason:draft.reasons[sku]??""}))}),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.message || result.error || "补货清单读取失败");
      if (controller.signal.aborted || activeDraftScope.current !== requestScope) return;
      const rows = result.rows.filter((row:{quantity:number|null})=>row.quantity !== null && row.quantity > 0);
      if (!rows.length) throw Error("暂无补货量大于 0 的商品，无需导出");
      setExportPreview({scopeKey:requestScope,warehouseName:snapshot.warehouseName,month:snapshot.currentMonthLabel,rows,missing:result.missingQuantityCount??0});
    } catch(error) {
      if (!controller.signal.aborted && activeDraftScope.current === requestScope) setExportError(error instanceof Error ? error.message : "读取失败");
    } finally {
      if (exportRequest.current === controller) { exportRequest.current=null;setExportBusy(false); }
    }
  }
  function closeExport() {
    exportRequest.current?.abort(); exportRequest.current=null;
    setExportBusy(false); setExportPreview(null); setDialog(null);
  }
  function exportConfirmedDraft() {
    const preview=exportPreview;
    if (!preview || exportBusy || activeDraftScope.current !== preview.scopeKey) return;
    try {
      downloadWorkbook(dmsWorkbookRows(preview.rows),`DMS补货-${preview.warehouseName}-${preview.month}.xlsx`,"补货清单");
    } catch(error) { setExportError(error instanceof Error ? error.message : "下载失败，草稿已保留");return; }
    try {
      if (!repository) throw Error("草稿存储不可用");
      repository.clearDraft(draftScope);
      setDraft(emptyOrderDraft());setSavedDraft(emptyOrderDraft());
      showToast("已发起下载，草稿已清空");
    } catch { showToast("已发起下载，草稿清空失败，请在草稿中撤销修改"); }
    closeExport();
  }
  async function savePlanning(
    body:
      | { action: "import"; rows: typeof importRows }
      | { action: "cycle"; rules: CycleRule[] }
      | { action: "reset" },
  ) {
    if (planningSaving || readOnlyHistory) return;
    const savingWarehouse = warehouseId;
    setPlanningSaving(true);
    try {
      const response = await fetch(appPath("/api/branch-planning"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, warehouseId: savingWarehouse }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.previewApplied) {
        if (payload.errors) setImportErrors(payload.errors);
        throw new Error(payload.message || "保存失败");
      }
      setPageRevision((value) => value + 1);
      setDialog(null);
      setImportRows([]);
      setImportErrors([]);
      showToast("试算完成，尚未保存");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存失败");
    } finally {
      setPlanningSaving(false);
    }
  }
  function applyHumanPlanPreview() {
    const validation = parseImportedPlans(
      importRows,
      snapshot.warehouseName,
      warehousePickupCode(warehouseId),
    );
    setImportErrors(validation.errors);
    if (!validation.errors.length)
      void savePlanning({ action: "import", rows: importRows });
  }
  function toggleExpanded(key: string) {
    if (activeTab === "structure" && snapshot.page && !expanded.has(key)) {
      const batchKey = `${warehouseId}:${snapshot.snapshotDate}:${key}`;
      setBatchDetails((current) => ({ ...current, [batchKey]: {} }));
      void fetch(
        appPath(
          `/api/warehouse-batches?warehouseId=${encodeURIComponent(warehouseId)}&sku=${encodeURIComponent(key)}&snapshotDate=${encodeURIComponent(snapshot.snapshotDate)}`,
        ),
        { cache: "no-store" },
      )
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok || !Array.isArray(payload.batches))
            throw new Error(payload.message || "批次读取失败");
          setBatchDetails((current) => ({
            ...current,
            [batchKey]: { rows: payload.batches },
          }));
        })
        .catch((error) =>
          setBatchDetails((current) => ({
            ...current,
            [batchKey]: {
              error: error instanceof Error ? error.message : "批次读取失败",
            },
          })),
        );
    }
    setExpanded((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function changeSort(key: string) {
    if (urgentOnly || riskOnly) return;
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }
  function moveColumn(target: string) {
    if (!draggedColumn || draggedColumn === target) return;
    setColumnOrder((current) => {
      const next = current.filter((column) => column !== draggedColumn);
      next.splice(next.indexOf(target), 0, draggedColumn);
      return next;
    });
    setDraggedColumn(null);
  }
  async function exportCsv() {
    let exportSnapshot: WarehouseSnapshot;
    try {
      if (activeTab === "base" && !readOnlyHistory) {
        const response = await fetch(appPath("/api/warehouse-page"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...JSON.parse(pageRequestBody),
            pageNumber: 1,
            pageSize: 100,
          }),
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok || !payload.snapshot)
          throw new Error(payload.message || "基地资源导出失败");
        exportSnapshot = requireLiveWarehouseSnapshot(
          warehouseId,
          payload.snapshot,
        );
      } else exportSnapshot = await fullSnapshotForAction();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "导出读取失败");
      return;
    }
    const snapshot = exportSnapshot;
    const replenishments = filterReplenishments(exportSnapshot, {
      search,
      businessOnly,
      urgentOnly,
      riskOnly,
      sort,
    });
    let headers: string[] = [];
    let values: Array<Array<string | number>> = [];
    if (activeTab === "replenishment") {
      const exportColumns = visibleReplenishmentColumns(
        columnOrder,
        exportSnapshot,
      );
      headers = exportColumns.map((column) => COLUMN_LABELS[column]);
      values = replenishments.map((row) =>
        exportColumns.map((column) => formatReplenishmentCell(row, column)),
      );
    } else if (activeTab === "orders") {
      headers = [
        "订单号",
        "客户",
        "订单日期",
        "SKU个数",
        "需求量",
        "已占用",
        "剩余需求量",
        "状态",
      ];
      values = filterCurrentOrders(snapshot.orders, search, orderStatus).map(
        (order) => {
          const ordered = order.lines.reduce(
            (sum, line) => sum + line.orderedQty,
            0,
          );
          const allocated = order.lines.reduce(
            (sum, line) => sum + line.allocatedQty,
            0,
          );
          return [
            order.orderNo,
            order.customer,
            order.requestedDate,
            new Set(order.lines.map(line => line.sku)).size,
            ordered,
            allocated,
            ordered - allocated,
            order.status,
          ];
        },
      );
    } else if (activeTab === "structure") {
      headers = AGING_COLUMNS;
      values = filterInventory(snapshot.inventory, search, ageFilters).map(
        agingCells,
      );
    } else if (activeTab === "plan") {
      headers = [
        "SKU编码",
        "产品名称",
        `${snapshot.currentMonthLabel}出库`,
        `${snapshot.currentMonthLabel}调拨`,
        "本月来源",
        `${snapshot.nextMonthLabel}出库`,
        `${snapshot.nextMonthLabel}调拨`,
        "次月来源",
        "状态",
      ];
      values = snapshot.plans
        .filter((row) =>
          `${row.month} ${row.sku} ${row.productName}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        )
        .map((row) => [
          row.sku,
          row.productName,
          row.currentAvailable === false ? "待核实" : row.currentOutboundQty,
          row.currentTransferAvailable === false ||
          row.currentAvailable === false
            ? "待核实"
            : row.currentTransferQty,
          row.currentSource ?? row.source,
          row.nextAvailable === false ? "待核实" : row.nextOutboundQty,
          row.nextTransferAvailable === false || row.nextAvailable === false
            ? "待核实"
            : row.nextTransferQty,
          row.nextSource ?? row.source,
          row.status === "incomplete" ? "待补齐 / 确认" : "已确认",
        ]);
    } else if (activeTab === "base") {
      const dates = snapshot.baseResourceQuery?.dates ?? [];
      headers = baseResourceHeaders(dates);
      values = snapshot.baseResources
        .filter((row) => !baseName || row.baseName === baseName)
        .map((row) => baseResourceCells(row, dates));
    } else {
      headers = ["级别", "标题", "详情", "建议动作"];
      values = snapshot.operations.map((row) => [
        row.severity,
        row.title,
        row.detail,
        row.suggestedAction,
      ]);
    }
    const escape = (value: string | number) =>
      `"${String(value).replaceAll('"', '""')}"`;
    const rows = values.map((row) => row.map(escape).join(","));
    const tabLabel =
      TABS.find((tab) => tab.id === activeTab)?.label ?? "业务明细";
    downloadText(
      `${snapshot.warehouseName}-${snapshot.snapshotDate}-${tabLabel}.csv`,
      `\uFEFF${[headers.map(escape).join(","), ...rows].join("\n")}`,
      "text/csv;charset=utf-8",
    );
    showToast("CSV 已导出");
  }
  async function downloadExcelTemplate() {
    if (templateLoading) return;
    setTemplateLoading(true);
    setTemplateError("");
    try {
      const response = await fetch(
        appPath(
          `/api/branch-planning?warehouseId=${encodeURIComponent(templateWarehouse)}&month=${encodeURIComponent(templateMonth)}`,
        ),
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.rows))
        throw new Error(payload.message || "计划读取失败");
      downloadWorkbook(
        [
          [...IMPORT_FIELDS],
          ...payload.rows.map((row: any) =>
            IMPORT_FIELDS.map((field) => row[field] ?? ""),
          ),
        ],
        `分仓计划-${templateWarehouse}-${templateMonth}.xlsx`,
        "分仓计划导入",
      );
      setTemplateOpen(false);
      showToast("Excel 模板已下载");
    } catch (error) {
      setTemplateError(
        error instanceof Error ? error.message : "Excel 模板下载失败，请重试",
      );
    } finally {
      setTemplateLoading(false);
    }
  }
  async function importExcel(file: File) {
    try {
      const rows = await readWorkbook(file);
      const errors = parseImportedPlans(
        rows,
        snapshot.warehouseName,
        warehousePickupCode(warehouseId),
      ).errors;
      setImportRows(rows);
      setImportErrors(errors);
      setHumanPlanApplied(false);
      setDialog("import");
      if (!errors.length) {
        repository?.savePlanDraft(scope, {
          fileName: file.name,
          rows,
          importedAt: new Date().toISOString(),
          applied: false,
        });
        repository?.appendAudit(scope, {
          id: createConversationId(),
          type: "plan-import",
          occurredAt: new Date().toISOString(),
          operator: userId,
          detail: {
            warehouseId,
            fileName: file.name,
            rowCount: rows.length,
            status: "待确认入库",
          },
        });
      }
    } catch (error) {
      setImportRows([]);
      setImportErrors([
        {
          row: 0,
          field: "文件",
          message:
            error instanceof Error ? error.message : "无法读取 Excel 文件",
        },
      ]);
      setDialog("import");
    }
  }
  useEffect(() => {
    if (
      !dialog ||
      ["columns", "cycle", "submit", "export", "import"].includes(dialog) ||
      !snapshot.page
    )
      return;
    let cancelled = false;
    setDetailSnapshot(null);
    setDetailError("");
    void fullSnapshotForAction()
      .then((value) => {
        if (!cancelled) setDetailSnapshot(value);
      })
      .catch((error) => {
        if (!cancelled)
          setDetailError(
            error instanceof Error ? error.message : "明细读取失败",
          );
      });
    return () => {
      cancelled = true;
    };
    // Full detail requests are tied to the opened drilldown and warehouse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, warehouseId]);
  const currentStep =
    submissionStatus === "pending"
      ? 4
      : draft.dirty
        ? 3
        : activeTab === "replenishment"
          ? 2
          : activeTab === "orders"
            ? 1
            : 0;
  const calculatedSummary = summarizeCalculatedReplenishment(snapshot);
  const totalReplenishmentSkus =
    snapshot.page?.overview.counts.replenishments ??
    snapshot.replenishments.length;
  const workbenchAnalysis = buildWorkbenchAnalysis(snapshot);
  const shortageOrderCount =
    snapshot.page?.overview.shortageOrderCount ??
    snapshot.orders.filter((order) =>
      order.lines.some((line) => line.shortageQty > 0),
    ).length;
  const consumptionSnapshot =
    dialog === "submit" && detailSnapshot ? detailSnapshot : snapshot;
  const consumptionFirstSkus =
    consumptionSnapshot.page?.overview.consumptionFirstSkus ??
    findConsumptionFirstSkus(
      consumptionSnapshot.inventory.flatMap((row) =>
        row.batches.map((batch) => ({
          sku: row.sku,
          ageDays: batch.ageDays,
          quantity: batch.quantity,
        })),
      ),
      consumptionSnapshot.orders.flatMap((order) =>
        order.lines.map((line) => ({
          sku: line.sku,
          shortageQty: line.shortageQty,
        })),
      ),
    );

  const layoutMode = "workspace";
  usePageFilter(
    {
      allowedFields: [
        "warehouseId",
        "tab",
        "search",
        "urgentOnly",
        "riskOnly",
        "businessOnly",
      ],
      warehouses: sessionReady ? authorizedWarehouseIds : [],
      tabs: TABS.map((t) => t.id),
      warehouseId,
      tab: activeTab,
      search,
      urgentOnly,
      riskOnly,
      businessOnly,
    },
    (args) => {
      if (
        args.warehouseId !== undefined &&
        args.warehouseId !== warehouseId &&
        Object.keys(args).length > 1
      )
        throw Error("请先单独切换分仓");
      if (args.warehouseId !== undefined) setWarehouseId(args.warehouseId);
      if (args.tab !== undefined) setActiveTab(args.tab);
      if (args.search !== undefined) {
        setSearch(args.search);
        setBaseSku(args.search);
        setBaseSkuInput(args.search);
      }
      if (args.businessOnly !== undefined) setBusinessOnly(args.businessOnly);
      if (args.urgentOnly !== undefined) {
        setUrgentOnly(args.urgentOnly);
        if (args.urgentOnly) setRiskOnly(false);
      }
      if (args.riskOnly !== undefined) {
        setRiskOnly(args.riskOnly);
        if (args.riskOnly) setUrgentOnly(false);
      }
      setReplenishmentPage(1);
    },
  );
  const selectWarehouse = (nextWarehouse: WarehouseId) => {
    setWarehouseId(nextWarehouse);
    setRestoredSnapshot(null);
    setReadOnlyHistory(false);
    setConversationId(createConversationId());
    setSubmissionStatus("idle");
  };
  if (snapshotEmpty && !snapshotLoading) return (
    <main className="launch-screen"><section className="launch-card" role="status">
      <WarehouseSelect value={warehouseId} options={warehouseOptions}
        disabled={planningSaving} onChange={(value) => selectWarehouse(value as WarehouseId)} />
      <strong>当前授权范围暂无库存与计划数据</strong>
      <p>查询已完成，未返回业务行；不代表库存数量为零。</p>
      <button onClick={() => window.location.reload()}>重新查询</button>
    </section></main>
  );
  if (
    !sessionReady ||
    (!readOnlyHistory &&
      snapshotLoading &&
      (!liveSnapshot || liveSnapshot.warehouseId !== warehouseId)) ||
    (!readOnlyHistory &&
      sessionMode === "gea" &&
      (!liveSnapshot || liveSnapshot.warehouseId !== warehouseId))
  ) {
    const blockingError =
      sessionError || (sessionMode === "gea" ? snapshotError : "");
    if (!blockingError) return <WorkbenchLoading title="分仓库存经营看板" compact />;
    return (
      <main className="launch-screen">
        <div className="launch-card error" role="alert">
          <AlertTriangle size={28} />
          <strong>无法进入分仓库存</strong>
          <p>{blockingError}</p>
        </div>
      </main>
    );
  }
  return (
    <main className="agent-root">
      <div className="agent-shell">
        <header className="agent-topbar compact-topbar">
          <div className="agent-topbar-context">
            <div className="workspace-heading">
              <strong>分仓库存经营看板</strong>
              <span>库存监控 · 补货决策 · 订单履约</span>
            </div>
            <div className="steps" aria-label="运营步骤">
              {STEPS.map((step, index) => (
                <Fragment key={step}>
                  <button
                    className={
                      index === currentStep
                        ? "active"
                        : index < currentStep
                          ? "complete"
                          : ""
                    }
                    onClick={() => {
                      if (index === 1) setActiveTab("orders");
                      if (index >= 2) setActiveTab("replenishment");
                    }}
                  >
                    <i>
                      {index < currentStep ? <Check size={12} /> : index + 1}
                    </i>
                    <span>{step}</span>
                  </button>
                  {index < STEPS.length - 1 && <b aria-hidden="true">→</b>}
                </Fragment>
              ))}
            </div>
            {!hasLiveWarehouseSource(snapshot) && (
              <span className="readonly-badge">演示数据（非真实业务）</span>
            )}
            <div className="warehouse-switch">
              <WarehouseSelect
                value={warehouseId}
                options={warehouseOptions}
                disabled={readOnlyHistory || planningSaving}
                onChange={(value) => selectWarehouse(value as WarehouseId)}
              />
            </div>
            <button
              className="warehouse-cycle-context"
              type="button"
              aria-label="补货周期配置"
              aria-haspopup="dialog"
              disabled={planningSaving}
              title="分仓默认周期；SKU、物料组、大类可单独配置，以明细中的生效周期为准"
              onClick={() => setDialog("cycle")}
            >
              <SlidersHorizontal size={16} />
              <span>补货周期</span>
              <strong>{warehouseCycle.cycleDays}天</strong>
            </button>
            {readOnlyHistory && (
              <span className="readonly-badge">历史快照 · 只读</span>
            )}
          </div>
        </header>
        <div className="agent-layout without-ai workspace-only">
          <section className="workspace">
            <div className="kpi-grid safety-stock-kpis">
              {[
                { title: "当前库存", value: kpiQuantity(snapshot.metrics.inventoryQty), unit: "件", color: "blue", details: [["回顾周转", kpiDecimal(snapshot.metrics.turnoverDays), "天"], ["展望周转", kpiDecimal(snapshot.metrics.forecastTurnoverDays), "天"]] },
                { title: "当前货龄", value: kpiDecimal(snapshot.metrics.averageAgeDays), unit: "天", color: "purple", details: [["超龄库存量", kpiQuantity(snapshot.metrics.bigDateQty), "件"], ["滞库风险量", kpiQuantity(snapshot.metrics.stagnantQty), "件"]] },
                { title: "订单满足率", value: kpiFulfillment(snapshot.metrics.fulfillmentRate), unit: "", color: "green", details: [["已发订单量", kpiQuantity(snapshot.metrics.orderQty), "件"], ["实际发货量", kpiQuantity(snapshot.metrics.shippedQty), "件"]] },
                { title: "待补货量", value: kpiQuantity(calculatedSummary.quantity), unit: "件", color: "red", partial: calculatedSummary.partial, details: [["调拨备单量", kpiQuantity(snapshot.metrics.orderedNotShippedQty), "件"], ["调拨在途量", kpiQuantity(snapshot.metrics.shippedNotReceivedQty), "件"]] },
                { title: "当前订单", value: kpiQuantity(currentOrderMetrics(snapshot).quantity), unit: "件", color: "amber", details: [["缺货量", kpiQuantity(snapshot.metrics.shortageQty), "件"], ["备单量", kpiQuantity(currentOrderMetrics(snapshot).preparing), "件"]] },
              ].map(card => <article key={card.title} className={`kpi-card ${card.color}`}>
                <div className="kpi-title"><span>{card.title}</span>{card.partial && <small>已核实范围</small>}</div>
                <div className={`kpi-value ${card.color}`}>{card.value}{card.value !== "-" && <small>{card.unit}</small>}</div>
                <dl>{card.details.map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value}{value !== "-" ? unit : ""}</dd></div>)}</dl>
              </article>)}
            </div>
            <section className="priority-analysis" aria-label="AI 洞察">
              <h3><span className="analysis-label">AI 洞察</span><small>经营洞察</small></h3>
              <p><b>核心判断：</b>{workbenchAnalysis.judgment}</p>
              {workbenchAnalysis.relationship && <p><b>关系分析：</b>{workbenchAnalysis.relationship}</p>}
              {workbenchAnalysis.boundary && <p><b>数据边界：</b>{workbenchAnalysis.boundary}</p>}
            </section>

            {snapshot.dataQuality?.warnings?.length ? (
              <details className="data-quality-note">
                <summary>
                  数据完整性说明（{snapshot.dataQuality.warnings.length} 项）
                </summary>
                {snapshot.dataQuality.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
                <p>
                  {Object.entries(snapshot.dataQuality.sourceDates ?? {})
                    .map(([name, date]) => `${name}：${date}`)
                    .join("；")}
                </p>
              </details>
            ) : null}
            <nav className="tabs dealer-style-tabs" aria-label="库存业务页签">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={activeTab === tab.id ? "page" : undefined}
                  className={activeTab === tab.id ? "active" : ""}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <div className="business-panel" aria-busy={snapshotLoading}>
              {(snapshot as any).localPreview && (
                <div className="inline-note" role="status">
                  计划与周期试算 · 未保存
                </div>
              )}
              {snapshotError && sessionMode === "gea" ? (
                <div className="empty-state" role="alert">
                  <p>{queryErrorText(snapshotError)}</p>
                  <button
                    className="secondary-button"
                    onClick={() => setPageRevision((value) => value + 1)}
                  >
                    重试读取
                  </button>
                  <p>可切换其他页签查看数据。</p>
                </div>
              ) : (
                <>
                  {snapshotLoading && (
                    <div role="status" className="inline-note">
                      正在读取第 {replenishmentPage} 页…
                    </div>
                  )}
                  <FixedTableScrollbar
                    viewKey={`${warehouseId}:${activeTab}:${layoutMode}`}
                  />
                  <div className="panel-actions">
                    {activeTab === "base" ? (
                      <>
                        <label className="order-status-filter">
                          基地
                          <select
                            aria-label="选择基地"
                            value={baseName}
                            onChange={(event) =>
                              setBaseName(event.target.value)
                            }
                          >
                            <option value="">全部</option>
                            {(snapshot.baseResourceQuery?.baseNames ?? []).map(
                              (name) => (
                                <option key={name}>{name}</option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="search-box">
                          <Search size={15} />
                          <input
                            aria-label="基地资源SKU"
                            value={baseSkuInput}
                            onChange={(event) =>
                              setBaseSkuInput(event.target.value)
                            }
                            placeholder="输入完整SKU编码"
                            onKeyDown={(event) => {
                              if (event.key === "Enter")
                                setBaseSku(baseSkuInput.trim());
                            }}
                          />
                        </label>
                        <button
                          className="secondary-button"
                          onClick={() => setBaseSku(baseSkuInput.trim())}
                        >
                          查询
                        </button>
                      </>
                    ) : (
                      <label className="search-box">
                        <Search size={15} />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="搜索 SKU / 产品名称"
                        />
                      </label>
                    )}
                    {activeTab === "replenishment" && (
                      <>
                        <label
                          className={`filter-chip ${businessOnly ? "active" : ""}`}
                          title="现库存、备单中量、30日日均、本月/次月出货或调拨计划任一大于0"
                        >
                          <input
                            type="checkbox"
                            checked={businessOnly}
                            onChange={(event) =>
                              setBusinessOnly(event.target.checked)
                            }
                          />
                          有业务
                        </label>
                        <label
                          className={`filter-chip ${urgentOnly ? "active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={urgentOnly}
                            onChange={(event) => {
                              setUrgentOnly(event.target.checked);
                              if (event.target.checked) {
                                setRiskOnly(false);
                                setSort({
                                  key: "shortageQty",
                                  direction: "desc",
                                });
                              }
                            }}
                          />
                          紧急 SKU
                        </label>
                        <label
                          className={`filter-chip ${riskOnly ? "active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={riskOnly}
                            onChange={(event) => {
                              setRiskOnly(event.target.checked);
                              if (event.target.checked) {
                                setUrgentOnly(false);
                                setSort({
                                  key: "recommendedQty",
                                  direction: "desc",
                                });
                              }
                            }}
                          />
                          低于建议
                        </label>
                      </>
                    )}
                    {activeTab === "orders" && (
                      <label className="order-status-filter">
                        状态
                        <select
                          aria-label="订单状态"
                          value={orderStatus}
                          onChange={(event) =>
                            setOrderStatus(
                              event.target.value as OrderStatusFilter,
                            )
                          }
                        >
                          {ORDER_STATUSES.map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {activeTab === "structure" &&
                      (["60-90", "90+"] as AgeFilter[]).map((age) => (
                        <label
                          key={age}
                          className={`filter-chip ${ageFilters.includes(age) ? "active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={ageFilters.includes(age)}
                            onChange={(event) =>
                              setAgeFilters((current) =>
                                event.target.checked
                                  ? [...current, age]
                                  : current.filter((value) => value !== age),
                              )
                            }
                          />
                          {age === "60-90" ? "60-90天" : "90天以上"}
                        </label>
                      ))}
                    <button
                      className="text-button"
                      onClick={() => {
                        setSearch("");
                        setBusinessOnly(true);
                        setUrgentOnly(false);
                        setRiskOnly(false);
                        setAgeFilters([]);
                        setOrderStatus("全部");
                        setBaseName("");
                        setBaseSku("");
                        setBaseSkuInput("");
                      }}
                    >
                      <RotateCcw size={14} />
                      重置
                    </button>
                    <div className="toolbar-spacer" />
                    {activeTab === "plan" && (
                      <>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setTemplateWarehouse(warehouseId);
                            setTemplateMonth(defaultPlanTemplateMonth());
                            setTemplateError("");
                            setTemplateOpen(true);
                          }}
                        >
                          <FileSpreadsheet size={15} />
                          下载模板
                        </button>
                        <label className="secondary-button file-button">
                          <FileSpreadsheet size={15} />
                          导入 Excel
                          <input
                            type="file"
                            accept=".xlsx"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void importExcel(file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </>
                    )}
                    {activeTab === "replenishment" && (
                      <>
                        {draft.dirty && <button className="secondary-button" disabled={readOnlyHistory || exportBusy} onClick={()=>autoSaveDraft(draft)}>重试保存</button>}
                        <button className="secondary-button" disabled={readOnlyHistory || exportBusy} onClick={()=>setDialog("draft")}>
                          草稿（{new Set([...Object.keys(draft.quantities),...Object.keys(draft.reasons)]).size}）
                        </button>
                        <button className="primary-button panel-primary" disabled={readOnlyHistory || exportBusy} onClick={()=>void prepareExport()}>
                          {exportBusy ? <LoaderCircle className="spin" size={14}/> : <Check size={14}/>}{exportBusy ? "正在生成清单…" : "提交"}
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => setDialog("columns")}
                        >
                          <Columns3 size={15} />
                          列设置
                        </button>
                      </>
                    )}
                    {activeTab !== "orders" && <button className="secondary-button" onClick={exportCsv}>
                      <Download size={15} />
                      CSV
                    </button>}
                  </div>

                  {activeTab === "replenishment" && (
                    <>
                      <div className="table-scroll">
                        <table ref={replenishmentTableRef} className="data-table replenishment-table">
                          <thead>
                            <tr>
                              {visibleColumns.map((column) => (
                                <th
                                  key={column}
                                  data-column={column} style={frozenStyle(column, visibleColumns, frozenColumns)}
                                  title={REPLENISHMENT_COLUMN_HINTS[column]}
                                  draggable={!readOnlyHistory}
                                  onDragStart={() => setDraggedColumn(column)}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={() => moveColumn(column)}
                                  className={frozenColumnClass(
                                    column,
                                    frozenColumns,
                                  )}
                                  onClick={() => changeSort(column)}
                                >
                                  <span className="replenishment-column-heading"><span className="replenishment-column-label">
                                    {balancedHeader(COLUMN_LABELS[column])}
                                  </span><span className="column-sort-indicator">
                                    {sort.key === column
                                      ? sort.direction === "asc"
                                        ? "↑"
                                        : "↓"
                                      : ""}
                                  </span></span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedReplenishments.map((row) => (
                              <ReplenishmentTableRows
                                key={row.sku}
                                row={row}
                                warehouseId={warehouseId}
                                version={snapshot.version}
                                onDetail={setSkuDetail}
                                columns={visibleColumns}
                                frozenColumns={frozenColumns}
                                expanded={expanded.has(row.sku)}
                                readOnly={readOnlyHistory}
                                onToggle={() => toggleExpanded(row.sku)}
                                onQuantity={updateQuantity}
                                onReason={updateReason}
                              />
                            ))}
                          </tbody>
                        </table>
                        {!replenishments.length && (
                          <div className="empty-state">
                            没有符合当前筛选条件的 SKU
                          </div>
                        )}
                      </div>
                      <DataPagination
                        ariaLabel="补货明细分页"
                        itemLabel="SKU"
                        pageNumber={replenishmentPage}
                        pageSize={replenishmentPageSize}
                        pageSizeOptions={[10, 20, 50, 100]}
                        totalCount={
                          snapshot.page?.totalCount ?? replenishments.length
                        }
                        disabled={snapshotLoading}
                        onPageChange={setReplenishmentPage}
                        onPageSizeChange={(pageSize) => {
                          setReplenishmentPageSize(pageSize);
                          setReplenishmentPage(1);
                        }}
                      />
                    </>
                  )}

                  {activeTab === "orders" && (
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>订单号</th>
                            <th>客户</th>
                            <th>订单日期</th>
                            <th>SKU个数</th>
                            <th>需求量</th>
                            <th>已占用</th>
                            <th>剩余需求量</th>
                            <th>状态</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderPagination.rows.map((order) => {
                            const ordered = order.lines.reduce(
                              (sum, line) => sum + line.orderedQty,
                              0,
                            );
                            const allocated = order.lines.reduce(
                              (sum, line) => sum + line.allocatedQty,
                              0,
                            );
                            return (
                              <Fragment key={order.orderNo}>
                                <tr>
                                  <td><button className="sku-link order-number-link" aria-expanded={expanded.has(order.orderNo)} onClick={() => toggleExpanded(order.orderNo)}>{order.orderNo}</button></td>
                                  <td>{order.customer}</td>
                                  <td>{order.requestedDate}</td>
                                  <td>{new Set(order.lines.map(line => line.sku)).size}</td>
                                  <td>{number(ordered)}</td>
                                  <td>{number(allocated)}</td>
                                  <td
                                    className={
                                      ordered - allocated ? "danger-text" : ""
                                    }
                                  >
                                    {number(ordered - allocated)}
                                  </td>
                                  <td>
                                    <span
                                      className={`status ${order.status === "缺口" ? "danger" : order.status === "临期" ? "warning" : "success"}`}
                                    >
                                      {order.status}
                                    </span>
                                  </td>
                                </tr>
                                {expanded.has(order.orderNo) && (
                                  <tr className="detail-row">
                                    <td colSpan={8}>
                                      <div className="detail-grid">
                                        {order.lines.map((line) => (
                                          <div key={line.sku}>
                                            <strong>
                                              {line.sku} · {line.productName}
                                            </strong>
                                            <span>
                                              需求量：{number(line.orderedQty)}
                                            </span>
                                            <span>
                                              已占用：
                                              {number(line.allocatedQty)}
                                            </span>
                                            <span
                                              className={
                                                line.shortageQty
                                                  ? "danger-text"
                                                  : ""
                                              }
                                            >
                                              剩余需求量：
                                              {number(line.shortageQty)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {activeTab === "structure" && (
                    <div className="table-scroll">
                      <table
                        className="data-table aging-table"
                        title="货龄分段按[0,30)、[30,60)、[60,90)、≥90天统计正库存批次，占比以该SKU正库存为分母"
                      >
                        <thead>
                          <tr>
                            {AGING_COLUMNS.map((label) => (
                              <th key={label}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {inventoryPagination.rows.map((row) => {
                            const age = inventoryAging(row);
                            return (
                              <Fragment key={row.sku}>
                                <tr>
                                  {agingCells(row).map((value, index) => (
                                    <td key={AGING_COLUMNS[index]}>
                                      {index === 0 ? (
                                        <button
                                          className="sku-link"
                                          onClick={() =>
                                            toggleExpanded(row.sku)
                                          }
                                          aria-expanded={expanded.has(row.sku)}
                                        >
                                          {value}
                                        </button>
                                      ) : index === 10 ? (
                                        <span
                                          className={`status ${age.buckets[3] > 0 ? "danger" : age.buckets[2] > 0 || age.unknownAgeQty > 0 ? "warning" : "success"}`}
                                        >
                                          {value}
                                        </span>
                                      ) : (
                                        value
                                      )}
                                    </td>
                                  ))}
                                </tr>
                                {expanded.has(row.sku) && (
                                  <tr className="detail-row">
                                    <td colSpan={AGING_COLUMNS.length}>
                                      <InventoryBatchTable rows={snapshot.page ? batchDetails[`${warehouseId}:${snapshot.snapshotDate}:${row.sku}`]?.rows : row.batches}
                                        error={batchDetails[`${warehouseId}:${snapshot.snapshotDate}:${row.sku}`]?.error} />
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                      {!inventoryPagination.rows.length && (
                        <div className="empty-state">
                          没有符合当前筛选条件的 SKU
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "plan" && (
                    <>
                      <div className="inline-note">
                        <FileSpreadsheet size={16} />{" "}
                        同分仓、同月份以导入计划为准，缺行不自动补齐；未导入月份沿用原计划。
                        模板一行对应一个月份。试算结果尚未保存，关闭页面后清除。
                      </div>
                      <EffectivePlansTable
                        rows={planPagination.rows}
                        currentMonth={snapshot.currentMonthLabel}
                        nextMonth={snapshot.nextMonthLabel}
                      />
                      <DataPagination
                        ariaLabel="当前使用计划分页"
                        itemLabel="SKU"
                        {...planPagination.props}
                      />
                      <details>
                        <summary>当前页 SKU 的人工计划记录</summary>
                        <PlanningTable
                          key={warehouseId}
                          rows={(snapshot.planning?.imports ?? []).filter(
                            (row) =>
                              planPagination.rows.some(
                                (plan) => plan.sku === row.sku,
                              ),
                          )}
                          search=""
                        />
                      </details>
                    </>
                  )}

                  {activeTab === "base" && (
                    <BaseResourcesTable
                      rows={basePagination.rows}
                      dates={snapshot.baseResourceQuery?.dates ?? []}
                      sku={baseSku}
                    />
                  )}

                  {activeTab === "operations" && (
                    <>
                      <BusinessPeriodNote
                        periods={snapshot.businessPeriods}
                        kind="operations"
                      />
                      <MonthlyBudgetPanel
                        rows={snapshot.monthlyBudgets ?? []}
                        month={snapshot.businessPeriods?.operationsMonth}
                      />
                      <div className="resource-grid">
                        <article className="resource-card">
                          <div>
                            <strong>本月入库</strong>
                          </div>
                          <p>
                            {number(snapshot.operationsSummary.inboundQty)} 件
                          </p>
                        </article>
                        <article className="resource-card">
                          <div>
                            <strong>本月出库</strong>
                          </div>
                          <p>
                            {number(snapshot.operationsSummary.outboundQty)} 件
                          </p>
                        </article>
                        <article className="resource-card">
                          <div>
                            <strong>本月仓储费</strong>
                          </div>
                          <p>{money(snapshot.operationsSummary.storageFee)}</p>
                        </article>
                        <article className="resource-card">
                          <div>
                            <strong>本月运输费</strong>
                          </div>
                          <p>
                            {money(snapshot.operationsSummary.transportFee)}
                          </p>
                        </article>
                        <article className="resource-card">
                          <div>
                            <strong>分仓过仓量</strong>
                          </div>
                          <p>{number(snapshot.throughput.branchShipQty)} 件</p>
                        </article>
                        <article className="resource-card">
                          <div>
                            <strong>省区整体出货</strong>
                          </div>
                          <p>
                            {number(snapshot.throughput.provinceShipQty)} 件
                          </p>
                        </article>
                      </div>
                      <div className="resource-grid">
                        {snapshot.assessmentMetrics.map((metric) => (
                          <article className="resource-card" key={metric.key}>
                            <div>
                              <strong>{metric.label}</strong>
                              <span
                                className={`status ${metric.value === null ? "warning" : "success"}`}
                              >
                                {metric.value === null ? "待同步" : "已同步"}
                              </span>
                            </div>
                            <p>{percent(metric.value)}</p>
                          </article>
                        ))}
                      </div>
                      <div className="observation-list">
                        {observationPagination.rows
                          .filter((row) => row.kind === "operation")
                          .map(({ item }) => (
                            <article key={item.id}>
                              <span className={`severity ${item.severity}`}>
                                {item.severity}
                              </span>
                              <div>
                                <strong>{item.title}</strong>
                                <p>{item.detail}</p>
                                <small>建议：{item.suggestedAction}</small>
                              </div>
                            </article>
                          ))}
                        {observationPagination.rows
                          .filter((row) => row.kind === "exception")
                          .map(({ item }) => (
                            <article key={`${item.type}-${item.sku}`}>
                              <span className="severity 中">人</span>
                              <div>
                                <strong>
                                  {item.sku} ·{" "}
                                  {businessExceptionLabel(item.type)}
                                </strong>
                                <p>{item.detail}</p>
                                <small>
                                  {item.status === "needs-maintenance"
                                    ? "需维护规则后人工确认"
                                    : "待人工确认"}{" "}
                                  · 不自动改变计划
                                </small>
                              </div>
                            </article>
                          ))}
                      </div>
                    </>
                  )}

                  {activeTab === "orders" && (
                    <DataPagination
                      ariaLabel="客户订单分页"
                      itemLabel="订单"
                      {...orderPagination.props}
                    />
                  )}
                  {activeTab === "structure" && (
                    <DataPagination
                      ariaLabel="货龄结构分页"
                      itemLabel="库存SKU"
                      {...inventoryPagination.props}
                    />
                  )}
                  {activeTab === "base" && (
                    <DataPagination
                      ariaLabel="基地资源分页"
                      itemLabel="基地"
                      {...basePagination.props}
                    />
                  )}
                  {activeTab === "operations" && (
                    <DataPagination
                      ariaLabel="运营观察分页"
                      itemLabel="观察"
                      {...observationPagination.props}
                    />
                  )}
                  {activeTab === "replenishment" &&
                    (submissionStatus === "failed" ||
                      submissionStatus === "pending" ||
                      readOnlyHistory) && (
                      <footer className="table-status-line">
                        {submissionStatus === "failed" && (
                          <em>{submissionError}</em>
                        )}
                        {submissionStatus === "pending" && (
                          <em className="success-text">
                            业务待办已创建，未执行下单
                          </em>
                        )}
                        {readOnlyHistory && (
                          <em className="readonly-text">历史结果只读</em>
                        )}
                      </footer>
                    )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
      {templateOpen && (
        <Dialog
          title="下载分仓计划模板"
          onClose={() => {
            if (!templateLoading) setTemplateOpen(false);
          }}
        >
          <div className="plan-template-settings">
            <label>
              分仓
              <select
                value={templateWarehouse}
                disabled={templateLoading}
                onChange={(event) =>
                  setTemplateWarehouse(event.target.value as WarehouseId)
                }
              >
                {warehouseOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              计划月份
              <input
                type="month"
                value={templateMonth}
                disabled={templateLoading}
                onChange={(event) => setTemplateMonth(event.target.value)}
              />
            </label>
            <p>
              20
              日起默认次月，仅可导入当前月或次月。出货、调拨计划留空按0处理；分仓编码、月份和SKU编码必填。大类、物料组缺失不影响导入。
            </p>
            {templateError && (
              <p role="alert" className="danger-text">
                {templateError}
              </p>
            )}
            <button
              className="primary-button"
              disabled={templateLoading || !templateMonth}
              onClick={() => void downloadExcelTemplate()}
            >
              {templateLoading ? "正在读取计划…" : "下载模板"}
            </button>
          </div>
        </Dialog>
      )}
      {skuDetail && <Dialog title={skuDetail.kind === "transfers" ? "调拨订单明细" : "基地库存批次"} onClose={()=>setSkuDetail(null)}>
        <ReplenishmentDetailContent {...skuDetail} warehouseId={warehouseId} version={snapshot.version} enabled={!readOnlyHistory}/>
      </Dialog>}
      {dialog && (
        <Dialog title={dialogTitle(dialog)} onClose={() => dialog === "export" ? closeExport() : setDialog(null)}>
          {dialog === "columns" ? (
            <ColumnSettings
              columns={columnOrder}
              frozen={frozenColumns}
              onFrozen={setFrozenColumns}
              onReset={() => {
                setColumnOrder(DEFAULT_COLUMNS);
                setFrozenColumns(["sku", "actualQty"]);
              }}
            />
          ) : dialog === "cycle" ? (
            <PersistedCycleSettings
              key={warehouseId}
              warehouseId={warehouseId}
              warehouseName={snapshot.warehouseName}
              initial={snapshot.planning?.rules ?? []}
              saving={planningSaving || readOnlyHistory}
              onSave={(rules) => savePlanning({ action: "cycle", rules })}
            />
          ) : dialog === "draft" ? (
            <div className="draft-changes">
              <p>修改自动保留至本次页面关闭。撤销后恢复该商品的最新系统建议量。</p>
              {draft.dirty && <p role="alert">自动保存失败，请重试保存。</p>}
              {detailError && <p role="alert">{detailError}</p>}
              <div className="confirmation-table-scroll"><table className="data-table"><thead><tr><th>SKU 编码</th><th>SKU 名称</th><th>系统建议量</th><th>修改后补货量</th><th>调整备注</th><th>操作</th></tr></thead><tbody>
                {[...new Set([...Object.keys(draft.quantities),...Object.keys(draft.reasons)])].map(sku=>{
                  const row=(detailSnapshot??snapshot).replenishments.find(item=>item.sku===sku);
                  return <tr key={sku}><td>{sku}</td><td>{row?.productName??"—"}</td><td>{number(row?.recommendedQty??null)}</td><td>{number(draft.quantities[sku]??row?.recommendedQty??null)}</td><td>{draft.reasons[sku]||"—"}</td><td><button className="text-button" aria-label={`撤销 ${sku} 修改`} onClick={()=>undoDraftChange(sku)}>撤销修改</button></td></tr>;
                })}
              </tbody></table></div>
              {!Object.keys(draft.quantities).length && !Object.keys(draft.reasons).length && <p>暂无人工修改，全部使用系统建议量。</p>}
            </div>
          ) : dialog === "export" ? (
            <div className="submission-confirm">
              {exportError && <p role="alert">{exportError}</p>}
              {exportBusy ? <p role="status">正在读取全仓补货清单…</p> : exportPreview ? <>
                <p>{exportPreview.warehouseName} · {exportPreview.month} · 共 {exportPreview.rows.length} 个 SKU（仅包含补货量大于 0 的商品）。确认后导出 Excel 并清空草稿，未向业务系统下单。</p>
                {exportPreview.missing>0 && <p role="alert">{exportPreview.missing} 个 SKU 数量待核实，未纳入导出。</p>}
                <div className="confirmation-table-scroll"><table className="data-table"><thead><tr><th>SKU 编码</th><th>SKU 名称</th><th>补货量</th></tr></thead><tbody>{exportPreview.rows.map(row=><tr key={row.sku}><td>{row.sku}</td><td>{row.productName}</td><td>{number(row.quantity)}</td></tr>)}</tbody></table></div>
                <footer><button className="secondary-button" onClick={closeExport}>取消</button><button className="primary-button" onClick={exportConfirmedDraft}>确认导出</button></footer>
              </> : <button className="secondary-button" onClick={()=>void prepareExport()}>重试读取</button>}
            </div>
          ) : dialog === "import" ? (
            <ImportPreview
              rows={importRows}
              errors={importErrors}
              canApply={
                !planningSaving &&
                !readOnlyHistory &&
                importRows.length > 0 &&
                parseImportedPlans(
                  importRows,
                  snapshot.warehouseName,
                  warehousePickupCode(warehouseId),
                ).errors.length === 0
              }
              onApply={applyHumanPlanPreview}
            />
          ) : detailError ? (
            <p role="alert">{detailError}</p>
          ) : snapshot.page && !detailSnapshot ? (
            <p role="status">正在读取完整指标明细…</p>
          ) : (
            <KpiDetail kind={dialog} snapshot={detailSnapshot ?? snapshot} />
          )}
        </Dialog>
      )}
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </main>
  );
}

function ReplenishmentTableRows({
  row, warehouseId, version, onDetail,
  columns,
  frozenColumns,
  expanded,
  readOnly,
  onToggle,
  onQuantity,
  onReason,
}: {
  row: ReplenishmentRow;
  warehouseId: WarehouseId; version: string; onDetail: (value: {sku:string;kind:"transfers"|"batches";baseName?:string})=>void;
  columns: string[];
  frozenColumns: string[];
  expanded: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onQuantity: (row: ReplenishmentRow, value: number) => void;
  onReason: (row: ReplenishmentRow, value: string) => void;
}) {
  return (
    <>
      <tr className={row.urgent ? "urgent-row" : ""}>
        {columns.map((column) => (
          <td key={column} data-column={column} style={frozenStyle(column, columns, frozenColumns)} className={frozenColumnClass(column, frozenColumns)}>
            {column === "actualQty" ? (
              <ActualQuantityInput row={row} readOnly={readOnly} onQuantity={onQuantity} />
            ) : ["inTransitQty","openTransferQty"].includes(column) ? (
              (Number(replenishmentCellValue(row, column)) > 0
                ? <button className="transfer-quantity" disabled={readOnly} onClick={()=>onDetail({sku:row.sku,kind:"transfers"})}>{formatReplenishmentCell(row,column)}</button>
                : <span>{formatReplenishmentCell(row,column)}</span>)
            ) : column === "sku" ? (
              <>
                <button className="sku-link" aria-expanded={expanded} onClick={onToggle}>{row.sku}</button>
                {row.urgent && <b className="urgent-badge">急</b>}
              </>
            ) : column === "reason" ? (
              <input aria-label={`${row.sku}调减原因`} disabled={readOnly || row.recommendedQty === null} value={row.reason} onChange={event => onReason(row, event.target.value)} placeholder="调减时必填" />
            ) : column === "productName" ? (
              row.productName
            ) : column === "dueDate" ? (
              row.dueDate
            ) : (
              formatReplenishmentCell(row, column)
            )}
          </td>
        ))}
      </tr>
      {expanded && (
        <tr className="detail-row replenishment-row-detail">
          <td colSpan={columns.length}>
            <ReplenishmentSkuResources warehouseId={warehouseId} sku={row.sku} version={version} enabled={!readOnly} onAvailableClick={base=>onDetail({sku:row.sku,kind:"batches",baseName:base.baseName})}/>
          </td>
        </tr>
      )}
    </>
  );
}

function cycleLevelLabel(level: ReplenishmentRow["cycleRuleLevel"]): string {
  return (
    {
      sku: "SKU规则",
      "material-group": "物料组规则",
      category: "品类规则",
      warehouse: "分仓规则",
      default: "系统默认",
    } as const
  )[level];
}

function businessExceptionLabel(
  type: WarehouseSnapshot["businessExceptions"][number]["type"],
): string {
  return (
    {
      "season-switch": "换季标记",
      substitution: "替代关系缺失",
      "new-product": "新品标记",
      "activity-large-order": "活动/大单",
      clearance: "清仓/退市",
    } as const
  )[type];
}

function frozenColumnClass(column: string, frozen: string[]) {
  if (!frozen.includes(column)) return "";
  if (column === "actualQty") return "frozen frozen-right";
  return `frozen frozen-left ${column === "productName" ? "frozen-product" : ""}`;
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-mask"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <strong>{title}</strong>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-content">
          <FixedTableScrollbar
            viewKey={title}
            boundary=".modal-content"
            layer={90}
          />
          {children}
        </div>
      </section>
    </div>
  );
}

function dialogTitle(kind: string) {
  return (
    (
      {
        water: "库存水位详情",
        aging: "库存库龄详情",
        fulfillment: "订单履约详情",
        replenishment: "建议补货详情",
        shortage: "客户订单缺口详情",
        columns: "表格列设置",
        draft: "补货草稿",
        export: "确认补货清单",
        cycle: "补货周期配置",
        submit: "确认创建业务待办",
        import: "Excel 导入校验与预览",
      } as Record<string, string>
    )[kind] ?? "业务详情"
  );
}

function KpiDetail({ kind, snapshot }: { kind: string; snapshot: WarehouseSnapshot }) {
  const aging = useListPagination(kpiAgingRows(snapshot, kind), `${snapshot.version}:${kind}`);
  const shortage = useListPagination(kpiShortageRows(snapshot), snapshot.version);
  if (kind === "replenishment") {
    const summary = summarizeCalculatedReplenishment(snapshot);
    return <div className="modal-metrics"><div><span>{summary.partial ? "已计算部分建议补货" : "建议补货合计"}</span><strong>{number(summary.quantity)}{summary.quantity !== null ? " 件" : ""}</strong></div><div><span>已计算 / 待核实 SKU</span><strong>{summary.computedCount} / {summary.missingCount}</strong></div><p>仅汇总已有确定建议值的 SKU；缺失项未按0计入，也不代表全仓需求已完整。当前未进入计划计算的库存或订单 SKU 请同时查看数据完整性说明。数据不完整时，创建待办仍保持校验。</p>{snapshot.replenishments.filter(row => row.recommendedQty === null).map(row => <p key={row.sku}>{row.sku} · {row.productName}：{row.calculationMissing?.length ? `缺少${row.calculationMissing.join("、")}` : "计算要素待核实"}</p>)}</div>;
  }
  if (kind === "aging" || kind === "stagnant") return <div className="modal-metrics"><div><span>平均库龄</span><strong>{snapshot.metrics.averageAgeDays} 天</strong></div><div><span>大日期库存</span><strong>{number(snapshot.metrics.bigDateQty)}</strong></div><div><span>滞库库存</span><strong>{number(snapshot.metrics.stagnantQty)}</strong></div><p>{snapshot.warehouseName} · {snapshot.snapshotTime}；{kind === "stagnant" ? "以下为库龄 ≥ 90 天的库存" : "以下为库龄 ≥ 60 天的库存"}，按 SKU 汇总。批次可在货龄结构页展开核对。</p><div className="detail-grid">{aging.rows.map(row => <div key={row.sku}><strong>{row.sku} · {row.productName}</strong><span>{kind === "stagnant" ? "滞库" : "大日期"}数量 {number(row.quantity)}</span><span>其中90天以上 {number(row.stagnantQty)}</span></div>)}</div>{!aging.rows.length && <p>当前没有符合该货龄范围的库存。</p>}<DataPagination ariaLabel="货龄指标明细分页" itemLabel="SKU" {...aging.props} /></div>;
  if (kind === "shortage") return <div className="modal-metrics"><div><span>缺口数量</span><strong>{number(snapshot.metrics.shortageQty)}</strong></div><div><span>缺口 SKU 数</span><strong>{snapshot.metrics.shortageSkuCount}</strong></div><p>{snapshot.metricScopes?.pendingOrders ?? "数据来自当前仓客户订单行"}；缺口按订单量减已分配量计算，不等于当月订单量减发货量。</p><div className="detail-grid">{shortage.rows.map((row, index) => <div key={`${row.orderNo}-${row.sku}-${index}`}><strong>{row.orderNo} · {row.sku} · {row.productName}</strong><span>客户：{row.customer}</span><span>需求 {number(row.orderedQty)} / 已占用 {number(row.allocatedQty)}</span><span>剩余需求 {number(row.shortageQty)}</span></div>)}</div>{!shortage.rows.length && <p>当前没有存在缺口的订单行。</p>}<DataPagination ariaLabel="订单缺口明细分页" itemLabel="订单行" {...shortage.props} /></div>;
  return <div className="modal-metrics"><div><span>库存</span><strong>{number(snapshot.metrics.inventoryQty)}</strong></div><div><span>在途</span><strong>{number(snapshot.metrics.inTransitQty)}</strong></div><div><span>履约率</span><strong>{snapshot.metrics.fulfillmentRate}</strong></div><div><span>建议补货</span><strong>{number(snapshot.metrics.recommendedQty)}</strong></div><p>来源：{snapshot.dataSource}；库存快照：{snapshot.snapshotTime}。{snapshot.metricScopes?.fulfillment}；{snapshot.metricScopes?.pendingOrders}。{snapshot.dataQuality?.inTransit.reason}</p></div>;
}

function ColumnSettings({
  columns,
  frozen,
  onFrozen,
  onReset,
}: {
  columns: string[];
  frozen: string[];
  onFrozen: (value: string[]) => void;
  onReset: () => void;
}) {
  const freezable = columns.filter((column) =>
    ["sku", "productName", "actualQty"].includes(column),
  );
  return (
    <div className="settings-list">
      <p>拖动表头可调整顺序；产品信息固定在左侧，实际补货量固定在右侧。</p>
      {freezable.map((column) => (
        <label key={column}>
          <input
            type="checkbox"
            checked={frozen.includes(column)}
            onChange={(event) =>
              onFrozen(
                event.target.checked
                  ? [...new Set([...frozen, column])]
                  : frozen.filter((item) => item !== column),
              )
            }
          />
          <span>{COLUMN_LABELS[column]}</span>
        </label>
      ))}
      <button className="secondary-button" onClick={onReset}>
        <RotateCcw size={15} />
        恢复默认顺序
      </button>
    </div>
  );
}

function ImportPreview({
  rows,
  errors,
  canApply,
  onApply,
}: {
  rows: Array<Record<string, string | number>>;
  errors: ImportError[];
  canApply: boolean;
  onApply: () => void;
}) {
  return (
    <div className="import-preview">
      {errors.length ? (
        <div className="import-errors">
          <strong>发现 {errors.length} 个错误</strong>
          {errors.map((error, index) => (
            <p key={index}>
              第 {error.row} 行 · {error.field}：{error.message}
            </p>
          ))}
        </div>
      ) : (
        <div className="import-success">
          <Check size={18} />
          校验通过，确认后开始试算，尚未保存。
        </div>
      )}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {IMPORT_FIELDS.map((field) => (
                <th key={field}>{field}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 20).map((row, index) => (
              <tr key={index}>
                {IMPORT_FIELDS.map((field) => (
                  <td key={field}>{row[field]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="import-actions">
        <span>
          共 {rows.length} 行；预览前 20
          行。按分仓和月份整包替换；该月缺行不会回补同步数据。其他月份保留。空白计划量按确认
          0 处理。
        </span>
        <button
          className="primary-button"
          disabled={!canApply}
          onClick={onApply}
        >
          确认导入并重算
        </button>
      </footer>
    </div>
  );
}
export default BranchInventoryAgent;

function frozenStyle(column:string,columns:string[],frozen:string[]){const offset=frozenColumnOffset(column,columns,frozen);return offset.left===undefined?offset:{left:`var(--frozen-left-${column}, ${offset.left}px)`};}

function ActualQuantityInput({ row, readOnly, onQuantity }: {
  row: ReplenishmentRow; readOnly: boolean;
  onQuantity: (row: ReplenishmentRow, value: number) => void;
}) {
  const [text, setText] = useState(String(row.actualQty ?? ""));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(String(row.actualQty ?? "")); }, [row.actualQty, row.sku]);
  const parsed = parseActualQuantity(text);
  const changed = parsed !== null && row.recommendedQty !== null && parsed !== row.recommendedQty;
  const invalid = text !== "" && parsed === null;
  function commit() {
    editing.current = false;
    if (parsed === null) { setText(String(row.actualQty ?? "")); return; }
    setText(String(parsed));
    if (parsed !== row.actualQty) onQuantity(row, parsed);
  }
  return <input aria-label={`${row.sku} 实际补货量`} aria-invalid={invalid}
    disabled={readOnly || row.recommendedQty === null}
    className={`quantity-input${changed ? " changed" : ""}${invalid || (parsed !== null && row.recommendedQty !== null && parsed < row.recommendedQty && !row.reason) ? " invalid" : ""}`}
    type="text" inputMode="numeric" value={text}
    placeholder={row.recommendedQty === null ? "待核实" : undefined}
    onFocus={() => { editing.current = true; }}
    onChange={event => setText(event.target.value)} onBlur={commit}
    onKeyDown={event => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") { setText(String(row.actualQty ?? "")); editing.current = false; }
    }} />;
}

function balancedHeader(label: string) {
  const chars = Array.from(label);
  if (chars.length <= 5 || chars.length > 10) return <span>{label}</span>;
  const split = Math.ceil(chars.length / 2);
  return <span>{chars.slice(0, split).join("")}<br />{chars.slice(split).join("")}</span>;
}
