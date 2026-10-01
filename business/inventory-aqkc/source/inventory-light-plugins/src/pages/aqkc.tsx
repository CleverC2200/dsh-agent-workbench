import { DashboardOverviewSkeleton, DashboardTableSkeleton } from "../dsh-ui/workbench-loading";
import {DATA_PERMISSION_MESSAGE, queryErrorText} from '../query-error.js';
import { usePageFilter } from "../native/page-filter.tsx";

import { DailyReportButton } from "./aqkc/components/analytics/daily-report-dialog.tsx";

import { ask as askDsh, reportElements } from "../channel.js";

import { updateContext, removeContextPart, pageContext as reportContext } from "../native/context.ts";

import {
  defaultSkuRisks,
  skuDetailPage,
  type SkuSort,
} from "../../../aqkc/web/src/lib/workbench-sku-filter.ts";

import {
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button, Dropdown, Menu } from "../dsh-ui/controls";

import { IconDown } from "../dsh-ui/icons";

import { createRuntimeId } from "../../../aqkc/web/src/lib/runtime-id.ts";

import { FloatingTableScrollbar } from "./aqkc/components/ui/floating-table-scrollbar.tsx";

import { DataPagination } from "../dsh-ui/controls";

import { withAppBasePath } from "../../../aqkc/web/src/lib/app-base-path.ts";

import {
  dashboardTabFetchGroup,
  dashboardTabResultNames,
  type DashboardTabName,
} from "../../../aqkc/web/src/lib/dashboard-tab-request-plan.ts";

import { sanitizeUserVisibleCopy } from "../../../aqkc/web/src/lib/user-visible-copy.js";

import {
  baseCategoryDetailState,
  categoryBaseDetailState,
} from "../../../aqkc/web/src/lib/workbench-drill-state.ts";

import {
  loadInitialDashboardPayload,
  loadSelectedDashboardPayload,
} from "../../../aqkc/web/src/lib/workbench-client-data.ts";

import {
  ALL_VISIBLE_BASES,
  workbenchBasePaths,
  selectedWorkbenchPaths,
  toggleWorkbenchPath,
} from "../../../aqkc/web/src/lib/workbench-base-selection.ts";

import { normalizeWorkspaceState } from "./aqkc/components/analytics/workspace-normalizer.ts";

import type { WorkspaceState } from "./aqkc/components/analytics/workspace-store.ts";

import styles from "./aqkc/components/inventory-operations-workbench.module.css";

type BoardTabName = "基地结构" | DashboardTabName;

type RoleKey = "platform" | "base" | "supply";

type DashboardTabTable = {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
  notice?: string;
};

type DashboardTabs = Record<DashboardTabName, DashboardTabTable>;

type ExpandedBaseDetail = {
  base: string;
  tab: DashboardTabName;
  table: DashboardTabTable | null;
  loading: boolean;
  error: string | null;
};

type ExpandedCategoryDetail = {
  category: string;
  table: DashboardTabTable | null;
  loading: boolean;
  error: string | null;
};

type ExpandedSkuDetail = {
  focusMaterial?: string;
  base: string;
  category: string;
  tab: DashboardTabName;
  table: DashboardTabTable | null;
  loading: boolean;
  error: string | null;
};

function moveTabFocus<T extends string>(
  event: KeyboardEvent<HTMLButtonElement>,
  tabs: readonly T[],
  current: T,
  onSelect: (tab: T) => void,
) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const currentIndex = Math.max(0, tabs.indexOf(current));
  const offset = event.key === "ArrowLeft" ? -1 : 1;
  const nextTab = tabs[(currentIndex + offset + tabs.length) % tabs.length];
  const tabList = event.currentTarget.parentElement;
  onSelect(nextTab);
  window.requestAnimationFrame(() => {
    tabList
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.focus();
  });
}

const boardTabs: BoardTabName[] = ["基地结构", "品类结构", "货龄结构"];

const FEATURED_INVENTORY_REPORT_PROMPT = "生成全国库存分析报告";
const DATA_READ_FAILURE_MESSAGE = "数据读取失败，请刷新重试；若仍失败，请联系管理员。";

function readFailureText(value: unknown) {
  const message = queryErrorText(value);
  return message === DATA_PERMISSION_MESSAGE ? message : DATA_READ_FAILURE_MESSAGE;
}

const roleConfig: Record<RoleKey, { name: string; quick: string[] }> = {
  platform: {
    name: "基地安全库存 Agent",
    quick: [
      FEATURED_INVENTORY_REPORT_PROMPT,
      "全国哪些基地库存高于目标？",
      "华东基地库存差额是多少？",
      "哪些SKU货龄风险最高？",
      "近30日周转最慢的品类有哪些？",
      "目前有哪些大库存需要处理？",
    ],
  },
  base: {
    name: "基地计划员",
    quick: [
      "郑州基地哪些SKU库存高于目标？",
      "郑州基地有哪些缺货风险？",
      "哪些品类货龄风险最高？",
      "近30日周转最慢的SKU有哪些？",
      "郑州基地目标库存差额是多少？",
      "帮我生成郑州基地库存日报",
    ],
  },
  supply: {
    name: "执行协同人员",
    quick: [
      "目前有哪些待反馈的协同事项？",
      "哪些协同事项已经逾期？",
      "哪些大库存事项需要优先处理？",
      "本周有哪些事项即将到期？",
      "帮我汇总当前协同进度",
      "输出待处理协同事项清单",
    ],
  },
};

export function InventoryOperationsWorkbench() {
  const [activeBoardTab, setActiveBoardTab] =
    useState<BoardTabName>("基地结构");
  const role: RoleKey = "platform";
  const [pathSelection, setPathSelection] = useState<string[] | null>(null);
  const [expandedBaseDetail, setExpandedBaseDetail] =
    useState<ExpandedBaseDetail | null>(null);
  const [expandedCategoryDetail, setExpandedCategoryDetail] =
    useState<ExpandedCategoryDetail | null>(null);
  const [expandedSkuDetail, setExpandedSkuDetail] =
    useState<ExpandedSkuDetail | null>(null);
  const [dashboardWorkspace, setDashboardWorkspaceState] =
    useState<WorkspaceState | null>(null);
  const [scopedOverview, setScopedOverview] = useState<{
    key: string;
    workspace: WorkspaceState | null;
    error: string | null;
  } | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardTabs, setDashboardTabs] =
    useState<Partial<DashboardTabs> | null>(null);
  const [dashboardTabsError, setDashboardTabsError] = useState<string | null>(
    null,
  );
  const [dashboardTabsLoading, setDashboardTabsLoading] =
    useState<DashboardTabName | null>(null);
  const boardRef = useRef<HTMLElement>(null);
  const dashboardTabRequestsRef = useRef(new Map<string, Promise<void>>());
  const dashboardTabControllersRef = useRef(new Map<string, AbortController>());
  const dashboardTabLoadedGroupsRef = useRef(new Set<string>());
  const dashboardTabInteractiveGroupsRef = useRef(new Set<string>());
  const baseDetailRequestRef = useRef(0);
  const categoryDetailRequestRef = useRef(0);
  const hierarchySkuRequestRef = useRef(0);
  const activeRole = roleConfig[role];

  const basePaths = useMemo(
    () => workbenchBasePaths(dashboardWorkspace?.table.rows ?? []),
    [dashboardWorkspace],
  );
  const paths = useMemo(
    () => selectedWorkbenchPaths(basePaths, pathSelection),
    [basePaths, pathSelection],
  );
  usePageFilter(
    {
      allowedFields: ["bases", "tab"],
      loading: dashboardLoading,
      bases: basePaths,
      selectedBases: paths,
      tabs: ["基地结构", "品类结构", "货龄结构"],
      tab: activeBoardTab,
    },
    (args) => {
      if (args.bases !== undefined) setPathSelection(args.bases);
      if (args.tab !== undefined) setActiveBoardTab(args.tab);
      baseDetailRequestRef.current++;
      categoryDetailRequestRef.current++;
      hierarchySkuRequestRef.current++;
      setExpandedBaseDetail(null);
      setExpandedCategoryDetail(null);
      setExpandedSkuDetail(null);
    },
  );
  const realBoardTable = dashboardWorkspace
    ? {
        headers: dashboardWorkspace.table.columns.map((column) => column.label),
        rows: dashboardWorkspace.table.rows.map((row) => ({
          id: String(row.level ?? row.base ?? row.name ?? JSON.stringify(row)),
          cells: dashboardWorkspace.table.columns.map((column) =>
            String(row[column.key] ?? "-"),
          ),
          tone: String(row.warningTone ?? "neutral"),
        })),
      }
    : null;
  const activeTabTable =
    activeBoardTab === "基地结构"
      ? null
      : dashboardTabs?.[activeBoardTab as keyof DashboardTabs];
  const activeTable =
    activeBoardTab === "基地结构"
      ? realBoardTable
      : activeTabTable
        ? {
            headers: activeTabTable.columns.map((column) => column.label),
            rows: activeTabTable.rows.map((row, index) => ({
              id: String(row.level ?? index),
              cells: activeTabTable.columns.map((column) =>
                String(row[column.key] ?? "-"),
              ),
              tone: "neutral",
            })),
          }
        : null;
  const activeTabLoading =
    activeBoardTab !== "基地结构" && dashboardTabsLoading === activeBoardTab;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setDashboardLoading(true);
    loadInitialDashboardPayload(controller.signal)
      .then((payload) => {
        if (!active) return;
        const workspace = normalizeWorkspaceState(payload?.workspace);
        if (!workspace) throw new Error("数据暂时无法展示，请刷新后重试。");
        setDashboardWorkspaceState(workspace);
        setDashboardError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDashboardError(
          sanitizeUserVisibleCopy(
            error instanceof Error
              ? error.message
              : "库存数据加载失败，请稍后重试。",
          ),
        );
      })
      .finally(() => {
        if (active) setDashboardLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  const loadDashboardTab = useCallback(
    (requestedTab: DashboardTabName, interactive: boolean) => {
      if (!paths.length) return Promise.resolve();
      const group = dashboardTabFetchGroup(requestedTab);
      const baseScope =
        requestedTab === "品类结构"
          ? paths.map((path) => path.replace(/基地$/u, "")).join(",")
          : "";
      const requestKey = `${group}:${baseScope || "all"}`;
      if (dashboardTabLoadedGroupsRef.current.has(requestKey))
        return Promise.resolve();

      if (interactive) {
        dashboardTabInteractiveGroupsRef.current.add(requestKey);
        setDashboardTabsLoading(requestedTab);
        setDashboardTabsError(null);
      }

      const pendingRequest = dashboardTabRequestsRef.current.get(requestKey);
      if (pendingRequest) return pendingRequest;

      const controller = new AbortController();
      dashboardTabControllersRef.current.set(requestKey, controller);
      const query = new URLSearchParams({ tab: requestedTab });
      if (baseScope) query.set("base", baseScope);
      const request = fetch(
        withAppBasePath(`/api/inventory/dashboard-tabs?${query.toString()}`),
        {
          signal: controller.signal,
          headers: { "X-Client-Request-Id": createRuntimeId("workbench-tabs") },
        },
      )
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as {
            tabs?: Partial<DashboardTabs>;
            error?: unknown;
          } | null;
          const nextTabs: Partial<DashboardTabs> = {};
          for (const tabName of dashboardTabResultNames(requestedTab)) {
            const table = payload?.tabs?.[tabName];
            if (table) nextTabs[tabName] = table;
          }
          if (!response.ok || !nextTabs[requestedTab]) {
            throw new Error(
              sanitizeUserVisibleCopy(
                typeof payload?.error === "string"
                  ? payload.error
                  : "页面加载失败，请稍后重试。",
              ),
            );
          }
          setDashboardTabs((current) => ({ ...(current ?? {}), ...nextTabs }));
          dashboardTabLoadedGroupsRef.current.add(requestKey);
          setDashboardTabsError(null);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          if (dashboardTabInteractiveGroupsRef.current.has(requestKey)) {
            setDashboardTabsError(
              sanitizeUserVisibleCopy(
                error instanceof Error
                  ? error.message
                  : "页面加载失败，请稍后重试。",
              ),
            );
          }
        })
        .finally(() => {
          dashboardTabRequestsRef.current.delete(requestKey);
          dashboardTabControllersRef.current.delete(requestKey);
          dashboardTabInteractiveGroupsRef.current.delete(requestKey);
          if (!controller.signal.aborted) {
            setDashboardTabsLoading((current) =>
              current && dashboardTabFetchGroup(current) === group
                ? null
                : current,
            );
          }
        });
      dashboardTabRequestsRef.current.set(requestKey, request);
      return request;
    },
    [paths],
  );
  useEffect(() => {
    if (activeBoardTab === "基地结构" || dashboardTabs?.[activeBoardTab])
      return;
    void loadDashboardTab(activeBoardTab, true);
  }, [activeBoardTab, dashboardTabs, loadDashboardTab]);
  useEffect(
    () => () => {
      for (const controller of dashboardTabControllersRef.current.values())
        controller.abort();
      dashboardTabControllersRef.current.clear();
      dashboardTabRequestsRef.current.clear();
    },
    [],
  );
  const toggleBaseDetail = useCallback(
    async (base: string, tab: DashboardTabName, forceOpen = false) => {
      categoryDetailRequestRef.current += 1;
      hierarchySkuRequestRef.current += 1;
      setExpandedCategoryDetail(null);
      setExpandedSkuDetail(null);
      if (!forceOpen && expandedBaseDetail?.base === base && expandedBaseDetail.tab === tab) {
        baseDetailRequestRef.current += 1;
        setExpandedBaseDetail(null);
        return;
      }
      const requestSequence = ++baseDetailRequestRef.current;
      setExpandedBaseDetail({
        base,
        tab,
        table: null,
        loading: true,
        error: null,
      });
      try {
        const response = await fetch(
          withAppBasePath(
            `/api/inventory/dashboard-tabs?base=${encodeURIComponent(base)}&tab=${encodeURIComponent(tab)}`,
          ),
          {
            headers: { "X-Client-Request-Id": createRuntimeId("base-detail") },
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          tabs?: Partial<DashboardTabs>;
          error?: unknown;
        } | null;
        if (requestSequence !== baseDetailRequestRef.current) return;
        if (!response.ok) {
          throw new Error(
            sanitizeUserVisibleCopy(
              typeof payload?.error === "string"
                ? payload.error
                : "详细数据加载失败，请稍后重试。",
            ),
          );
        }
        setExpandedBaseDetail({
          base,
          tab,
          table: payload?.tabs?.[tab] ?? null,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (requestSequence !== baseDetailRequestRef.current) return;
        setExpandedBaseDetail({
          base,
          tab,
          table: null,
          loading: false,
          error: sanitizeUserVisibleCopy(
            error instanceof Error
              ? error.message
              : "详细数据加载失败，请稍后重试。",
          ),
        });
      }
    },
    [expandedBaseDetail?.base, expandedBaseDetail?.tab],
  );
  const toggleCategoryDetail = useCallback(
    async (category: string) => {
      baseDetailRequestRef.current += 1;
      hierarchySkuRequestRef.current += 1;
      setExpandedBaseDetail(null);
      setExpandedSkuDetail(null);
      if (expandedCategoryDetail?.category === category) {
        categoryDetailRequestRef.current += 1;
        setExpandedCategoryDetail(null);
        return;
      }
      const requestSequence = ++categoryDetailRequestRef.current;
      setExpandedCategoryDetail({
        category,
        table: null,
        loading: true,
        error: null,
      });
      try {
        const query = new URLSearchParams({
          category,
          tab: "品类结构",
          level: "base",
        });
        if (paths.length > 0) {
          query.set(
            "base",
            paths.map((path) => path.replace(/基地$/u, "")).join(","),
          );
        }
        const response = await fetch(
          withAppBasePath(`/api/inventory/dashboard-tabs?${query.toString()}`),
          {
            headers: {
              "X-Client-Request-Id": createRuntimeId("category-detail"),
            },
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          tabs?: Partial<DashboardTabs>;
          error?: unknown;
        } | null;
        if (requestSequence !== categoryDetailRequestRef.current) return;
        if (!response.ok) {
          throw new Error(
            sanitizeUserVisibleCopy(
              typeof payload?.error === "string"
                ? payload.error
                : "基地库存数据暂不可用，请稍后重试。",
            ),
          );
        }
        setExpandedCategoryDetail({
          category,
          table: payload?.tabs?.["品类结构"] ?? null,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (requestSequence !== categoryDetailRequestRef.current) return;
        setExpandedCategoryDetail({
          category,
          table: null,
          loading: false,
          error: sanitizeUserVisibleCopy(
            error instanceof Error
              ? error.message
              : "基地库存数据暂不可用，请稍后重试。",
          ),
        });
      }
    },
    [expandedCategoryDetail?.category, paths],
  );
  const toggleHierarchySkuDetail = useCallback(
    async (tab: DashboardTabName, base: string, category: string, focusMaterial?: string) => {
      const matchesCurrent =
        expandedSkuDetail?.tab === tab &&
        expandedSkuDetail.base === base &&
        expandedSkuDetail.category === category;
      if (matchesCurrent && !focusMaterial) {
        hierarchySkuRequestRef.current += 1;
        setExpandedSkuDetail(null);
        return;
      }
      const requestSequence = ++hierarchySkuRequestRef.current;
      setExpandedSkuDetail({ focusMaterial,
        base,
        category,
        tab,
        table: null,
        loading: true,
        error: null,
      });
      try {
        const response = await fetch(
          withAppBasePath(
            `/api/inventory/dashboard-tabs?base=${encodeURIComponent(base)}&category=${encodeURIComponent(category)}&tab=${encodeURIComponent(tab)}`,
          ),
          {
            headers: {
              "X-Client-Request-Id": createRuntimeId("hierarchy-sku-detail"),
            },
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          tabs?: Partial<DashboardTabs>;
          error?: unknown;
        } | null;
        if (requestSequence !== hierarchySkuRequestRef.current) return;
        if (!response.ok) {
          throw new Error(
            sanitizeUserVisibleCopy(
              typeof payload?.error === "string"
                ? payload.error
                : "SKU 数据暂不可用，请稍后重试。",
            ),
          );
        }
        setExpandedSkuDetail({ focusMaterial,
          base,
          category,
          tab,
          table: payload?.tabs?.[tab] ?? null,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (requestSequence !== hierarchySkuRequestRef.current) return;
        setExpandedSkuDetail({ focusMaterial,
          base,
          category,
          tab,
          table: null,
          loading: false,
          error: sanitizeUserVisibleCopy(
            error instanceof Error
              ? error.message
              : "SKU 数据暂不可用，请稍后重试。",
          ),
        });
      }
    },
    [
      expandedSkuDetail?.base,
      expandedSkuDetail?.category,
      expandedSkuDetail?.tab,
    ],
  );
  const togglePath = (path: string) => {
    baseDetailRequestRef.current += 1;
    categoryDetailRequestRef.current += 1;
    hierarchySkuRequestRef.current += 1;
    for (const requestKey of dashboardTabLoadedGroupsRef.current) {
      if (requestKey.startsWith("safety-stock:"))
        dashboardTabLoadedGroupsRef.current.delete(requestKey);
    }
    for (const [requestKey, controller] of dashboardTabControllersRef.current) {
      if (!requestKey.startsWith("safety-stock:")) continue;
      controller.abort();
      dashboardTabControllersRef.current.delete(requestKey);
      dashboardTabRequestsRef.current.delete(requestKey);
      dashboardTabInteractiveGroupsRef.current.delete(requestKey);
    }
    setDashboardTabs((current) => {
      if (!current) return current;
      const { 品类结构: _removedCategory, ...remaining } = current;
      return remaining;
    });
    setPathSelection(toggleWorkbenchPath(basePaths, paths, path));
    setActiveBoardTab("基地结构");
    setExpandedBaseDetail(null);
    setExpandedCategoryDetail(null);
    setExpandedSkuDetail(null);
  };
  const allBasesSelected =
    basePaths.length > 0 && paths.length === basePaths.length;
  const selectedPathKeys = allBasesSelected
    ? [ALL_VISIBLE_BASES, ...paths]
    : paths;
  const pathTitle = dashboardLoading
    ? "基地加载中"
    : basePaths.length === 0
      ? "暂无可见基地"
      : paths.length === 0
        ? "未选择基地"
        : paths.length === 1
          ? paths[0]
          : allBasesSelected
            ? "全部可见基地"
            : `${paths.length}个基地`;
  const overviewKey = paths.join(",");
  const overviewWorkspace = allBasesSelected
    ? dashboardWorkspace
    : scopedOverview?.key === overviewKey
      ? scopedOverview.workspace
      : null;
  const overviewError =
    !allBasesSelected && scopedOverview?.key === overviewKey
      ? scopedOverview.error
      : null;
  const overviewLoading =
    paths.length > 0 && !overviewWorkspace && !overviewError;
  useEffect(() => {
    const state = dashboardLoading || overviewLoading ? "loading" : dashboardError || overviewError ? "error" : overviewWorkspace ? "ready" : "empty";
    updateContext("queryState", {state, scope:overviewKey, message:dashboardError ?? overviewError ?? (state === "loading" ? "正在查询基地库存" : state === "empty" ? "当前范围没有可显示数据" : undefined)});
    updateContext("stockOverview", {scope:overviewKey, state, kpis:state === "ready" ? overviewWorkspace?.kpis : undefined, rows:state === "ready" ? overviewWorkspace?.table.rows : undefined});
    return reportElements("stock", state === "ready" ? (overviewWorkspace?.table.rows ?? []).map((row, index) => ({id:`stock:${row.level ?? row.base ?? index}`, role:"row", label:String(row.level ?? row.base ?? index), value:`当前库存：${row.current ?? "-"}；目标库存：${row.target ?? "-"}`})) : [], undefined);
  }, [dashboardLoading, dashboardError, overviewKey, overviewWorkspace, overviewLoading, overviewError]);
  useEffect(() => {
    updateContext("inventoryInsight", {
      scope: overviewKey, status: overviewLoading ? "loading" : overviewError ? "error" : overviewWorkspace ? "ready" : "empty",
      analysis: overviewWorkspace?.workbench?.overallAnalysis ?? null,
      rule: "基地×品类：有当前订单缺口按缺口排序，否则按目标偏差或货龄排序；缺失不按零处理，不能确认具体SKU原因。",
    });
  }, [overviewKey, overviewWorkspace, overviewLoading, overviewError]);
  useEffect(() => {
    if (!dashboardWorkspace || allBasesSelected || !paths.length) return;
    const controller = new AbortController();
    let active = true;
    loadSelectedDashboardPayload(paths, controller.signal)
      .then((payload) => {
        if (!active) return;
        const workspace = normalizeWorkspaceState(payload.workspace);
        if (!workspace) throw new Error("所选基地指标暂时无法展示，请重试。");
        setScopedOverview({ key: overviewKey, workspace, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setScopedOverview({
          key: overviewKey,
          workspace: null,
          error: sanitizeUserVisibleCopy(
            error instanceof Error
              ? error.message
              : "所选基地指标加载失败，请重试。",
          ),
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [allBasesSelected, dashboardWorkspace, overviewKey, paths]);
  return (
    <div className={styles.shell}>
      <section
        ref={boardRef}
        className={styles.boardPanel}
        aria-label="业务看板"
      >
        <header className={styles.boardHeader}>
          <div>
            <h2>
              {sanitizeUserVisibleCopy(
                dashboardWorkspace?.title ?? "库存运营看板",
              )}
            </h2>
          </div>
          <div className={styles.boardHeaderActions}>
            <Button size="small" onClick={() => window.location.reload()} aria-label="刷新库存数据">
              刷新数据
            </Button>
            <DailyReportButton
              bases={basePaths.map((base) => base.replace(/基地$/u, ""))}
              initialBase={paths[0]?.replace(/基地$/u, "")}
              onBoard={(risk, base) => {
                if (base && basePaths.includes(`${base}基地`)) setPathSelection([`${base}基地`]);
                setExpandedBaseDetail(null); setExpandedCategoryDetail(null); setExpandedSkuDetail(null);
                setActiveBoardTab(risk?.module === "age" ? "货龄结构" : "基地结构");
                if (!risk) return;
                const tab = risk.module === "age" ? "货龄结构" : "品类结构";
                void toggleBaseDetail(risk.base, tab, true);
                if (risk.category) void toggleHierarchySkuDetail(tab, risk.base, risk.category, risk.material);
              }}
              onAsk={(question) => {
                void askDsh(question, reportContext()).catch((error) =>
                  window.dispatchEvent(
                    new CustomEvent("gea-query-warning", {
                      detail: { message: error.message },
                    }),
                  ),
                );
              }}
            />
            <Dropdown
              trigger="click"
              position="bl"
              droplist={
                <Menu
                  className={styles.objectMenu}
                  selectedKeys={selectedPathKeys}
                  onClickMenuItem={(key) => togglePath(String(key))}
                >
                  {[ALL_VISIBLE_BASES, ...basePaths].map((path) => {
                    const checked = selectedPathKeys.includes(path);
                    return (
                      <Menu.Item key={path}>
                        <span className={styles.objectOption}>
                          <span
                            className={`${styles.objectCheckbox} ${checked ? styles.objectCheckboxChecked : ""}`}
                            aria-hidden="true"
                          >
                            {checked ? "✓" : ""}
                          </span>
                          {path === ALL_VISIBLE_BASES ? "全部可见基地" : path}
                        </span>
                      </Menu.Item>
                    );
                  })}
                </Menu>
              }
            >
              <Button
                size="small"
                disabled={dashboardLoading || basePaths.length === 0}
                className={styles.objectSelect}
                aria-label={`切换当前对象，当前为${pathTitle}`}
              >
                <span>{pathTitle}</span>
                <IconDown />
              </Button>
            </Dropdown>
          </div>
        </header>
        <div id="inventory-board-content" className={styles.boardScroll}>
          <FloatingTableScrollbar />
          <>
            {dashboardLoading || overviewLoading ? (
              <DashboardOverviewSkeleton compact />
            ) : dashboardError || overviewError ? (
              <DataState>{readFailureText(dashboardError ?? overviewError)}</DataState>
            ) : !paths.length ? (
              <DataState>
                {basePaths.length
                  ? "请选择基地查看指标。"
                  : "暂无可见基地指标。"}
              </DataState>
            ) : overviewWorkspace ? (
              <>
                <div className={styles.kpiGrid}>
                  {(
                    overviewWorkspace.workbench?.cards ??
                    overviewWorkspace.kpis.map((item) => ({
                      title: item.label,
                      value: item.value,
                      tone:
                        item.tone === "negative"
                          ? ("red" as const)
                          : ("neutral" as const),
                      helpers: [{ label: "变化", value: item.delta }],
                    }))
                  ).map((card) => (
                    <Kpi
                      key={card.title}
                      title={card.title}
                      value={card.value}
                      tone={card.tone}
                      helpers={card.helpers}
                    />
                  ))}
                </div>
                <section className={styles.summaryBox} aria-label="AI 洞察">
                  <div className={styles.insightHeading}><span aria-hidden="true">✦</span><strong>AI 洞察</strong><small>库存经营分析</small></div>
                  <div className={styles.insightSummary}>
                    {sanitizeUserVisibleCopy(overviewWorkspace.workbench?.overallAnalysis || "当前缺少经营分析所需数据。").split("\n").filter(Boolean).map((line, index) => {
                      const colon = line.indexOf("：");
                      return <p key={index}>{colon > 0 ? <><strong>{line.slice(0, colon)}：</strong>{line.slice(colon + 1)}</> : line}</p>;
                    })}
                  </div>
                </section>
              </>
            ) : null}
            <div
              className={styles.boardTabs}
              role="tablist"
              aria-label="查看方式"
            >
              {boardTabs.map((tab) => (
                <button
                  type="button"
                  id={`inventory-tab-${tab}`}
                  role="tab"
                  aria-selected={activeBoardTab === tab}
                  tabIndex={activeBoardTab === tab ? 0 : -1}
                  aria-controls="inventory-table-content"
                  aria-busy={tab !== "基地结构" && dashboardTabsLoading === tab}
                  onPointerEnter={() => {
                    if (tab !== "基地结构") void loadDashboardTab(tab, false);
                  }}
                  onFocus={() => {
                    if (tab !== "基地结构") void loadDashboardTab(tab, false);
                  }}
                  onKeyDown={(event) =>
                    moveTabFocus(
                      event,
                      boardTabs,
                      activeBoardTab,
                      (nextTab) => {
                        baseDetailRequestRef.current += 1;
                        categoryDetailRequestRef.current += 1;
                        hierarchySkuRequestRef.current += 1;
                        setActiveBoardTab(nextTab);
                        setExpandedBaseDetail(null);
                        setExpandedCategoryDetail(null);
                        setExpandedSkuDetail(null);
                      },
                    )
                  }
                  onClick={() => {
                    if (activeBoardTab === tab) return;
                    baseDetailRequestRef.current += 1;
                    categoryDetailRequestRef.current += 1;
                    hierarchySkuRequestRef.current += 1;
                    setActiveBoardTab(tab);
                    setExpandedBaseDetail(null);
                    setExpandedCategoryDetail(null);
                    setExpandedSkuDetail(null);
                  }}
                  className={
                    activeBoardTab === tab ? styles.activeBoardTab : ""
                  }
                  key={tab}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div
              id="inventory-table-content"
              role="tabpanel"
              aria-labelledby={`inventory-tab-${activeBoardTab}`}
              aria-busy={activeTabLoading}
            >
              {activeTable &&
              (activeBoardTab === "基地结构" || activeTable.rows.length > 0) ? (
                <div className={styles.tableCard}>
                  <table>
                    <thead>
                      <tr>
                        {activeTable.headers.map((header) => (
                          <th scope="col" key={header}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeTable.rows
                        .filter(
                          (row) =>
                            paths.length > 0 &&
                            (activeBoardTab === "品类结构" ||
                              paths.some(
                                (path) =>
                                  row.cells[0] === path.replace("基地", ""),
                              )),
                        )
                        .map((row) => (
                          <Fragment key={row.id}>
                            <BoardRow
                              row={row.cells}
                              tone={row.tone}
                              onSelect={
                                activeBoardTab === "基地结构"
                                  ? () =>
                                      void toggleBaseDetail(
                                        row.cells[0],
                                        "品类结构",
                                      )
                                  : activeBoardTab === "品类结构"
                                    ? () =>
                                        void toggleCategoryDetail(row.cells[0])
                                    : () =>
                                        void toggleBaseDetail(
                                          row.cells[0],
                                          "货龄结构",
                                        )
                              }
                            />
                            {activeBoardTab === "基地结构" &&
                            expandedBaseDetail?.base === row.cells[0] &&
                            expandedBaseDetail.tab === "品类结构" ? (
                              <BaseCategoryDetail
                                base={expandedBaseDetail.base}
                                table={expandedBaseDetail.table}
                                loading={expandedBaseDetail.loading}
                                error={expandedBaseDetail.error}
                                colSpan={activeTable.headers.length}
                                onSelectCategory={(category) =>
                                  void toggleHierarchySkuDetail(
                                    "品类结构",
                                    row.cells[0],
                                    category,
                                  )
                                }
                                skuDetail={
                                  expandedSkuDetail?.base === row.cells[0] &&
                                  expandedSkuDetail.tab === "品类结构"
                                    ? expandedSkuDetail
                                    : null
                                }
                              />
                            ) : null}
                            {activeBoardTab === "品类结构" &&
                            expandedCategoryDetail?.category ===
                              row.cells[0] ? (
                              <CategoryBaseDetail
                                category={expandedCategoryDetail.category}
                                table={expandedCategoryDetail.table}
                                loading={expandedCategoryDetail.loading}
                                error={expandedCategoryDetail.error}
                                colSpan={activeTable.headers.length}
                                onSelectBase={(base) =>
                                  void toggleHierarchySkuDetail(
                                    "品类结构",
                                    base,
                                    row.cells[0],
                                  )
                                }
                                skuDetail={
                                  expandedSkuDetail?.category ===
                                    row.cells[0] &&
                                  expandedSkuDetail.tab === "品类结构"
                                    ? expandedSkuDetail
                                    : null
                                }
                              />
                            ) : null}
                            {activeBoardTab === "货龄结构" &&
                            expandedBaseDetail?.base === row.cells[0] &&
                            expandedBaseDetail.tab === "货龄结构" ? (
                              <BaseCategoryDetail
                                base={expandedBaseDetail.base}
                                table={expandedBaseDetail.table}
                                loading={expandedBaseDetail.loading}
                                error={expandedBaseDetail.error}
                                colSpan={activeTable.headers.length}
                                onSelectCategory={(category) =>
                                  void toggleHierarchySkuDetail(
                                    "货龄结构",
                                    row.cells[0],
                                    category,
                                  )
                                }
                                skuDetail={
                                  expandedSkuDetail?.base === row.cells[0] &&
                                  expandedSkuDetail.tab === "货龄结构"
                                    ? expandedSkuDetail
                                    : null
                                }
                              />
                            ) : null}
                          </Fragment>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : activeBoardTab === "基地结构" ? (
                dashboardLoading ? (
                  <DashboardTableSkeleton label="基地结构加载中" />
                ) : (
                  <DataState>
                    {dashboardError ? readFailureText(dashboardError) : "暂无基地结构数据。"}
                  </DataState>
                )
              ) : activeTabLoading ? (
                <DashboardTableSkeleton label={`${activeBoardTab}加载中`} />
              ) : dashboardTabsError ? (
                <DataState>{readFailureText(dashboardTabsError)}</DataState>
              ) : activeTabTable?.notice ? (
                <DataState>
                  {sanitizeUserVisibleCopy(activeTabTable.notice)}
                </DataState>
              ) : (
                <DataState>暂无数据。</DataState>
              )}
            </div>
          </>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  title,
  tone,
  value,
  helpers,
}: {
  title: string;
  tone: "neutral" | "red";
  value: string;
  helpers: { label: string; value: string }[];
}) {
  return (
    <article className={styles.kpiCard}>
      <div>
        <span>{title}</span>
        <b
          className={`${styles.statusPill} ${tone === "red" ? styles.red : styles.green}`}
        >
          {tone === "red" ? "需关注" : "当前值"}
        </b>
      </div>
      <strong
        title={
          title === "当前订单"
            ? "备单中订单量＋已备单未发货占用量（最新已同步快照）"
            : title === "订单满足率"
              ? "当月履约满足率；已发订单量、发货量统计当月实际发货量大于0的订单行"
              : undefined
        }
        className={`${styles.kpiValue} ${tone === "red" ? styles.toneRed : ""}`}
      >
        {value}
        {title === "当前订单" && value !== "-" ? (
          <small className={styles.kpiUnit}>件</small>
        ) : null}
      </strong>
      <dl>
        {helpers.slice(0, 2).map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd
              title={
                title === "当前订单"
                  ? item.label === "备单量"
                    ? "仅备单中订单量，不含已备单未发货"
                    : "按基地和物料比对：可用库存 −（备单中订单量 − 占用量），负结余取绝对值汇总"
                  : title === "订单满足率"
                    ? "当月实际发货量大于0的订单行：已发订单量取原订单量，发货量取实际发货量"
                    : undefined
              }
            >
              {item.value.endsWith("（部分）") ? (
                <>
                  <span className={styles.kpiHelperNumber}>
                    {item.value.slice(0, -4)}
                  </span>
                  <small className={styles.kpiHelperNote}>部分数据</small>
                </>
              ) : (
                item.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function BoardRow({
  row,
  tone: rowTone,
  onSelect,
}: {
  row: string[];
  tone: string;
  onSelect?: () => void;
}) {
  const tone =
    rowTone === "red" || row[1] === "红色"
      ? "red"
      : rowTone === "amber" ||
          rowTone === "orange" ||
          row[1] === "橙色" ||
          row[1]?.startsWith("数据缺失")
        ? "amber"
        : "green";
  return (
    <tr className={onSelect ? styles.dataRow : undefined} onClick={onSelect}>
      {row.map((value, index) => (
        <td
          key={`${row[0]}-${index}`}
          className={
            value.startsWith("+")
              ? styles.negative
              : value.startsWith("-")
                ? styles.positive
                : index === 1 && value === "红色"
                  ? styles.negative
                  : ""
          }
        >
          {index === 0 ? (
            onSelect ? (
              <button
                type="button"
                className={styles.rowAction}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect();
                }}
                aria-label={`${value}，查看详情`}
              >
                {value}
              </button>
            ) : (
              <strong>{value}</strong>
            )
          ) : index === 1 ? (
            <>
              <span
                className={`${styles.dot} ${styles[tone]}`}
                aria-hidden="true"
              />
              {value}
            </>
          ) : (
            value
          )}
        </td>
      ))}
    </tr>
  );
}

function InlineSkuDetail({
  detail,
  colSpan,
}: {
  detail: ExpandedSkuDetail;
  colSpan: number;
}) {
  const age = detail.tab === "货龄结构";
  const [risks, setRisks] = useState<string[]>(() => detail.focusMaterial ? [] : defaultSkuRisks(age));
  const [query, setQuery] = useState(detail.focusMaterial ?? "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<SkuSort>();
  const changeRisks = (values: string[]) => {
    setRisks(values);
    setPage(1);
  };
  const result = skuDetailPage(detail.table?.rows ?? [], risks, query, page, pageSize, sort);
  useEffect(() => {
    const group = "sku-detail";
    const ready = !detail.loading && !detail.error;
    updateContext("stockDetail", {base:detail.base, category:detail.category, tab:detail.tab, state:detail.loading ? "loading" : detail.error ? "error" : "ready", error:detail.error, query, risks, page, pageSize, sort, result:ready ? result : undefined});
    const unregister = reportElements(group, ready ? [
      {id:`${group}:search`, role:"field", label:"物料搜索", value:query, editable:true},
      ...result.rows.map((row, index) => ({id:`${group}:${detail.base}:${String(row.level ?? row.materialCode ?? row.sku ?? index).split(/\s/)[0]}`, role:"row", label:String(row.level ?? row.materialCode ?? row.sku ?? index).slice(0,200), value:`当前库存：${row.current ?? "-"}；目标库存：${row.target ?? "-"}`})),
    ] : [], (args: any) => {
      if (args.target !== `${group}:search` || args.kind !== "setValue" || typeof args.value !== "string" || args.value.length > 100) throw Error("不支持的明细操作");
      setQuery(args.value); setPage(1);
    });
    return () => {unregister(); removeContextPart("stockDetail");};
  }, [detail, query, risks, page, pageSize, sort]);
  if (detail.loading) {
    return (
      <tr className={styles.skuExpandedRow}>
        <td colSpan={colSpan}>
          <div className={styles.inlineDetailState} role="status">
            正在加载 SKU 数据…
          </div>
        </td>
      </tr>
    );
  }
  if (detail.error) {
    return (
      <tr className={styles.skuExpandedRow}>
        <td colSpan={colSpan}>
          <div className={styles.inlineDetailState} role="alert">
            {readFailureText(detail.error)}
          </div>
        </td>
      </tr>
    );
  }
  const columns =
    detail.table?.columns.filter((column) => column.key !== "skuCount") ?? [];
  return (
    <tr className={styles.skuExpandedRow}>
      <td colSpan={colSpan}>
        <section
          className={styles.skuDetailSection}
          aria-label={`${detail.base}${detail.category} SKU 明细`}
        >
          <div className={styles.skuFilters} aria-label="SKU 明细筛选">
            {age ? (
              <label>
                风险
                <select
                  aria-label="货龄风险"
                  value={risks[0] ?? "全部"}
                  onChange={(event) =>
                    changeRisks(
                      event.target.value === "全部" ? [] : [event.target.value],
                    )
                  }
                >
                  <option>全部</option>
                  <option>预警</option>
                  <option>正常</option>
                </select>
              </label>
            ) : (
              <details className={styles.skuRiskMenu}>
                <summary>
                  风险：{risks.length ? risks.join("、") : "全部"}
                </summary>
                <fieldset aria-label="库存风险多选">
                  <label>
                    <input
                      type="checkbox"
                      checked={!risks.length}
                      onChange={() => changeRisks([])}
                    />
                    全部
                  </label>
                  {["缺货", "库存偏低", "库存偏高", "缺失目标", "正常"].map(
                    (risk) => (
                      <label key={risk}>
                        <input
                          type="checkbox"
                          checked={risks.includes(risk)}
                          onChange={() =>
                            changeRisks(
                              risks.includes(risk)
                                ? risks.filter((value) => value !== risk)
                                : [...risks, risk],
                            )
                          }
                        />
                        {risk}
                      </label>
                    ),
                  )}
                </fieldset>
              </details>
            )}
            <label>
              SKU
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="编码或名称"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                changeRisks(defaultSkuRisks(age));
                setQuery("");
                setSort(undefined);
              }}
            >
              重置
            </button>
            <span
              className={styles.skuScope}
              title={`${detail.base} / ${detail.category}`}
            >
              {detail.base} / {detail.category} · SKU 明细
            </span>
          </div>
          {result.rows.length ? (
            <div
              className={`${styles.inlineDetailTable} ${styles.skuPagedTable}`}
            >
              <table>
                <thead>
                  <tr>
                    {columns.map((column) => {
                      const numeric = !["level", "risk", "warning"].includes(
                        column.key,
                      );
                      return (
                        <th
                          scope="col"
                          key={column.key}
                          aria-sort={
                            numeric
                              ? sort?.key === column.key
                                ? sort.direction === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"
                              : undefined
                          }
                        >
                          {numeric ? (
                            <button
                              type="button"
                              className={styles.rowAction}
                              onClick={() => {
                                setSort({
                                  key: column.key,
                                  direction:
                                    sort?.key === column.key &&
                                    sort.direction === "asc"
                                      ? "desc"
                                      : "asc",
                                });
                                setPage(1);
                              }}
                            >
                              {column.label}{" "}
                              {sort?.key === column.key
                                ? sort.direction === "asc"
                                  ? "↑"
                                  : "↓"
                                : "↕"}
                            </button>
                          ) : column.key === "level" ? (
                            "SKU"
                          ) : (
                            column.label
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, index) => (
                    <tr key={`${String(row.level ?? "sku")}-${index}`}>
                      {columns.map((column) => (
                        <td key={column.key}>
                          {String(row[column.key] ?? "-")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.inlineDetailState} role="status">
              {detail.table?.notice || "没有符合当前筛选条件的 SKU。"}
            </div>
          )}
          <DataPagination
            ariaLabel="SKU 明细分页"
            itemLabel="SKU"
            itemUnit="个"
            pageNumber={result.page}
            pageSize={result.pageSize}
            pageSizeOptions={[10, 20, 50]}
            totalCount={result.total}
            statusLabel={`第 ${result.page} / ${result.pages} 页，共 ${result.total} 个 SKU`}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </section>
      </td>
    </tr>
  );
}

function BaseCategoryDetail({
  base,
  table,
  loading,
  error,
  colSpan,
  onSelectCategory,
  skuDetail,
}: {
  base: string;
  table: DashboardTabTable | null;
  loading: boolean;
  error: string | null;
  colSpan: number;
  onSelectCategory: (category: string) => void;
  skuDetail: ExpandedSkuDetail | null;
}) {
  const state = baseCategoryDetailState({ base, table, loading, error });
  if (state.kind !== "ready") {
    return (
      <tr className={styles.expandedRow}>
        <td colSpan={colSpan}>
          <div
            className={styles.inlineDetailState}
            role={state.kind === "error" ? "alert" : "status"}
          >
            {state.kind === "error" ? readFailureText(state.message) : state.message}
          </div>
        </td>
      </tr>
    );
  }
  const categoryColumns = state.table.columns;
  return (
    <tr className={styles.expandedRow}>
      <td colSpan={colSpan}>
        <div className={styles.inlineDetailTable}>
          <table>
            <thead>
              <tr>
                {categoryColumns.map((column) => (
                  <th scope="col" key={column.key}>
                    {column.key === "level" ? "基地+大类" : column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.table.rows.map((row, index) => {
                const category = String(row.level ?? "");
                return (
                  <Fragment key={`${category}-${index}`}>
                    <tr
                      className={styles.dataRow}
                      onClick={() => onSelectCategory(category)}
                    >
                      {categoryColumns.map((column, columnIndex) => (
                        <td key={column.key}>
                          {columnIndex === 0 ? (
                            <button
                              type="button"
                              className={styles.rowAction}
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectCategory(category);
                              }}
                              aria-expanded={skuDetail?.category === category}
                              aria-label={`${category}，查看 SKU 详情`}
                            >
                              {String(row[column.key] ?? "-")}
                            </button>
                          ) : (
                            String(row[column.key] ?? "-")
                          )}
                        </td>
                      ))}
                    </tr>
                    {skuDetail?.category === category ? (
                      <InlineSkuDetail
                        key={`${skuDetail.tab}:${skuDetail.base}:${skuDetail.category}:${skuDetail.focusMaterial ?? ""}`}
                        detail={skuDetail}
                        colSpan={categoryColumns.length}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

function CategoryBaseDetail({
  category,
  table,
  loading,
  error,
  colSpan,
  onSelectBase,
  skuDetail,
}: {
  category: string;
  table: DashboardTabTable | null;
  loading: boolean;
  error: string | null;
  colSpan: number;
  onSelectBase: (base: string) => void;
  skuDetail: ExpandedSkuDetail | null;
}) {
  const state = categoryBaseDetailState({ category, table, loading, error });
  if (state.kind !== "ready") {
    return (
      <tr className={styles.expandedRow}>
        <td colSpan={colSpan}>
          <div
            className={styles.inlineDetailState}
            role={state.kind === "error" ? "alert" : "status"}
          >
            {state.kind === "error" ? readFailureText(state.message) : state.message}
          </div>
        </td>
      </tr>
    );
  }
  const baseColumns = state.table.columns;
  return (
    <tr className={styles.expandedRow}>
      <td colSpan={colSpan}>
        <div className={styles.inlineDetailTable}>
          <table>
            <thead>
              <tr>
                {baseColumns.map((column) => (
                  <th scope="col" key={column.key}>
                    {column.key === "level" ? "基地" : column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.table.rows.map((row, index) => {
                const base = String(row.level ?? "");
                return (
                  <Fragment key={`${base}-${index}`}>
                    <tr
                      className={styles.dataRow}
                      onClick={() => onSelectBase(base)}
                    >
                      {baseColumns.map((column, columnIndex) => (
                        <td key={column.key}>
                          {columnIndex === 0 ? (
                            <button
                              type="button"
                              className={styles.rowAction}
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectBase(base);
                              }}
                              aria-expanded={skuDetail?.base === base}
                              aria-label={`${base}，查看 SKU 详情`}
                            >
                              {String(row[column.key] ?? "-")}
                            </button>
                          ) : (
                            String(row[column.key] ?? "-")
                          )}
                        </td>
                      ))}
                    </tr>
                    {skuDetail?.base === base ? (
                      <InlineSkuDetail
                        key={`${skuDetail.tab}:${skuDetail.base}:${skuDetail.category}:${skuDetail.focusMaterial ?? ""}`}
                        detail={skuDetail}
                        colSpan={baseColumns.length}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

function DataState({ children }: { children?: ReactNode }) {
  return <div className={styles.dataState}>{children}</div>;
}
export default InventoryOperationsWorkbench;
